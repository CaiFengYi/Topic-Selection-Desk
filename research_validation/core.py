"""Persistence, budget reservations and evidence checks for the validation run."""

import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


class ValidationError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:20]


def redact(text):
    for name in ("AI_API_KEY", "EXA_API_KEY"):
        secret = os.environ.get(name, "")
        if len(secret) >= 8:
            text = text.replace(secret, "[REDACTED]")
    return text


def read_json(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(redact(json.dumps(value, ensure_ascii=False, indent=2)), encoding="utf-8")
    temporary.replace(path)


def canonical_url(url):
    try:
        parts = urlsplit(url)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
            return None
        if parts.hostname in ("localhost", "127.0.0.1", "::1"):
            return None
        query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k not in ("gclid", "fbclid")]
        return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path or "/", urlencode(query), ""))
    except (ValueError, TypeError):
        return None


class RunLock:
    """Windows releases the OS lock even if a process dies during a paid call."""

    def __init__(self, directory):
        self.path = directory / "run.lock"

    def __enter__(self):
        import msvcrt
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+b")
        if self.file.tell() == 0:
            self.file.write(b"0")
            self.file.flush()
        self.file.seek(0)
        try:
            msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            self.file.close()
            raise ValidationError("另一个验证进程正在运行；本次没有发起请求。") from None
        return self

    def __exit__(self, *args):
        import msvcrt
        self.file.seek(0)
        msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
        self.file.close()


class Ledger:
    def __init__(self, path, cap=5.0):
        self.path = path
        self.data = read_json(path, {"budget_cny": cap, "entries": []})
        # A later setting cannot silently raise the original run's cap.
        self.cap = min(float(self.data["budget_cny"]), float(cap), 5.0)

    @property
    def total(self):
        return round(sum(e["accounted_cny"] for e in self.data["entries"]), 8)

    def reserve(self, case, operation, amount):
        if not math.isfinite(amount) or amount <= 0:
            raise ValidationError("费用预估无效，停止付费请求。")
        if self.data.get("pricing_overrun") or self.total + amount > self.cap:
            raise ValidationError("预算不足或价格异常，未发起下一次付费请求。")
        entry = {"id": len(self.data["entries"]) + 1, "case": case, "operation": operation,
                 "started_at": now(), "status": "pending", "reserved_cny": round(amount, 8),
                 "accounted_cny": round(amount, 8), "cost_basis": "reservation"}
        self.data["entries"].append(entry)
        write_json(self.path, self.data)
        return entry

    def finish(self, entry, actual=None, **details):
        if actual is not None and (not math.isfinite(actual) or actual < 0):
            raise ValidationError("返回费用无效；保留请求预留额。")
        entry.update({"status": "success", **details})
        entry["finished_at"] = now()
        if actual is not None:
            entry["accounted_cny"] = round(actual, 8)
        if actual is not None and actual > entry["reserved_cny"] + 0.000001:
            self.data["pricing_overrun"] = True
        write_json(self.path, self.data)

    def attempts(self, case, operation):
        return sum(e["case"] == case and e["operation"] == operation for e in self.data["entries"])


def require_text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"缺少有效文本：{label}")


def check_research(data, sources, case):
    if not isinstance(data, dict):
        raise ValidationError("研究输出必须为JSON对象。")
    bodies = {s["id"]: s for s in sources if s["status"] == "body"}
    if len(bodies) < 2:
        raise ValidationError("不足两份可读正文。")

    def refs(ids):
        if not isinstance(ids, list) or not ids or any(i not in bodies for i in ids):
            raise ValidationError("研究引用了不存在或未读正文的来源。")

    event = data.get("event", {})
    require_text(event.get("name"), "event.name")
    if not isinstance(event.get("identity_notes"), list):
        raise ValidationError("缺少事件身份核对记录。")
    background = data.get("background")
    keywords = data.get("keywords")
    groups = data.get("evidence_groups")
    if not isinstance(background, list) or not background or not isinstance(keywords, list) or len(keywords) > 8:
        raise ValidationError("背景或关键词结构不合格。")
    for claim in background:
        require_text(claim.get("text"), "background.text")
        refs(claim.get("source_ids"))
        if claim.get("status") not in ("reported", "attributed", "disputed"):
            raise ValidationError("背景缺少来源说法状态。")
        if claim["status"] in ("attributed", "disputed"):
            require_text(claim.get("speaker"), "background.speaker")
    ids = set()
    for keyword in keywords:
        kid = keyword.get("id")
        if not isinstance(kid, str) or not kid.startswith("K") or kid in ids:
            raise ValidationError("关键词编号缺失或重复。")
        ids.add(kid)
        source = bodies.get(keyword.get("source_id"))
        term, quote = keyword.get("term"), keyword.get("quote")
        require_text(term, "keyword.term")
        require_text(quote, "keyword.quote")
        if source is None or term not in quote or quote not in source["text"] or len(quote) > 160:
            raise ValidationError(f"关键词{kid}的原词或连续摘录无法回查正文。")
        require_text(keyword.get("meaning"), "keyword.meaning")
        if keyword.get("stance") not in ("neutral", "affirmed", "denied", "disputed", "attributed"):
            raise ValidationError("关键词缺少肯定/否定语境。")
        if keyword["stance"] in ("denied", "attributed"):
            require_text(keyword.get("speaker"), "keyword.speaker")
        if not isinstance(keyword.get("concepts"), list):
            raise ValidationError("缺少延伸概念列表。")
    if not isinstance(groups, list) or not groups:
        raise ValidationError("缺少原始证据链分组。")
    for group in groups:
        require_text(group.get("label"), "evidence_group.label")
        refs(group.get("source_ids"))
    if not isinstance(data.get("gaps"), list):
        raise ValidationError("缺少材料缺口列表。")
    if case == "fire" and not event["identity_notes"]:
        raise ValidationError("未保留M8/M9车型差异。")
    if case == "memory":
        comparison = data.get("comparison", {})
        if not isinstance(comparison, dict):
            raise ValidationError("倒挂比较必须为对象。")
        if not comparison.get("left") and not comparison.get("right") and data["gaps"]:
            return data  # Honest evidence gap; caller records an insufficient result.
        for field in ("left", "right", "conditions", "quote"):
            require_text(comparison.get(field), "comparison." + field)
        if any(word in comparison["left"] + comparison["right"] for word in ("涨幅", "增长率", "累计上涨")):
            raise ValidationError("倒挂栏应比较价格水平；涨幅比较不能替代价格比较。")
        source = bodies.get(comparison.get("source_id"))
        if source is None or comparison["quote"] not in source["text"]:
            raise ValidationError("倒挂比较缺少可回查原文。")
    return data


def check_topics(data, selected):
    if not isinstance(data, dict) or not isinstance(data.get("topics"), list) or len(data["topics"]) > 3:
        raise ValidationError("推荐输出结构不合格。")
    if not data["topics"]:
        require_text(data.get("reason"), "没有选题的原因")
    ids = set()
    for topic in data["topics"]:
        for field in ("id", "title", "opening", "question", "association_reason"):
            require_text(topic.get(field), "topic." + field)
        if topic["id"] in ids:
            raise ValidationError("选题编号重复。")
        ids.add(topic["id"])
        used = topic.get("keyword_ids")
        if not isinstance(used, list) or not used or any(k not in selected for k in used):
            raise ValidationError("推荐使用了未选择或不存在的关键词。")
        if not any(selected[k]["term"] in topic["title"] + topic["opening"] for k in used):
            raise ValidationError("标题和开场均未保留所用原关键词。")
        for field in ("visuals", "verify_before_script"):
            if not isinstance(topic.get(field), list) or not topic[field]:
                raise ValidationError("缺少画面或待查证知识。")
    return data
