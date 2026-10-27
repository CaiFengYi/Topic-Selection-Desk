"""Two explicit stages: research stops before any recommendation request."""

import argparse
import contextlib
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from . import prompts
from .core import (Ledger, RunLock, ValidationError, canonical_url, check_research,
                   check_topics, digest, now, read_json, redact, write_json)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "validation-output"
SETTINGS_PATH = Path(__file__).with_name("settings.json")


def api_error(exc):
    if isinstance(exc, ValidationError):
        return str(exc)
    status = getattr(exc, "status_code", None)
    message = redact(str(getattr(exc, "message", type(exc).__name__)))
    return f"{type(exc).__name__} HTTP {status}: {message[:600]}"


def model_config():
    import yaml
    raw = yaml.safe_load((ROOT / "TrendRadar/config/config.yaml").read_text(encoding="utf-8"))["ai"]
    return {"model": raw["model"], "api_key": os.environ.get("AI_API_KEY") or raw.get("api_key", ""),
            "api_base": os.environ.get("AI_API_BASE") or raw.get("api_base") or "https://api.deepseek.com"}


def price_check(settings, model):
    p = settings["pricing"]
    if datetime.now(timezone.utc) > datetime.fromisoformat(p["valid_until"]):
        raise ValidationError("价格核查已过期；请重新核对官方价格并更新settings.json，停止付费调用。")
    if model["model"] not in ("deepseek/deepseek-v4-flash", "deepseek/deepseek-flash"):
        raise ValidationError("当前模型不在已核价的Flash名单，停止付费调用。")
    if model["api_base"].rstrip("/") not in ("https://api.deepseek.com", "https://api.deepseek.com/v1"):
        raise ValidationError("当前模型接入不是已核价的DeepSeek官方地址，停止付费调用。")
    for field in ("usd_cny_budget_rate", "exa_search_usd", "exa_text_per_page_usd",
                  "deepseek_input_per_million_cny", "deepseek_output_per_million_cny"):
        if not isinstance(p.get(field), (float, int)) or p[field] <= 0:
            raise ValidationError("价格配置缺失或无效。")


class Runner:
    def __init__(self, output=OUTPUT, retry_failed=False, case_scope=None):
        self.output = output
        self.settings = read_json(SETTINGS_PATH)
        self.model = model_config()
        self.ledger = Ledger(output / "ledger.json", self.settings["budget_cny"])
        self.retry_failed = retry_failed
        self.accounts_checked = False
        self.case_scope = case_scope

    def preflight(self):
        price_check(self.settings, self.model)
        if not self.model["api_key"] or not os.environ.get("EXA_API_KEY", "").strip():
            raise ValidationError("请在工作区.env.local配置AI_API_KEY和EXA_API_KEY；没有发起付费请求。")

    def check_accounts(self):
        """DeepSeek balance lookup is unbilled; do not print account amounts."""
        if self.accounts_checked:
            return
        self.preflight()
        import requests
        try:
            response = requests.get(self.model["api_base"].rstrip("/") + "/user/balance",
                                    headers={"Authorization": "Bearer " + self.model["api_key"]},
                                    timeout=(10, 20), allow_redirects=False)
            if response.status_code != 200:
                raise ValidationError(f"DeepSeek账号检查HTTP {response.status_code}；未发起付费请求。")
            if response.json().get("is_available") is not True:
                raise ValidationError("DeepSeek账号无可用余额；未发起付费请求，请在账号补充可用额度。")
            self.accounts_checked = True
            print("DeepSeek账号可用；未展示余额金额。Exa鉴权通过首次真实请求验证。", flush=True)
        except requests.RequestException as exc:
            raise ValidationError(f"账号可用性无法确认：{type(exc).__name__}；停止付费请求。") from None

    def exa(self, case, operation, body, page_count=0):
        path = self.output / case / "requests" / f"{operation}-{digest(body)}.json"
        cached = read_json(path)
        if cached is not None:
            if cached.get("error"):
                raise ValidationError("该Exa请求已有失败记录；不自动重试。" + cached["error"])
            return cached["response"]
        # The two-query limit includes previous failed attempts.
        accounting_case = self.case_scope or case
        if any(e["case"] == accounting_case and e["operation"] == operation and e["status"] == "pending"
               for e in self.ledger.data["entries"]):
            raise ValidationError("已有未确认完成的请求；保留预留，不自动重试。")
        if operation == "search" and self.ledger.attempts(accounting_case, "search") >= 2:
            raise ValidationError("已到达此事件最多两次搜索的限制。")
        if operation == "contents" and self.ledger.attempts(accounting_case, "contents") >= 1:
            raise ValidationError("此事件已请求正文批次，不重复付费。")
        self.preflight()
        self.check_accounts()
        import requests
        p = self.settings["pricing"]
        expected = p["exa_search_usd"] if operation == "search" else page_count * p["exa_text_per_page_usd"]
        reserve = expected * p["usd_cny_budget_rate"] * 2
        entry = self.ledger.reserve(accounting_case, operation, reserve)
        started = time.monotonic()
        try:
            response = requests.post("https://api.exa.ai/" + operation, json=body,
                                     headers={"x-api-key": os.environ["EXA_API_KEY"]},
                                     timeout=(15, 60), allow_redirects=False)
            if response.status_code != 200:
                raise ValidationError(f"Exa HTTP {response.status_code}，停止此请求，不自动重试。")
            data = response.json()
            cost = data.get("costDollars", {}).get("total", expected)
            self.ledger.finish(entry, float(cost) * p["usd_cny_budget_rate"], status="success",
                               cost_usd=cost, cost_basis="provider_estimate" if "costDollars" in data else "published_rate",
                               request_id=data.get("requestId"), elapsed_seconds=round(time.monotonic()-started, 3))
            write_json(path, {"request": body, "response": data})
            return data
        except Exception as exc:
            message = str(exc) if isinstance(exc, ValidationError) else type(exc).__name__
            self.ledger.finish(entry, status="failed", error=message,
                               elapsed_seconds=round(time.monotonic()-started, 3))
            write_json(path, {"request": body, "error": message})
            raise ValidationError(message) from None

    def gather(self, case, definition=None):
        directory = self.output / case
        saved = read_json(directory / "sources.json")
        if saved is not None:
            return saved
        definition = definition or self.settings["cases"][case]
        results = []
        for query in definition["queries"]:
            print(f"[{case}] Exa搜索：{query}", flush=True)
            try:
                result = self.exa(case, "search", {"query": query, "type": "auto", "numResults": 5,
                                                  "contents": {"text": False, "highlights": False}})
            except ValidationError:
                # Preserve earlier successful searches if a later search fails.
                write_json(directory / "search_results.json", results)
                raise
            results.extend(result.get("results", [])[:5])
            write_json(directory / "search_results.json", results)
        unique = {}
        for result in results:
            url = canonical_url(result.get("url"))
            if url and url not in unique:
                unique[url] = {"title": result.get("title", ""), "url": url,
                               "published_at": result.get("publishedDate"), "retrieved_at": now(),
                               "searched_at": now(), "read_at": None,
                               "status": "search_summary", "text": "",
                               "summary": "\n".join(result.get("highlights", [])), "error": None}
        # Prefer domain diversity without treating it as independent corroboration.
        chosen, deferred, hosts = [], [], set()
        for source in unique.values():
            host = urlsplit(source["url"]).hostname
            (deferred if host in hosts else chosen).append(source)
            hosts.add(host)
        chosen = (chosen + deferred)[:5]
        if not chosen:
            write_json(directory / "sources.json", [])
            raise ValidationError("搜索没有返回可用的HTTPS来源。")
        for i, source in enumerate(chosen, 1):
            source["id"] = f"S{i}"
        write_json(directory / "sources.json", chosen)
        print(f"[{case}] 读取{len(chosen)}页正文", flush=True)
        try:
            result = self.exa(case, "contents", {"urls": [s["url"] for s in chosen], "text": True,
                                               "maxAgeHours": 24, "subpages": 0}, len(chosen))
        except ValidationError as exc:
            for source in chosen:
                source.update(status="read_failed", read_at=now(), error=str(exc))
            write_json(directory / "sources.json", chosen)
            raise
        by_url = {canonical_url(r.get("url", "")): r for r in result.get("results", [])}
        statuses = {canonical_url(r.get("id", "")): r for r in result.get("statuses", [])}
        seen = {}
        for source in chosen:
            item = by_url.get(source["url"], {})
            text = item.get("text", "") or ""
            source.update(text=text, retrieved_at=now(), read_at=now(),
                          published_at=item.get("publishedDate") or source["published_at"],
                          retrieval_status=statuses.get(source["url"], {}))
            retrieval = source["retrieval_status"]
            if retrieval.get("status") not in (None, "success"):
                source.update(status="read_failed", error=f"正文服务读取失败：{retrieval.get('error') or retrieval['status']}")
            elif len(text.strip()) < 200:
                source.update(status="read_failed", error="正文缺失或过短，不能作为已读材料")
            else:
                content_hash = digest("".join(text.split()))
                if content_hash in seen:
                    source.update(status="duplicate", duplicate_of=seen[content_hash])
                else:
                    source["status"] = "body"
                    seen[content_hash] = source["id"]
        write_json(directory / "sources.json", chosen)
        return chosen

    def model_call(self, case, stage, system, payload, max_tokens):
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
        identity = {"version": prompts.VERSION, "model": self.model["model"], "messages": messages}
        key = digest(identity)
        path = self.output / case / "model" / f"{stage}-{key}.json"
        cached = read_json(path)
        if cached is not None:
            if cached.get("error"):
                if not self.retry_failed:
                    raise ValidationError("该模型请求已有失败记录；不自动重试。" + cached["error"])
                write_json(path.with_name(path.stem + f"-failure-{len(self.ledger.data['entries'])}.json"), cached)
            else:
                print(f"[{case}] 复用已保存的{stage}模型输出，不发起请求。", flush=True)
                return cached["data"], key
        self.preflight()
        self.check_accounts()
        os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
        import litellm
        from openai import OpenAI
        litellm.suppress_debug_info = True
        p = self.settings["pricing"]
        # UTF-8 bytes plus protocol overhead conservatively bound text input tokens.
        input_bound = len(json.dumps(messages, ensure_ascii=False).encode("utf-8")) + 2048
        reserve = (input_bound*p["deepseek_input_per_million_cny"] +
                   max_tokens*p["deepseek_output_per_million_cny"]) / 1_000_000
        entry = self.ledger.reserve(self.case_scope or case, stage, reserve)
        started = time.monotonic()
        try:
            # Explicit SDK client also disables retries below LiteLLM.
            with OpenAI(api_key=self.model["api_key"], base_url=self.model["api_base"],
                        max_retries=0, timeout=120) as client:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    response = litellm.completion(
                        model=self.model["model"], api_key=self.model["api_key"],
                        api_base=self.model["api_base"], client=client, messages=messages,
                        response_format={"type": "json_object"}, max_tokens=max_tokens,
                        temperature=0.4 if stage == "research" else 0.8,
                        extra_body={"thinking": {"type": "disabled"}},
                        num_retries=0, max_retries=0, timeout=120)
            usage = response.usage.model_dump() if response.usage else {}
            actual = None
            if "prompt_tokens" in usage and "completion_tokens" in usage:
                hit = usage.get("prompt_cache_hit_tokens", 0) or 0
                miss = usage.get("prompt_cache_miss_tokens")
                if miss is None:
                    miss = usage["prompt_tokens"] - hit
                actual = (miss*p["deepseek_input_per_million_cny"] +
                          hit*p["deepseek_cache_hit_per_million_cny"] +
                          usage["completion_tokens"]*p["deepseek_output_per_million_cny"]) / 1_000_000
            self.ledger.finish(entry, actual, status="success", usage=usage,
                               requested_model=self.model["model"], returned_model=response.model,
                               cost_basis="peak_rate_usage_estimate" if actual is not None else "reservation",
                               elapsed_seconds=round(time.monotonic()-started, 3))
            content = response.choices[0].message.content or ""
            write_json(path, {"raw_content": content, "usage": usage,
                              "returned_model": response.model, "finish_reason": response.choices[0].finish_reason})
            if response.choices[0].finish_reason != "stop":
                raise ValidationError("模型输出未正常结束；原始结果已保存，不自动重试。")
            data = json.loads(content)
            write_json(path, {"data": data, "usage": usage, "returned_model": response.model,
                              "finish_reason": response.choices[0].finish_reason})
            return data, key
        except Exception as exc:
            message = api_error(exc)
            if entry["status"] == "pending":
                self.ledger.finish(entry, status="failed", error=message,
                                   elapsed_seconds=round(time.monotonic()-started, 3))
            existing = read_json(path, {})
            write_json(path, {**existing, "error": message})
            raise ValidationError(message) from None

    def research(self, case):
        directory = self.output / case
        cached = read_json(directory / "research.json")
        saved_sources = read_json(directory / "sources.json")
        if (cached and cached.get("status") in ("ready", "insufficient") and
                (saved_sources is None or cached.get("source_hash") == digest(saved_sources))):
            try:
                check_research(cached["data"], saved_sources or [], case)
            except ValidationError as exc:
                write_json(directory / "research_versions" / f"{cached['input_hash']}.json", cached)
                cached.update(status="needs_review", validation_error=str(exc))
                write_json(directory / "research.json", cached)
                print(f"[{case}] 已存研究复核未通过：{exc}；保留旧版本并复用材料重新研究。", flush=True)
            else:
                print(f"[{case}] 复用研究结果（{cached['status']}）；等待选择推荐方式。", flush=True)
                return cached
        sources = self.gather(case)
        bodies = [s for s in sources if s["status"] == "body"]
        if len(bodies) < 2:
            raise ValidationError(f"只有{len(bodies)}份可读且非完全重复的正文，材料不足。")
        # Full acquired text is stored locally; the model sees a bounded excerpt.
        material = [{k: s[k] for k in ("id", "title", "url", "published_at", "status")}
                    | {"text": s["text"][:6000]} for s in bodies]
        print(f"[{case}] DeepSeek研究提词（完成后停止）", flush=True)
        data, key = self.model_call(case, "research", prompts.RESEARCH,
                                    {"case": case, "definition": self.settings["cases"][case],
                                     "cutoff": max(s["retrieved_at"] for s in sources), "sources": material}, 4096)
        check_research(data, sources, case)
        insufficient = not data["keywords"] or (case == "memory" and not data.get("comparison", {}).get("left"))
        record = {"status": "insufficient" if insufficient else "ready", "created_at": now(), "input_hash": key,
                  "source_hash": digest(sources), "prompt_version": prompts.VERSION, "data": data}
        write_json(directory / "research.json", record)
        if insufficient:
            print(f"[{case}] 关键词已保存；关键背景证据不足，本例不计为研究验收通过。", flush=True)
        if not (directory / "human_edits.json").exists():
            write_json(directory / "human_edits.json", {"user_keywords": [], "topic_notes": []})
        print(json.dumps(data["keywords"], ensure_ascii=False, indent=2), flush=True)
        return record

    def recommend(self, case, keyword_ids=None, additions=None):
        directory = self.output / case
        research = read_json(directory / "research.json")
        if not research or research.get("status") not in ("ready", "insufficient"):
            raise ValidationError("请先执行research并检查研究结果，再选择推荐方式。")
        sources = read_json(directory / "sources.json", [])
        check_research(research["data"], sources, case)
        edits_path = directory / "human_edits.json"
        edits = read_json(edits_path, {"user_keywords": [], "topic_notes": []})
        for term in additions or []:
            if term not in [k["term"] for k in edits["user_keywords"]]:
                edits["user_keywords"].append({"term": term, "meaning": "用户补充的创作线索，尚未核实"})
        all_keywords = {k["id"]: k for k in research["data"]["keywords"]}
        manual = keyword_ids is not None or bool(additions)
        selected = {} if manual else dict(all_keywords)
        for kid in keyword_ids or []:
            if kid not in all_keywords:
                raise ValidationError(f"未知关键词编号：{kid}")
            selected[kid] = all_keywords[kid]
        for i, keyword in enumerate(edits["user_keywords"], 1):
            selected[f"U{i}"] = {**keyword, "id": f"U{i}", "origin": "user", "verified": False}
        if not selected:
            raise ValidationError("没有可用于推荐的关键词；请补材料或人工添加词。")
        write_json(edits_path, edits)
        selection = {"mode": "manual" if manual else "direct", "keywords": selected,
                     "research_status": research["status"]}
        write_json(directory / "selections" / f"{digest(selection)}.json", selection)
        print(f"[{case}] DeepSeek选题推荐：{selection['mode']}", flush=True)
        data, key = self.model_call(case, "recommend", prompts.RECOMMEND,
                                    {"selection": selection, "research_gaps": research["data"]["gaps"]}, 3072)
        check_topics(data, selected)
        target = directory / "recommendations" / f"{key}.json"
        existing = read_json(target)
        if existing is not None:
            print(f"[{case}] 复用推荐轮次，保留原时间与复核意见。", flush=True)
            print(json.dumps(existing["data"], ensure_ascii=False, indent=2), flush=True)
            return existing
        record = {"status": "validated", "created_at": now(), "input_hash": key,
                  "research_hash": research["input_hash"], "selection": selection, "data": data,
                  "validation_scope": "structure_and_keyword_references", "human_review": "pending"}
        write_json(target, record)
        print(json.dumps(data, ensure_ascii=False, indent=2), flush=True)
        return record

    def report(self):
        records = {}
        for case, definition in self.settings["cases"].items():
            directory = self.output / case
            sources = read_json(directory / "sources.json", [])
            records[case] = {"title": definition["title"], "sources": sources,
                             "research": read_json(directory / "research.json"),
                             "last_error": read_json(directory / "last_error.json"),
                             "recommendations": sorted([read_json(p) for p in (directory / "recommendations").glob("*.json")],
                                                       key=lambda r: r["created_at"]),
                             "human_edits": read_json(directory / "human_edits.json", {})}
        data = {"generated_at": now(), "budget_cny": self.ledger.cap,
                "accounted_cny": self.ledger.total, "pricing": self.settings["pricing"],
                "billing_note": "API估算/公开峰值单价；含失败请求预留额，不等同于账户实际扣款。",
                "entries": self.ledger.data["entries"], "cases": records,
                "acceptance": "人工内容审核及两种推荐方式的实测状态见各例；不自动宣称全部验收完成。"}
        write_json(self.output / "report.json", data)
        lines = ["# Exa + DeepSeek 按需研究验证", "", f"更新：{data['generated_at']}", "",
                 f"累计计账/预留：**{self.ledger.total:.6f} / {self.ledger.cap:.2f} 元**。", "",
                 data["billing_note"], "", "研究和推荐分步执行；本报告不触发网络请求。", ""]
        for case, record in records.items():
            research = record["research"]
            lines += [f"## {case} · {record['title']}", "",
                      f"正文：{sum(s['status']=='body' for s in record['sources'])}；研究：{research['status'] if research else '尚未通过'}；推荐轮次：{len(record['recommendations'])}。", ""]
            if record["last_error"]:
                lines += [f"最近失败记录：{record['last_error']['error']}", ""]
            for source in record["sources"]:
                lines += [f"- {source['id']} [{source['title']}]({source['url']}) · {source['status']} · 发布时间：{source['published_at'] or '未知'} · 读取时间：{source['retrieved_at']}"]
            if research:
                d = research["data"]
                lines += ["", "### 事件定位", "", json.dumps(d["event"], ensure_ascii=False), "", "### 背景与说法", ""]
                for claim in d["background"]:
                    lines += [f"- [{claim['status']}] {claim['speaker']}：{claim['text']}（{', '.join(claim['source_ids'])}）"]
                lines += ["", "### 关键词", ""]
                for k in d["keywords"]:
                    lines += [f"- **{k['id']} · {k['term']}**：{k['meaning']}；语境：{k['stance']}；出处：{k['source_id']}",
                              f"  > {k['quote']}"]
                lines += ["", "### 原始证据链（模型分组，需人工核对）", ""]
                for group in d["evidence_groups"]:
                    lines += [f"- {group['label']}：{', '.join(group['source_ids'])}；{group.get('basis', '')}"]
                if case == "memory":
                    lines += ["", "倒挂比较：" + json.dumps(d["comparison"], ensure_ascii=False)]
                lines += ["", "材料缺口：" + "；".join(d["gaps"]), ""]
            for recommendation in record["recommendations"]:
                lines += [f"### 推荐轮次 {recommendation['input_hash']}（{recommendation['selection']['mode']}）", ""]
                review = recommendation.get("editorial_review", {})
                lines += [f"结构与关键词校验已通过；内容复核：{review.get('status', 'pending')}；人工审核：{recommendation['human_review']}。", ""]
                if review.get("issues"):
                    lines += ["复核意见：" + "；".join(review["issues"]), ""]
                for topic in recommendation["data"]["topics"]:
                    lines += [f"**{topic['id']} · {topic['title']}**", "", f"开场：{topic['opening']}", "",
                              f"问题：{topic['question']}；关联：{topic['association_reason']}", "",
                              "画面：" + "；".join(topic["visuals"]), "",
                              "待查证：" + "；".join(topic["verify_before_script"]), ""]
            if record["human_edits"]:
                lines += ["人工修改（保存在独立文件）：", "", "```json", json.dumps(record["human_edits"], ensure_ascii=False, indent=2), "```", ""]
        lines += ["## 调用记录", "", "| 事件 | 操作 | 状态 | 秒 | 计账元 |", "|---|---|---|---:|---:|"]
        for e in self.ledger.data["entries"]:
            lines += [f"| {e['case']} | {e['operation']} | {e['status']} | {e.get('elapsed_seconds', '')} | {e['accounted_cny']:.6f} |"]
        (self.output / "report.md").write_text(redact("\n".join(lines) + "\n"), encoding="utf-8")
        latest = ["# 最新直接推荐选题", "", f"更新：{data['generated_at']}", "",
                  "以下为每例最新一轮模型草稿，附助手编辑复核；科学知识尚待脚本阶段查证，人工审核待进行。", "",
                  f"累计计账及失败预留：{self.ledger.total:.6f} / {self.ledger.cap:.2f} 元。", ""]
        for case, record in records.items():
            latest += [f"## {record['title']}（{case}）", ""]
            direct = [r for r in record["recommendations"] if r["selection"]["mode"] == "direct"]
            if not direct:
                latest += ["尚未生成直接推荐。", ""]
                continue
            current = direct[-1]
            latest += [f"轮次：{current['input_hash']}；研究状态：{record['research']['status']}。", ""]
            for topic in current["data"]["topics"]:
                terms = [current["selection"]["keywords"][kid]["term"] for kid in topic["keyword_ids"]]
                latest += [f"### {topic['id']} · {topic['title']}", "", f"关键词：{'、'.join(terms)}", "",
                           f"开场：{topic['opening']}", "", f"知识问题：{topic['question']}", "",
                           "待查证：" + "；".join(topic["verify_before_script"]), ""]
            latest += ["### 助手编辑复核", ""]
            latest += ["- " + issue for issue in current.get("editorial_review", {}).get("issues", [])]
            latest += [""]
        (self.output / "latest_topics.md").write_text(redact("\n".join(latest) + "\n"), encoding="utf-8")
        print(f"报告：{self.output / 'report.md'}；计账/预留 {self.ledger.total:.6f} 元", flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Budget-limited Exa + DeepSeek validation")
    parser.add_argument("command", choices=("doctor", "research", "recommend", "report"))
    parser.add_argument("--case", choices=("all", "brakes", "fire", "memory"), default="all")
    parser.add_argument("--keywords", help="人工勾选的关键词编号，逗号分隔，例如K1,K3")
    parser.add_argument("--add-keyword", action="append", default=[], help="人工补充的创作线索，可重复")
    parser.add_argument("--retry-failed", action="store_true", help="显式重试失败的模型请求，费用仍计入同一账本")
    parser.add_argument("--online", action="store_true", help="体检时额外查询DeepSeek账号可用性，不展示余额")
    args = parser.parse_args(argv)
    runner = Runner(retry_failed=args.retry_failed)
    if args.command == "doctor":
        try:
            runner.preflight()
            if args.online:
                runner.check_accounts()
            # 5 pages * 6000 CJK characters * 3 UTF-8 bytes, plus prompt overhead.
            p = runner.settings["pricing"]
            projected = 3 * ((2*p["exa_search_usd"]+5*p["exa_text_per_page_usd"])*p["usd_cny_budget_rate"]*2 +
                             (120000*p["deepseek_input_per_million_cny"]+7168*p["deepseek_output_per_million_cny"])/1_000_000)
            print(f"配置就绪；模型：{runner.model['model']}；首轮三例预留估算约{projected:.3f}元，上限5元。")
            print("已查询免费账号接口；未调用收费API。" if args.online else
                  "密钥仅检查存在性；账号鉴权在首次真实请求中验证。未请求API。")
            return 0
        except ValidationError as exc:
            print(redact(str(exc)))
            return 2
    failed = False
    with RunLock(runner.output):
        # Another process may have spent money after Runner was constructed.
        runner.ledger = Ledger(runner.output / "ledger.json", runner.settings["budget_cny"])
        cases = list(runner.settings["cases"]) if args.case == "all" else [args.case]
        if args.command == "recommend" and args.case == "all" and (args.keywords or args.add_keyword):
            print("人工选词请指定单个--case，避免不同事件的编号混用。")
            return 2
        try:
            if args.command != "report":
                for case in cases:
                    try:
                        if args.command == "research":
                            result = runner.research(case)
                            if result["status"] == "insufficient":
                                failed = True
                        else:
                            ids = [k.strip() for k in args.keywords.split(",") if k.strip()] if args.keywords is not None else None
                            runner.recommend(case, ids, args.add_keyword)
                    except (ValidationError, ValueError, KeyError, TypeError) as exc:
                        message = str(exc) if isinstance(exc, ValidationError) else type(exc).__name__
                        write_json(runner.output / case / "last_error.json", {"at": now(), "stage": args.command, "error": message})
                        print(f"[{case}] 未通过：{message}", flush=True)
                        failed = True
                        if any(code in message for code in ("HTTP 401", "HTTP 402", "HTTP 429", "无可用余额")):
                            print("账号或额度错误，停止本轮后续请求。", flush=True)
                            break
        except ValidationError as exc:
            print(redact(str(exc)), flush=True)
            failed = True
        finally:
            runner.report()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
