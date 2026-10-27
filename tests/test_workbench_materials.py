import copy
import os
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from research_validation.cli import Runner, SETTINGS_PATH
from research_validation.core import Ledger, RunLock, ValidationError, read_json, write_json
from topic_workbench.service import ROOT, Workbench


CONFIG = {"model": "deepseek/deepseek-v4-flash", "api_key": "test-private-model",
          "api_base": "https://api.deepseek.com"}


def response(data):
    from unittest.mock import Mock
    return Mock(status_code=200, json=lambda: data)


class MaterialsTests(unittest.TestCase):
    def setUp(self):
        self.root = ROOT / 'validation-output/test-tmp' / ('materials-' + uuid.uuid4().hex)
        self.root.mkdir(parents=True)
        self.output = self.root / 'shared'
        self.service = Workbench(self.root / 'data', self.root / 'news')
        self.record = self.service.save_hotspot({'title': '任意事件 <script>', 'entry_kind': 'manual',
                                                'location': '某地', 'focus': '来源说法'})
        self.operation = {'operation_id': str(uuid.uuid4())}
        self.patches = [patch('topic_workbench.materials.OUTPUT', self.output),
                        patch('research_validation.cli.model_config', return_value=CONFIG),
                        patch.dict(os.environ, {'EXA_API_KEY': 'test-private-exa'}),
                        patch('dotenv.load_dotenv'), patch('requests.get'), patch('requests.post')]
        self.mocks = [p.start() for p in self.patches]
        self.get, self.post = self.mocks[-2:]
        self.get.return_value = response({'is_available': True})
        self.search = {'results': [{'title': f'来源{i}', 'url': f'https://example{i}.com/a',
                                   'publishedDate': None} for i in range(1, 5)]}
        self.contents = {'results': [{'url': row['url'], 'text': ('实际正文 <x> ' * 40 if i < 2 else '太短')}
                                    for i, row in enumerate(self.search['results'])]}
        self.post.side_effect = [response(self.search), response(self.contents)]

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.assertTrue(self.root.resolve().is_relative_to((ROOT / 'validation-output/test-tmp').resolve()))
        shutil.rmtree(self.root)

    def collect(self, operation=None):
        return self.service.collect_materials(self.record['id'], operation or self.operation)

    def test_success_counts_duplicates_failures_and_replays_without_network(self):
        with patch.object(Runner, 'model_call', side_effect=AssertionError('No model')):
            task = self.collect()
        self.assertEqual(task['status'], 'completed')
        self.assertFalse(task['research_completed'])
        self.assertEqual([s['status'] for s in task['materials']], ['body', 'duplicate', 'read_failed', 'read_failed'])
        self.assertEqual(len(task['warnings']), 2)
        self.assertEqual(self.post.call_count, 2)
        self.assertEqual(self.get.call_count, 1)
        self.assertEqual(self.post.call_args_list[0].kwargs['json']['query'], '任意事件 <script> 某地 来源说法')
        self.assertLessEqual(len(self.post.call_args_list[1].kwargs['json']['urls']), 5)
        self.assertTrue(all(s['read_at'] for s in task['materials']))
        self.assertTrue(all(s['published_at'] is None for s in task['materials']))
        self.assertEqual(self.collect()['reuse'], 'operation')
        self.assertEqual(self.collect({'operation_id': str(uuid.uuid4())})['reuse'], 'result_cache')
        restarted = Workbench(self.service.data_dir, self.service.news_dir)
        self.assertEqual(restarted.material_tasks(self.record['id'])['tasks'][0]['materials'], task['materials'])
        self.assertEqual(self.post.call_count, 2)
        self.assertEqual(len(Ledger(self.output / 'ledger.json').data['entries']), 2)
        self.assertFalse((self.service.data_dir / 'ledger.json').exists())

    def test_timeout_preserves_search_sources_and_uncertain_reservation(self):
        import requests
        self.post.side_effect = [response(self.search), requests.Timeout('secret transport detail')]
        task = self.collect()
        self.assertEqual(task['status'], 'failed')
        self.assertEqual(len(task['search_results']), 4)
        self.assertTrue(all(s['status'] == 'read_failed' and s['error'] for s in task['materials']))
        ledger = Ledger(self.output / 'ledger.json')
        self.assertEqual(ledger.data['entries'][-1]['status'], 'failed')
        self.assertEqual(ledger.data['entries'][-1]['accounted_cny'], ledger.data['entries'][-1]['reserved_cny'])
        self.collect({'operation_id': str(uuid.uuid4())})
        self.assertEqual(self.post.call_count, 2)
        self.assertNotIn('secret transport detail', str(task))

    def test_shared_budget_from_terminal_stops_new_requests(self):
        ledger = Ledger(self.output / 'ledger.json')
        ledger.reserve('brakes', 'research', 4.99)
        task = self.collect()
        self.assertEqual(task['status'], 'blocked')
        self.post.assert_not_called()
        self.assertEqual(task['budget']['accounted_cny'], 4.99)
        self.assertEqual(len(Ledger(ledger.path).data['entries']), 1)

    def test_expired_price_and_unavailable_account_block_before_paid_calls(self):
        settings = copy.deepcopy(read_json(SETTINGS_PATH))
        settings['pricing']['valid_until'] = '2000-01-01T00:00:00+00:00'
        expired = self.root / 'expired.json'
        write_json(expired, settings)
        with patch('research_validation.cli.SETTINGS_PATH', expired):
            self.assertEqual(self.collect()['status'], 'blocked')
        self.post.assert_not_called()
        self.get.assert_not_called()
        other = self.service.save_hotspot({'title': '另一个', 'entry_kind': 'manual'})
        self.get.return_value = response({'is_available': False})
        task = self.service.collect_materials(other['id'], {'operation_id': str(uuid.uuid4())})
        self.assertEqual(task['status'], 'blocked')
        self.post.assert_not_called()
        self.assertFalse((self.output / 'ledger.json').exists())

    def test_lock_conflict_and_operation_payload_conflict(self):
        with RunLock(self.output):
            with self.assertRaises(ValidationError):
                self.collect()
        self.post.assert_not_called()
        self.collect()
        self.service.save_hotspot({'title': '已修改', 'entry_kind': 'manual'}, self.record['id'])
        with self.assertRaises(BlockingIOError):
            self.collect()
        self.assertEqual(self.post.call_count, 2)

    def test_empty_search_only_warns_and_never_fetches_contents(self):
        self.post.side_effect = [response({'results': []})]
        task = self.collect()
        self.assertEqual(task['materials'], [])
        self.assertTrue(task['warnings'])
        self.assertEqual(self.post.call_count, 1)

    def test_input_changes_do_not_reset_hotspot_call_limits(self):
        self.collect()
        self.service.save_hotspot({'title': '修改标题', 'entry_kind': 'manual'}, self.record['id'])
        self.post.side_effect = [response(self.search)]
        task = self.collect({'operation_id': str(uuid.uuid4())})
        self.assertEqual(task['status'], 'failed')
        self.assertTrue(all(s['status'] == 'read_failed' for s in task['materials']))
        self.assertEqual(self.post.call_count, 3)
        self.service.save_hotspot({'title': '再次修改', 'entry_kind': 'manual'}, self.record['id'])
        self.collect({'operation_id': str(uuid.uuid4())})
        self.assertEqual(self.post.call_count, 3)

    def test_attempt_limits_and_pending_request_block_before_network(self):
        runner = Runner(self.output)
        runner.ledger.reserve('case', 'search', 0.1)
        with self.assertRaises(ValidationError):
            runner.exa('case', 'search', {'query': 'interrupted'})
        runner.ledger.data['entries'][0]['status'] = 'failed'
        runner.ledger.reserve('case', 'search', 0.1)['status'] = 'failed'
        with self.assertRaises(ValidationError):
            runner.exa('case', 'search', {'query': 'third'})
        runner.ledger.reserve('case', 'contents', 0.1)['status'] = 'failed'
        with self.assertRaises(ValidationError):
            runner.exa('case', 'contents', {'urls': []})
        self.post.assert_not_called()

    def test_interrupted_task_exposes_partial_files_without_resuming(self):
        task = self.collect()
        task['status'] = 'running'
        task['materials'] = []
        write_json(self.service.data_dir / 'tasks' / f"{task['id']}.json", task)
        self.assertEqual(len(self.service.material_tasks(self.record['id'])['tasks'][0]['materials']), 4)
        self.assertEqual(self.collect()['status'], 'running')
        self.assertEqual(self.post.call_count, 2)

    def test_http_collection_and_readback_reject_demo_and_cross_origin(self):
        import json
        import threading
        from functools import partial
        from http.client import HTTPConnection
        from http.server import ThreadingHTTPServer
        from topic_workbench.__main__ import Handler
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'topic_workbench/public')))
        server.workbench = self.service
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = '/api/hotspots/' + self.record['id']
        def request(method, path, body=None, origin=None):
            conn = HTTPConnection('127.0.0.1', server.server_port)
            headers = {'Content-Type': 'application/json'}
            if origin:
                headers['Origin'] = origin
            conn.request(method, path, json.dumps(body) if body is not None else None, headers)
            res = conn.getresponse()
            status, data = res.status, json.loads(res.read())
            conn.close()
            return status, data
        try:
            self.assertEqual(request('POST', base + '/research', {**self.operation, 'demo_scenario': 'normal'})[0], 400)
            self.assertEqual(request('POST', base + '/research', self.operation, 'https://evil.example')[0], 403)
            # This endpoint now continues into ticket07 after collection.
            with patch('topic_workbench.research.run', side_effect=lambda service, task: task):
                status, task = request('POST', base + '/research', self.operation)
            self.assertEqual(status, 200)
            self.assertEqual(task['status'], 'completed')
            self.assertEqual(request('GET', base + '/materials')[1]['tasks'][0]['id'], task['id'])
            self.assertEqual(self.post.call_count, 2)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
