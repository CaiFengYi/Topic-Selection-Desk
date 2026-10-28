"""Local keyword edits and explicit, model-only recommendation tasks."""

import uuid

from research_validation import prompts
from research_validation.core import (Ledger, RunLock, ValidationError, check_topics,
                                      now, read_json, write_json)
from . import materials, research


def state(workbench, research_id):
    task = research.get_task(workbench, research_id)
    if not task["research_completed"] or not task["result"]:
        raise ValueError("研究尚未完成，不能推荐")
    path = workbench.data_dir / "keyword_edits" / f"{research_id}.json"
    edits = read_json(path, {"corrections": {}, "manual": [], "keyword_ids": []})
    keywords = [{**k, "kind": "original", "correction": edits["corrections"].get(k["id"])}
                for k in task["result"]["keywords"]]
    keywords += [{**k, "correction": edits["corrections"].get(k["id"])} for k in edits["manual"]]
    return task, path, edits, keywords


def get_keywords(workbench, research_id):
    _, _, edits, keywords = state(workbench, research_id)
    return {"keywords": keywords, "keyword_ids": edits["keyword_ids"], "mock": False}


def text(value, maximum, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise ValueError("关键词字段格式或长度不正确")
    return value.strip()


def edit(workbench, research_id, action, body, keyword_id=None):
    with RunLock(materials.OUTPUT):
        _, path, edits, keywords = state(workbench, research_id)
        if not isinstance(body, dict):
            raise ValueError("需要关键词对象")
        if action == "correction":
            if set(body) != {"correction"} or keyword_id not in {k["id"] for k in keywords}:
                raise ValueError("关键词或修正字段无效")
            value = body["correction"]
            edits["corrections"][keyword_id] = (text(value, 1000, empty=True) or None) if value is not None else None
        elif action == "manual":
            if set(body) != {"term", "meaning"}:
                raise ValueError("需要term和meaning")
            edits["manual"].append({"id": "U" + uuid.uuid4().hex, "kind": "manual", "verified": False,
                                    "term": text(body["term"], 100), "meaning": text(body["meaning"], 1000, empty=True),
                                    "source_id": None, "quote": None})
        elif action == "selection":
            ids = body.get("keyword_ids")
            if (set(body) != {"keyword_ids"} or not isinstance(ids, list)
                    or any(not isinstance(k, str) or k not in {v["id"] for v in keywords} for k in ids)
                    or len(ids) != len(set(ids))):
                raise ValueError("所选关键词不存在或重复")
            edits["keyword_ids"] = ids
        else:
            raise ValueError("未知关键词操作")
        write_json(path, edits)
        return get_keywords(workbench, research_id)


def task_path(workbench, task_id):
    # Apply the same UUID validation as research tasks.
    return workbench.data_dir / "recommendation_tasks" / research.task_path(workbench, task_id).name


def get_task(workbench, task_id):
    task = read_json(task_path(workbench, task_id))
    if task is None:
        raise FileNotFoundError("推荐任务不存在")
    return task


def saved_tasks(workbench, research_id):
    research.get_task(workbench, research_id)
    tasks = [read_json(p) for p in (workbench.data_dir / "recommendation_tasks").glob("*.json")]
    return {"tasks": sorted((t for t in tasks if t["research_id"] == research_id), key=lambda t: t["created_at"])}


def start(workbench, research_id, body):
    if not isinstance(body, dict) or set(body) != {"operation_id", "mode"} or body["mode"] not in ("direct", "manual"):
        raise ValueError("需要operation_id和推荐mode")
    try:
        if str(uuid.UUID(body["operation_id"])) != body["operation_id"]:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError("operation_id必须是UUID") from None
    with RunLock(materials.OUTPUT):
        previous = next((t for t in saved_tasks(workbench, research_id)["tasks"]
                         if t["operation_id"] == body["operation_id"]), None)
        if previous:
            if previous["mode"] != body["mode"]:
                raise BlockingIOError("同一操作不能改变推荐方式")
            return {**previous, "reuse": "operation"}
        source, _, edits, keywords = state(workbench, research_id)
        chosen = [k for k in keywords if k["kind"] == "original"] if body["mode"] == "direct" else [
            k for k in keywords if k["id"] in edits["keyword_ids"]]
        if not chosen:
            raise ValueError("请先选择关键词或添加并选中人工补词")
        task = {"id": str(uuid.uuid4()), "kind": "recommendation", "research_id": research_id,
                "hotspot_id": source["hotspot_id"], **body, "keyword_snapshot": chosen,
                "status": "running", "stage": "选题推荐", "created_at": now(), "result": None,
                "error": None, "reuse": "none", "mock": False}
        path = task_path(workbench, task["id"])
        write_json(path, task)
        before = len(Ledger(materials.OUTPUT / "ledger.json").data["entries"])
        returned = False
        try:
            from dotenv import load_dotenv
            from .service import ROOT
            load_dotenv(ROOT / ".env.local", override=False)
            scope = f"workbench-{source['hotspot_id']}"
            runner = materials.Runner(materials.OUTPUT, case_scope=scope)
            if any(e["case"] == scope and e["operation"] == "recommend" and e["status"] == "pending"
                   for e in runner.ledger.data["entries"]):
                raise ValidationError("已有待确认推荐请求，不自动重发")
            selected = {k["id"]: {**k, "original_meaning": k["meaning"],
                                    "meaning": k["correction"] or k["meaning"]} for k in chosen}
            payload = {"selection": {"mode": body["mode"], "keywords": selected,
                                     "research_status": source["result"]["status"]},
                       "research_gaps": source["result"]["gaps"], "operation_id": body["operation_id"]}
            data, key = runner.model_call(f"workbench-{source['hotspot_id']}-{source['input_hash']}",
                                          "recommend", prompts.RECOMMEND, payload, 3072)
            returned = True
            check_topics(data, selected)
            # Validate list members as well as the legacy structural checks.
            for candidate in data["topics"]:
                for field in ("visuals", "verify_before_script"):
                    for item in candidate[field]:
                        if not isinstance(item, str) or not item.strip():
                            raise ValidationError("候选画面和待查证事项必须为非空文本")
            task["result"] = {"id": task["id"], "task_id": task["id"], "research_id": research_id,
                              "mode": body["mode"], "keyword_snapshot": chosen, "input_hash": key,
                              "validation_scope": "structure_and_keyword_references", "human_review": "pending",
                              "empty_reason": data.get("reason", ""), "candidates": [
                                  {"id": c["id"], "title": c["title"], "opening": c["opening"],
                                   "knowledge_question": c["question"], "used_keyword_ids": c["keyword_ids"],
                                   "association_reason": c["association_reason"], "visual_direction": c["visuals"],
                                   "verification_points": c["verify_before_script"]} for c in data["topics"]]}
            task.update(status="completed", stage="推荐完成 · 内容待审核与知识核验")
        except ValidationError:
            blocked = not returned and len(Ledger(materials.OUTPUT / "ledger.json").data["entries"]) == before
            task.update(status="blocked" if blocked else "failed", error={
                "code": "BUDGET_BLOCKED" if blocked else "RECOMMENDATION_STOPPED",
                "message": "推荐受付费保护限制（预算、核价、账号或待确认请求），未追加模型调用。" if blocked else
                "推荐未完成：模型或输出校验未通过。已有研究和候选保留，未自动重试。"})
        except Exception:
            task.update(status="failed", error={"code": "MODEL_FAILED", "message":
                        "推荐未完成；已有研究、候选与费用记录保留，未自动重试。"})
        ledger = Ledger(materials.OUTPUT / "ledger.json")
        task["budget"] = {"accounted_cny": ledger.total, "cap_cny": ledger.cap}
        task["finished_at"] = now()
        write_json(path, task)
        return task
