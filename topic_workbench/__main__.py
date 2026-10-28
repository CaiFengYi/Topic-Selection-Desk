"""Serve the local workbench and the explicitly selected mock prototype."""

import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from research_validation.core import ValidationError

from .service import Workbench


class Handler(SimpleHTTPRequestHandler):
    def guard(self):
        expected = f"127.0.0.1:{self.server.server_port}"
        return (self.headers.get("Host") == expected and
                self.headers.get("Origin", f"http://{expected}") == f"http://{expected}" and
                self.headers.get("Sec-Fetch-Site") not in ("cross-site", "same-site"))

    def respond(self, value, status=200):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def api(self, method):
        if not self.guard():
            self.respond({"error": {"code": "LOCAL_ONLY", "message": "仅允许本机同源访问"}}, 403)
            return
        path = urlsplit(self.path).path
        try:
            body = None
            if method in ("POST", "PATCH", "PUT"):
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 100000 or self.headers.get_content_type() != "application/json":
                    raise ValueError("请提交不超过100KB的JSON对象")
                body = json.loads(self.rfile.read(length))
            service = self.server.workbench
            parts = path.strip("/").split("/")
            if len(parts) >= 4 and parts[:2] == ["api", "research"]:
                from . import recommendation
                research_id, action = parts[2:4]
                if len(parts) == 4 and action == "keywords" and method == "GET":
                    self.respond(recommendation.get_keywords(service, research_id))
                elif len(parts) == 4 and action == "keywords" and method == "POST":
                    self.respond(recommendation.edit(service, research_id, "manual", body))
                elif len(parts) == 5 and action == "keywords" and method == "PATCH":
                    self.respond(recommendation.edit(service, research_id, "correction", body, parts[4]))
                elif len(parts) == 4 and action == "selection" and method == "PUT":
                    self.respond(recommendation.edit(service, research_id, "selection", body))
                elif len(parts) == 4 and action == "recommendations" and method in ("GET", "POST"):
                    self.respond(recommendation.saved_tasks(service, research_id) if method == "GET" else
                                 recommendation.start(service, research_id, body))
                else:
                    raise FileNotFoundError()
            elif len(parts) == 5 and parts[:2] == ["api", "rounds"] and parts[3] == "drafts" and method == "PATCH":
                from .recommendation import edit_draft
                self.respond(edit_draft(service, parts[2], unquote(parts[4]), body))
            elif path == "/api/budget" and method == "GET":
                from .materials import budget_summary
                self.respond(budget_summary())
            elif path == "/api/hotlist" and method == "GET":
                self.respond(service.hotlist())
            elif path == "/api/hotlist/refresh" and method == "POST":
                if body != {}:
                    raise ValueError("刷新榜单不接受额外参数")
                self.respond(service.refresh())
            elif path == "/api/hotspots" and method == "GET":
                self.respond({"hotspots": service.list_hotspots()})
            elif path == "/api/hotspots" and method == "POST":
                self.respond(service.save_hotspot(body), 201)
            elif path.startswith("/api/hotspots/") and len(path.split("/")) == 5 and path.endswith("/research") and method == "POST":
                from .research import start
                self.respond(start(service, path.split("/")[3], body))
            elif path.startswith("/api/hotspots/") and len(path.split("/")) == 5 and path.endswith("/research") and method == "GET":
                from .research import saved_tasks
                self.respond(saved_tasks(service, path.split("/")[3]))
            elif path.startswith("/api/tasks/") and len(path.split("/")) == 4 and method == "GET":
                from .research import get_task
                try:
                    task = get_task(service, path.split("/")[3])
                except FileNotFoundError:
                    from .recommendation import get_task as get_recommendation
                    task = get_recommendation(service, path.split("/")[3])
                self.respond(task)
            elif path.startswith("/api/tasks/") and len(path.split("/")) == 5 and path.endswith("/event") and method == "PATCH":
                from .research import select_event
                self.respond(select_event(service, path.split("/")[3], body))
            elif path.startswith("/api/hotspots/") and len(path.split("/")) == 5 and path.endswith("/materials") and method == "GET":
                self.respond(service.material_tasks(path.split("/")[3]))
            elif path.startswith("/api/hotspots/") and method in ("GET", "PATCH"):
                hotspot_id = path.removeprefix("/api/hotspots/")
                self.respond(service.get_hotspot(hotspot_id) if method == "GET" else service.save_hotspot(body, hotspot_id))
            else:
                self.respond({"error": {"code": "NOT_IMPLEMENTED", "message": "该功能尚未接入真实服务"}}, 404)
        except (ValueError, UnicodeError):
            self.respond({"error": {"code": "INVALID_INPUT", "message": "输入无效，请检查必填标题、字段长度和 HTTP(S) 来源链接。"}}, 400)
        except FileNotFoundError:
            self.respond({"error": {"code": "NOT_FOUND", "message": "热点记录不存在"}}, 404)
        except BlockingIOError:
            self.respond({"error": {"code": "BUSY", "message": "操作冲突或已有操作执行中，请稍后查看；未追加请求"}}, 409)
        except ValidationError:
            self.respond({"error": {"code": "BUSY", "message": "另一个付费操作正在运行，未追加请求"}}, 409)
        except Exception:
            # Do not expose filesystem paths, exception details or external responses.
            self.respond({"error": {"code": "LOCAL_SERVICE_ERROR", "message": "本地读取或保存失败，已有输入保留，请检查终端和本地数据。"}}, 500)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.api("GET")
        elif self.guard():
            super().do_GET()
        else:
            self.respond({"error": {"code": "LOCAL_ONLY"}}, 403)

    def do_POST(self):
        self.api("POST")

    def do_PATCH(self):
        self.api("PATCH")

    def do_PUT(self):
        self.api("PUT")


def main():
    parser = argparse.ArgumentParser(description="Local topic workbench")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--news-dir", type=Path)
    args = parser.parse_args()
    public = Path(__file__).resolve().parent / "public"
    handler = partial(Handler, directory=str(public))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        server.workbench = Workbench(args.data_dir, args.news_dir)
        print(f"Local workbench: http://127.0.0.1:{args.port} (Ctrl+C to stop)", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
