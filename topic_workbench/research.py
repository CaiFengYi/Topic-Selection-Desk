"""Research only acquired text, with a persisted pause for event selection."""

import uuid

from research_validation import prompts
from research_validation.core import (Ledger, RunLock, ValidationError, check_research,
                                      now, read_json, write_json)
from . import materials

RESEARCH = prompts.RESEARCH + r"""
本次为通用热点研究，不使用旧案例的车型或价格验收规则。
人工来源kind=manual中的正文是用户提交的文本，未回查网页，引用时保留其source_id与身份。
先定位事件。若材料明确涉及不同事件或无法确定用户指哪件事，停止提词，
只返回 {"status":"needs_clarification","event_candidates":[{"id":"E1","label":"含时间地点主体的事件说明","source_ids":["S1"]}]}。
候选必须基于给定材料，可仅一个候选请求确认；不得将同一事件的数字、车型或原因分歧当成不同事件。
同事件分歧使用disputed背景并保留各来源与speaker，gaps说明分歧，不补查、不裁定真伪。
若selected_event已给定，仅研究该候选的材料，不再返回澄清。
身份明确时返回完整研究JSON，并加status="ready"。不明的信息保持空值，在gaps说明。
引文必须保留影响理解的数字、单位、说话者和否定语境；字面联想只放concepts。
"""


def task_path(workbench, task_id):
    try:
        if str(uuid.UUID(task_id)) != task_id:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise FileNotFoundError("任务不存在") from None
    return workbench.data_dir / "research_tasks" / f"{task_id}.json"


def get_task(workbench, task_id):
    task = read_json(task_path(workbench, task_id))
    if task is None:
        raise FileNotFoundError("任务不存在")
    return task


def saved_tasks(workbench, hotspot_id):
    workbench.get_hotspot(hotspot_id)
    tasks = [read_json(path) for path in (workbench.data_dir / "research_tasks").glob("*.json")]
    return {"tasks": sorted((t for t in tasks if t["hotspot_id"] == hotspot_id),
                            key=lambda t: t["created_at"], reverse=True)}


def start(workbench, hotspot_id, body):
    acquired = workbench.collect_materials(hotspot_id, body)
    with RunLock(materials.OUTPUT):
        path = task_path(workbench, acquired["id"])
        previous = read_json(path)
        if previous:
            return {**previous, "reuse": acquired["reuse"]}
        # Collection is never resumed. A failed read may still leave usable
        # text (including manual text) for the explicitly requested research.
        task = {**acquired, "kind": "research", "result": None, "event_candidates": [],
                "selected_event": None, "research_completed": False}
        record = workbench.get_hotspot(hotspot_id)
        manual = acquired["input_snapshot"].get("manual_material")
        if manual:
            task["materials"] = [*task["materials"], {
                "id": "M1", "kind": "manual", "status": "manual", "title": "人工补充材料 · 未回查",
                "text": manual["text"], "source_description": manual.get("source_description"),
                "submitted_at": acquired.get("manual_material_submitted_at", record["manual_material_submitted_at"]), "url": None,
                "published_at": None, "read_at": None}]
        write_json(path, task)
        if acquired["status"] in ("running", "blocked"):
            return task
        if acquired["error"]:
            task["warnings"] = [*task["warnings"], acquired["error"]["message"]]
        return run(workbench, task)


def select_event(workbench, task_id, body):
    if not isinstance(body, dict) or set(body) != {"event_id"} or not isinstance(body["event_id"], str):
        raise ValueError("需要 event_id")
    with RunLock(materials.OUTPUT):
        task = get_task(workbench, task_id)
        if task["selected_event"]:
            if task["selected_event"]["id"] != body["event_id"]:
                raise BlockingIOError("事件已选择")
            return {**task, "reuse": "operation"}
        if task["status"] != "needs_clarification":
            raise BlockingIOError("任务未等待事件选择")
        selected = next((e for e in task["event_candidates"] if e["id"] == body["event_id"]), None)
        if selected is None:
            raise ValueError("事件不存在")
        task["selected_event"] = selected
        return run(workbench, task)


def run(workbench, task):
    path = task_path(workbench, task["id"])
    task.update(status="running", stage="研究提词", error=None)
    write_json(path, task)
    sources = [s for s in task["materials"] if s["status"] in ("body", "manual")]
    if task["selected_event"]:
        sources = [s for s in sources if s["id"] in task["selected_event"]["source_ids"]]
    before = len(Ledger(materials.OUTPUT / "ledger.json").data["entries"])
    model_returned = False
    try:
        if not sources:
            task.update(status="completed", stage="无可引用材料", result={
                "id": task["id"], "task_id": task["id"], "hotspot_id": task["hotspot_id"],
                "status": "no_usable_text", "background": [], "keywords": [], "evidence_groups": [],
                "gaps": ["未取得可引用文本，研究未完成；未调用模型，未追加取材。"]})
        else:
            from dotenv import load_dotenv
            from .service import ROOT
            load_dotenv(ROOT / ".env.local", override=False)
            case = f"workbench-{task['hotspot_id']}-{task['input_hash']}"
            scope = f"workbench-{task['hotspot_id']}"
            runner = materials.Runner(materials.OUTPUT, case_scope=scope)
            ledger = runner.ledger
            if any(e["case"] == scope and e["operation"] == "research" and e["status"] == "pending"
                   for e in ledger.data["entries"]):
                raise ValidationError("已有未确认完成的研究请求；保留预留，不自动重试。")
            if ledger.attempts(scope, "research") >= 4:
                raise ValidationError("已达此热点四次研究调用上限（含失败及事件选择）。")
            # model_call uses its case for accounting; case_scope also applies to models.
            payload = {"case": "workbench", "input": task["input_snapshot"],
                       "selected_event": task["selected_event"],
                       "sources": [{**s, "text": s["text"][:6000]} for s in sources]}
            data, key = runner.model_call(case, "research", RESEARCH, payload, 4096)
            model_returned = True
            if not isinstance(data, dict):
                raise ValidationError("研究输出必须为对象")
            if data.get("status") == "needs_clarification":
                candidates = data.get("event_candidates")
                ids = {s["id"] for s in sources}
                seen = set()
                if task["selected_event"] or not isinstance(candidates, list) or not 1 <= len(candidates) <= 8:
                    raise ValidationError("事件候选结构无效")
                for event in candidates:
                    if (not isinstance(event, dict) or not isinstance(event.get("id"), str)
                            or not event["id"] or event["id"] in seen
                            or not isinstance(event.get("label"), str) or not event["label"].strip()
                            or not isinstance(event.get("source_ids"), list) or not event["source_ids"]
                            or any(s not in ids for s in event["source_ids"])):
                        raise ValidationError("事件候选缺少有效材料引用")
                    seen.add(event["id"])
                task.update(status="needs_clarification", stage="请选择或补充事件", event_candidates=candidates)
            else:
                # Keep legacy CLI's two-body policy; workbench can use a sparse body
                # or explicitly identified manual text without pretending it was read online.
                check_research(data, [{**s, "status": "body"} for s in sources], "workbench", minimum_bodies=1)
                task["result"] = {**data, "id": task["id"], "task_id": task["id"],
                                  "hotspot_id": task["hotspot_id"], "input_hash": key,
                                  "status": "ready" if data["keywords"] else "insufficient"}
                task.update(status="completed", stage="提词完成", research_completed=True)
    except ValidationError:
        blocked = not model_returned and len(Ledger(materials.OUTPUT / "ledger.json").data["entries"]) == before
        task.update(status="blocked" if blocked else "failed", error={
                    "code": "BUDGET_BLOCKED" if blocked else "RESEARCH_STOPPED", "message":
                    "研究未完成：付费保护（预算、核价、账号、次数或待确认请求）受阻。" if blocked else
                    "研究未完成：模型或引用校验未通过。已有材料与费用记录保留，未自动重试。"})
    except Exception:
        task.update(status="failed", error={"code": "MODEL_FAILED", "message":
                    "研究未完成；已有材料与费用记录保留，未自动重试。"})
    ledger = Ledger(materials.OUTPUT / "ledger.json")
    task["budget"] = {"accounted_cny": ledger.total, "cap_cny": ledger.cap}
    task["finished_at"] = now()
    write_json(path, task)
    return task
