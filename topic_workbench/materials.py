"""Materials-only tasks sharing the terminal validation budget and process lock."""

import uuid

from research_validation.cli import OUTPUT, Runner
from research_validation.core import Ledger, RunLock, ValidationError, digest, now, read_json, write_json


def saved_tasks(workbench, hotspot_id):
    workbench.get_hotspot(hotspot_id)
    tasks = [read_json(path) for path in (workbench.data_dir / "tasks").glob("*.json")]
    tasks = [task for task in tasks if task["hotspot_id"] == hotspot_id]
    for task in tasks:
        if task["status"] == "running":
            directory = OUTPUT / f"workbench-{hotspot_id}-{task['input_hash']}"
            task["materials"] = read_json(directory / "sources.json", [])
            task["search_results"] = read_json(directory / "search_results.json", [])
    return {"tasks": sorted(tasks, key=lambda task: task["created_at"], reverse=True)}


def collect(workbench, hotspot_id, body):
    if not isinstance(body, dict) or set(body) != {"operation_id"}:
        raise ValueError("需要 operation_id")
    try:
        operation_id = str(uuid.UUID(body["operation_id"]))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("operation_id 必须为 UUID") from None
    record = workbench.get_hotspot(hotspot_id)
    snapshot = record["input"]
    identity = digest(snapshot)
    task_id = str(uuid.uuid5(uuid.UUID(hotspot_id), operation_id))
    path = workbench.data_dir / "tasks" / f"{task_id}.json"
    # The same OS lock protects CLI and all workbench instances. Construct Runner
    # only after acquiring it, so the ledger is never a stale in-memory snapshot.
    with RunLock(OUTPUT):
        previous = read_json(path)
        if previous:
            if previous["input_hash"] != identity:
                raise BlockingIOError("同一操作编号不能提交不同输入")
            return {**previous, "reuse": "operation"}
        case = f"workbench-{hotspot_id}-{identity}"
        directory = OUTPUT / case
        prior = next((task for task in workbench.material_tasks(hotspot_id)["tasks"]
                      if task["input_hash"] == identity), None)
        if prior:
            return {**prior, "reuse": "result_cache"}
        task = {"id": task_id, "hotspot_id": hotspot_id, "operation_id": operation_id,
                "input_hash": identity, "input_snapshot": snapshot, "kind": "materials",
                "manual_material_submitted_at": record["manual_material_submitted_at"],
                "status": "running", "stage": "取材", "created_at": now(),
                "materials": [], "search_results": [], "warnings": [], "error": None,
                "research_completed": False, "mock": False, "reuse": "none"}
        write_json(path, task)
        try:
            # Load credentials only for an explicitly submitted paid operation.
            from dotenv import load_dotenv
            from .service import ROOT
            load_dotenv(ROOT / ".env.local", override=False)
            runner = Runner(OUTPUT, case_scope=f"workbench-{hotspot_id}")
            query = " ".join(snapshot[key] for key in ("title", "location", "event_time", "focus") if snapshot.get(key))
            runner.gather(case, {"queries": [query]})
            task["status"] = "completed"
        except ValidationError as exc:
            attempted = any(e["case"] == f"workbench-{hotspot_id}" for e in Ledger(OUTPUT / "ledger.json").data["entries"])
            task.update(status="failed" if attempted else "blocked",
                        error={"code": "ACQUISITION_STOPPED", "message": str(exc)})
        except Exception:
            task.update(status="failed", error={"code": "ACQUISITION_FAILED",
                        "message": "取材未完成；已有材料和费用预留保留，不自动重试。"})
        task["materials"] = read_json(directory / "sources.json", [])
        task["search_results"] = read_json(directory / "search_results.json", [])
        readable = sum(s["status"] == "body" for s in task["materials"])
        if readable < 2:
            task["warnings"].append(f"本次只有 {readable} 份可读且非完全重复的正文，材料偏少；不能据此判断话题热度或说法真假。未追加请求。")
        if any(s["status"] in ("duplicate", "read_failed") for s in task["materials"]):
            task["warnings"].append("本次存在重复内容或读取失败；网站数量不代表独立佐证。")
        task["finished_at"] = now()
        ledger = Ledger(OUTPUT / "ledger.json")
        task["budget"] = {"accounted_cny": ledger.total, "cap_cny": ledger.cap}
        write_json(path, task)
        return task
