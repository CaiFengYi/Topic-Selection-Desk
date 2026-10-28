"""Local hotlists, hotspot inputs and explicit materials collection."""

import json
import os
import sqlite3
import sys
import threading
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
TZ = timezone(timedelta(hours=8))
PLATFORMS = {"bilibili-hot-search": ("B站", "bilibili.com"),
             "douyin": ("抖音", "douyin.com"), "weibo": ("微博", "weibo.com")}


def now():
    return datetime.now(TZ)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    try:
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_url(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("来源链接必须是网址")
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("来源链接须为完整 HTTP(S) 网址，不能包含账号密码")
    return value


class Workbench:
    def __init__(self, data_dir=None, news_dir=None, fetcher=None):
        self.data_dir = Path(data_dir or ROOT / "workbench-data")
        self.news_dir = Path(news_dir or ROOT / "TrendRadar/output/news")
        self.fetcher = fetcher
        self.store_lock = threading.Lock()
        self.refresh_lock = threading.Lock()

    def hotlist(self):
        date = now().date().isoformat()
        path = self.news_dir / f"{date}.db"
        items, platforms = [], []
        metadata_path = self.data_dir / "collections" / f"{date}.json"
        metadata = read_json(metadata_path) if metadata_path.exists() else {}
        if path.exists():
            with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as conn:
                conn.row_factory = sqlite3.Row
                record = conn.execute("SELECT id, crawl_time FROM crawl_records ORDER BY crawl_time DESC LIMIT 1").fetchone()
                if record:
                    for platform_id, (label, _) in PLATFORMS.items():
                        state = conn.execute("SELECT status FROM crawl_source_status WHERE crawl_record_id=? AND platform_id=?", (record["id"], platform_id)).fetchone()
                        collected = datetime.fromisoformat(f"{date}T{record['crawl_time'].replace('-', ':')}").replace(tzinfo=TZ).isoformat()
                        source = metadata.get(record["crawl_time"], {}).get(platform_id, {})
                        status = state["status"] if state else "missing"
                        platforms.append({"id": platform_id, "platform": label, "status": status,
                                          "collected_at": collected if state else None,
                                          "source_status": source.get("source_status"),
                                          "source_updated_at": source.get("source_updated_at")})
                        if status != "success":
                            continue
                        rows = conn.execute("SELECT id,title,rank,url,mobile_url FROM news_items WHERE platform_id=? AND last_crawl_time=? AND rank>0 ORDER BY rank,id", (platform_id, record["crawl_time"]))
                        for row in rows:
                            try:
                                url = safe_url(row["url"] or row["mobile_url"] or None)
                            except ValueError:
                                url = None
                            items.append({"id": f"{date}:{platform_id}:{row['id']}:{record['id']}",
                                          "platform": label, "platform_id": platform_id, "rank": row["rank"],
                                          "title": row["title"], "source_url": url, "collected_at": collected,
                                          "source_updated_at": source.get("source_updated_at"),
                                          "source_status": source.get("source_status"), "mock": False})
        if not platforms:
            platforms = [{"id": key, "platform": label, "status": "missing", "collected_at": None,
                          "source_status": None, "source_updated_at": None} for key, (label, _) in PLATFORMS.items()]
        message = "本地当日最近一次采集；不代表实时榜单。" if items else "暂无当前榜单，请刷新采集或手动添加热点。历史示例不会作为当前榜单。"
        failed = [source["platform"] for source in platforms if source["status"] == "failed"]
        if failed:
            message = f"{'、'.join(failed)}榜单采集失败，请检查本地服务的网络或代理以及采集源可用性；未自动重试。"
            if items:
                message += "其余平台展示本次已取得的榜单。"
        return {"date": date, "items": items, "platforms": platforms, "mock": False,
                "message": message}

    def refresh(self):
        if not self.refresh_lock.acquire(blocking=False):
            raise BlockingIOError("榜单采集中，请等待当前操作完成")
        try:
            # Import only collection/storage modules, never the TrendRadar application entrypoint.
            if str(ROOT / "TrendRadar") not in sys.path:
                sys.path.insert(0, str(ROOT / "TrendRadar"))
            from trendradar.crawler.fetcher import DataFetcher
            from trendradar.storage.base import NewsData, NewsItem
            from trendradar.storage.local import LocalStorageBackend

            fetcher = self.fetcher or DataFetcher()
            results, sources, failed = {}, {}, []
            for platform_id, (label, domain) in PLATFORMS.items():
                response, _, _ = fetcher.fetch_data((platform_id, label), max_retries=0)
                try:
                    payload = json.loads(response) if response else {}
                    rows = payload.get("items", [])
                    if payload.get("status") not in ("success", "cache") or not rows:
                        raise ValueError("采集失败或返回空榜单")
                    if fetcher._check_domain_safety(rows, domain):
                        raise ValueError("来源链接未通过平台域名校验")
                    results[platform_id] = [NewsItem(title=str(row["title"]).strip(), source_id=platform_id,
                                                    source_name=label, rank=index, url=row.get("url") or "",
                                                    mobile_url=row.get("mobileUrl") or "")
                                            for index, row in enumerate(rows, 1) if row.get("title") and str(row["title"]).strip()]
                    if not results[platform_id]:
                        raise ValueError("无可用榜单标题")
                    updated = payload.get("updatedTime")
                    sources[platform_id] = {"source_status": payload["status"],
                                            "source_updated_at": datetime.fromtimestamp(updated / 1000, TZ).isoformat() if isinstance(updated, (int, float)) else None}
                except (ValueError, TypeError, KeyError, OverflowError, OSError):
                    results.pop(platform_id, None)
                    failed.append(platform_id)
                    sources[platform_id] = {"source_status": "failed", "source_updated_at": None}
            instant = now()
            date, crawl_time = instant.date().isoformat(), instant.strftime("%H-%M-%S.%f")
            backend = LocalStorageBackend(str(self.news_dir.parent), enable_txt=False, enable_html=False, timezone="Asia/Hong_Kong")
            try:
                data = NewsData(date=date, crawl_time=crawl_time, items=results,
                                id_to_name={key: val[0] for key, val in PLATFORMS.items()}, failed_ids=failed)
                if not backend.save_news_data(data):
                    raise OSError("榜单保存失败")
            finally:
                backend.cleanup()
            path = self.data_dir / "collections" / f"{date}.json"
            metadata = read_json(path) if path.exists() else {}
            metadata[crawl_time] = sources
            write_json(path, metadata)
            return self.hotlist()
        finally:
            self.refresh_lock.release()

    def list_hotspots(self):
        with self.store_lock:
            paths = (self.data_dir / "hotspots").glob("*.json")
            return sorted([read_json(path) for path in paths], key=lambda item: item["updated_at"], reverse=True)

    def hotspot_path(self, hotspot_id):
        try:
            if str(uuid.UUID(hotspot_id)) != hotspot_id:
                raise ValueError()
        except (ValueError, AttributeError):
            raise FileNotFoundError("热点不存在") from None
        return self.data_dir / "hotspots" / f"{hotspot_id}.json"

    def get_hotspot(self, hotspot_id):
        with self.store_lock:
            return read_json(self.hotspot_path(hotspot_id))

    def material_tasks(self, hotspot_id):
        from .materials import saved_tasks
        return saved_tasks(self, hotspot_id)

    def collect_materials(self, hotspot_id, body):
        from .materials import collect
        return collect(self, hotspot_id, body)

    def save_hotspot(self, value, hotspot_id=None):
        if not isinstance(value, dict):
            raise ValueError("热点输入必须为对象")
        allowed = {"entry_kind", "entry_id", "platform", "rank", "collected_at", "source_updated_at", "source_status",
                   "title", "source_url", "location", "event_time", "focus", "manual_material"}
        if set(value) - allowed:
            raise ValueError("热点输入包含不支持的字段")
        cleaned = {}
        for name, maximum in (("title", 500), ("location", 100), ("event_time", 100), ("focus", 500), ("source_url", 2000)):
            text = value.get(name)
            if text is not None and (not isinstance(text, str) or len(text) > maximum):
                raise ValueError(f"{name} 格式或长度不正确")
            cleaned[name] = text.strip() if text and text.strip() else None
        if not cleaned["title"]:
            raise ValueError("请输入热点标题或描述")
        safe_url(cleaned["source_url"])
        kind = value.get("entry_kind")
        if kind not in ("manual", "hotlist"):
            raise ValueError("热点入口不正确")
        material = value.get("manual_material")
        if material is not None:
            if not isinstance(material, dict) or set(material) - {"text", "source_description"}:
                raise ValueError("人工材料格式不正确")
            for field, maximum in (("text", 10000), ("source_description", 500)):
                text = material.get(field)
                if text is not None and (not isinstance(text, str) or len(text) > maximum):
                    raise ValueError("人工材料格式或长度不正确")
            if not (material.get("text") or "").strip():
                raise ValueError("人工材料原文不能为空")
        with self.store_lock:
            previous = read_json(self.hotspot_path(hotspot_id)) if hotspot_id else None
            provenance = None
            if kind == "hotlist":
                if previous and previous["input"]["entry_kind"] == kind and previous["input"]["entry_id"] == value.get("entry_id"):
                    provenance = previous["provenance"]
                else:
                    provenance = next((item for item in self.hotlist()["items"] if item["id"] == value.get("entry_id")), None)
                if not provenance:
                    raise ValueError("该榜单条目已不在当前采集中，请重新选择或手动添加")
            cleaned.update({"entry_kind": kind, "entry_id": provenance["id"] if provenance else None,
                            "platform": provenance["platform"] if provenance else None,
                            "rank": provenance["rank"] if provenance else None,
                            "collected_at": provenance["collected_at"] if provenance else None,
                            "source_updated_at": provenance.get("source_updated_at") if provenance else None,
                            "source_status": provenance.get("source_status") if provenance else None,
                            "manual_material": material})
            timestamp = now().isoformat()
            record = {"id": hotspot_id or str(uuid.uuid4()), "input": cleaned, "provenance": provenance,
                      "manual_material_submitted_at": (previous["manual_material_submitted_at"] if previous and previous["input"]["manual_material"] == material else timestamp) if material else None,
                      "created_at": previous["created_at"] if previous else timestamp, "updated_at": timestamp, "mock": False}
            self.data_dir.mkdir(parents=True, exist_ok=True)
            write_json(self.hotspot_path(record["id"]), record)
            return record
