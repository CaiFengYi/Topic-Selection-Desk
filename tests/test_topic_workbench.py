import json
import shutil
import sqlite3
import threading
import unittest
import uuid
from functools import partial
from contextlib import closing
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from topic_workbench.__main__ import Handler
from topic_workbench.service import ROOT, Workbench, now


class Fetcher:
    def __init__(self, failed=()):
        self.failed = failed
        self.calls = []

    def fetch_data(self, info, max_retries):
        platform = info[0]
        self.calls.append((platform, max_retries))
        if platform in self.failed:
            return None, platform, info[1]
        domain = {'bilibili-hot-search': 'bilibili.com', 'douyin': 'douyin.com', 'weibo': 'weibo.com'}[platform]
        return json.dumps({'status': 'cache', 'updatedTime': 1793017453962,
                           'items': [{'title': '未预置的新热点 <test>', 'url': f'https://{domain}/test'}]}), platform, info[1]

    @staticmethod
    def _check_domain_safety(rows, domain):
        from trendradar.crawler.fetcher import DataFetcher
        return DataFetcher._check_domain_safety(rows, domain)


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.root = ROOT / 'validation-output' / 'test-tmp' / f'workbench-{uuid.uuid4().hex}'
        self.root.mkdir(parents=True)
        self.fetcher = Fetcher()
        self.service = Workbench(self.root / 'data', self.root / 'output/news', self.fetcher)

    def tearDown(self):
        self.assertTrue(self.root.resolve().is_relative_to((ROOT / 'validation-output/test-tmp').resolve()))
        shutil.rmtree(self.root)

    def test_no_today_does_not_use_historical_sample_or_create_db(self):
        news = self.service.news_dir
        news.mkdir(parents=True)
        (news / '2025-01-01.db').write_text('historical sample')
        self.assertEqual(self.service.hotlist()['items'], [])
        self.assertEqual(len(list(news.glob('*.db'))), 1)

    def test_refresh_stores_three_platforms_cache_times_and_no_model(self):
        with patch('requests.sessions.Session.request', side_effect=AssertionError('Unexpected network')):
            data = self.service.refresh()
        self.assertEqual(len(data['items']), 3)
        self.assertEqual(len(self.fetcher.calls), 3)
        self.assertTrue(all(retries == 0 for _, retries in self.fetcher.calls))
        self.assertTrue(all(p['source_status'] == 'cache' for p in data['platforms']))
        self.assertTrue(all(p['collected_at'] != p['source_updated_at'] for p in data['platforms']))
        self.assertEqual(Workbench(self.service.data_dir, self.service.news_dir).hotlist(), data)
        self.assertFalse((self.service.data_dir / 'ledger.json').exists())

    def test_failed_platform_does_not_show_previous_success_as_current(self):
        self.service.refresh()
        self.fetcher.failed = ['weibo']
        data = self.service.refresh()
        self.assertEqual(len(data['items']), 2)
        self.assertEqual(data['platforms'][2]['status'], 'failed')
        self.fetcher.failed = ['bilibili-hot-search', 'douyin', 'weibo']
        self.assertEqual(self.service.refresh()['items'], [])

    def test_legacy_minute_crawl_time_and_unknown_source_time(self):
        self.service.refresh()
        db = self.service.news_dir / f'{now().date().isoformat()}.db'
        with closing(sqlite3.connect(db)) as conn:
            conn.execute("UPDATE crawl_records SET crawl_time='08-00'")
            conn.execute("UPDATE news_items SET last_crawl_time='08-00'")
            conn.commit()
        data = self.service.hotlist()
        self.assertEqual(len(data['items']), 3)
        self.assertTrue(data['items'][0]['collected_at'].endswith('T08:00:00+08:00'))
        self.assertIsNone(data['items'][0]['source_updated_at'])

    def test_both_entries_persist_material_and_remain_separate(self):
        entries = self.service.refresh()['items']
        manual = {'entry_kind': 'manual', 'title': '任意新热点', 'location': '地点', 'event_time': '用户时间',
                  'focus': '原数字', 'manual_material': {'text': '  原文1612N\n不是结论  ', 'source_description': '用户粘贴字幕'}}
        first = self.service.save_hotspot(manual)
        second = self.service.save_hotspot({**manual, 'title': entries[0]['title'], 'entry_kind': 'hotlist', 'entry_id': entries[0]['id']})
        third = self.service.save_hotspot({**manual, 'title': entries[1]['title'], 'entry_kind': 'hotlist', 'entry_id': entries[1]['id']})
        self.assertNotEqual(second['id'], third['id'])
        reopened = Workbench(self.service.data_dir, self.service.news_dir)
        self.assertEqual(reopened.get_hotspot(first['id']), first)
        self.assertEqual(reopened.get_hotspot(second['id']), second)
        self.assertEqual(first['input']['manual_material'], manual['manual_material'])
        self.assertIsNotNone(second['provenance'])
        self.assertEqual(len(reopened.list_hotspots()), 3)
        saved = reopened.save_hotspot({**manual, 'focus': '修改关注点'}, first['id'])
        self.assertEqual(saved['id'], first['id'])
        self.assertEqual(saved['manual_material_submitted_at'], first['manual_material_submitted_at'])

    def test_reject_invalid_title_url_forged_entry_demo_and_paths(self):
        for value in ({'title': ' '}, {'title': 'x', 'source_url': 'javascript:alert(1)'},
                      {'title': 'x', 'source_url': 'https://user:password@example.com'},
                      {'title': 'x', 'demo_scenario': 'normal'},
                      {'title': 'x', 'entry_kind': 'hotlist', 'entry_id': 'forged'}):
            with self.assertRaises(ValueError):
                self.service.save_hotspot({'entry_kind': 'manual', **value})
        with self.assertRaises(FileNotFoundError):
            self.service.get_hotspot('../secrets')

    def test_refresh_busy_blocks_without_network(self):
        with self.service.refresh_lock:
            with self.assertRaises(BlockingIOError):
                self.service.refresh()
        self.assertEqual(self.fetcher.calls, [])

    def test_http_api_storage_errors_and_same_origin_boundary(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'topic_workbench/public')))
        server.workbench = self.service
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        port = server.server_port
        def request(method, path, body=None, headers=None):
            conn = HTTPConnection('127.0.0.1', port)
            conn.request(method, path, json.dumps(body) if body is not None else None,
                         headers or {'Content-Type': 'application/json'})
            response = conn.getresponse()
            status, content = response.status, response.read()
            conn.close()
            return status, content
        try:
            status, content = request('POST', '/api/hotspots', {'entry_kind': 'manual', 'title': 'HTTP新热点'})
            self.assertEqual(status, 201)
            record = json.loads(content)
            self.assertEqual(request('GET', '/api/hotspots/' + record['id'])[0], 200)
            self.assertEqual(request('GET', '/api/hotlist')[0], 200)
            self.assertEqual(request('POST', '/api/hotlist/refresh', {})[0], 200)
            self.assertEqual(request('POST', '/api/hotlist/refresh', {}, {'Content-Type': 'application/json', 'Origin': 'https://evil.example'})[0], 403)
            self.assertEqual(request('GET', '/api/hotspots', headers={'Host': 'evil.example'})[0], 403)
            self.assertEqual(request('GET', '/api/hotspots', headers={'Sec-Fetch-Site': 'same-site'})[0], 403)
            self.assertEqual(request('GET', '/.env.local')[0], 404)
            self.assertEqual(request('POST', '/api/hotspots/x/research', {})[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
