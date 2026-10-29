import copy
import http.client
import json
import os
import shutil
import threading
import unittest
from datetime import datetime, timezone
import uuid
from unittest.mock import Mock, patch
from functools import partial
from http.server import ThreadingHTTPServer

from research_validation.core import Ledger, RunLock, ValidationError, write_json
from topic_workbench import recommendation as rec
from topic_workbench.service import ROOT, Workbench
from topic_workbench.__main__ import Handler
from test_workbench_research import output


def topics(ids=('K1',), terms=('1612N',)):
    return {'topics': [{'id': f'T{i}', 'title': f'{term}到底有多大？', 'opening': '用可控示意探索一般知识。',
                        'question': f'{term}的量级如何理解？', 'keyword_ids': [kid],
                        'association_reason': '保留具体原词，脱离事件的独立问题',
                        'visuals': ['示意图'], 'verify_before_script': ['核对单位、计算和实验条件']}
                       for i, (kid, term) in enumerate(zip(ids, terms), 1)], 'reason': ''}


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        clock = self.enterContext(patch('research_validation.cli.datetime', wraps=datetime))
        clock.now.return_value = datetime(2026, 10, 27, tzinfo=timezone.utc)
        self.root = ROOT / 'validation-output/test-tmp' / ('recommend-' + uuid.uuid4().hex)
        self.output = self.root / 'shared'
        self.service = Workbench(self.root / 'data')
        self.hotspot = self.service.save_hotspot({'title': '任意事件', 'entry_kind': 'manual'})
        self.rid = str(uuid.uuid4())
        self.source = {'id': self.rid, 'hotspot_id': self.hotspot['id'], 'research_completed': True,
                       'input_hash': 'abc', 'result': {**output(), 'id': self.rid}}
        write_json(self.service.data_dir / 'research_tasks' / f'{self.rid}.json', self.source)
        config = {'model': 'deepseek/deepseek-v4-flash', 'api_key': 'test-private', 'api_base': 'https://api.deepseek.com'}
        self.patches = [patch('topic_workbench.materials.OUTPUT', self.output),
                        patch('research_validation.cli.model_config', return_value=config),
                        patch.dict(os.environ, {'EXA_API_KEY': 'test-private'}), patch('dotenv.load_dotenv'),
                        patch('requests.get', return_value=Mock(status_code=200, json=lambda: {'is_available': True})),
                        patch('requests.post'), patch('litellm.completion')]
        mocks = [p.start() for p in self.patches]
        self.account, self.search, self.model = mocks[-3:]
        self.model.return_value = self.response(topics())

    @staticmethod
    def response(data):
        return Mock(usage=Mock(model_dump=lambda: {'prompt_tokens': 100, 'completion_tokens': 100}),
                    choices=[Mock(message=Mock(content=json.dumps(data)), finish_reason='stop')], model='deepseek-v4-flash')

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.assertTrue(self.root.resolve().is_relative_to((ROOT / 'validation-output/test-tmp').resolve()))
        shutil.rmtree(self.root)

    def start(self, mode='direct', body=None):
        return rec.start(self.service, self.rid, body or {'operation_id': str(uuid.uuid4()), 'mode': mode})

    def edit(self, action, body, kid=None):
        return rec.edit(self.service, self.rid, action, body, kid)

    def test_correction_is_local_preserves_source_and_enters_effective_meaning(self):
        self.edit('correction', {'correction': '被否认的测试载荷，并非已证实事件事实'}, 'K1')
        self.model.assert_not_called()
        self.account.assert_not_called()
        task = self.start()
        self.assertEqual(task['status'], 'completed')
        payload = json.loads(self.model.call_args.kwargs['messages'][1]['content'])
        selected = payload['selection']['keywords']['K1']
        self.assertEqual(selected['meaning'], '被否认的测试载荷，并非已证实事件事实')
        self.assertEqual(selected['original_meaning'], output()['keywords'][0]['meaning'])
        self.assertEqual(selected['quote'], output()['keywords'][0]['quote'])
        self.assertEqual(task['result']['validation_scope'], 'structure_and_keyword_references')
        self.search.assert_not_called()
        self.assertEqual(rec.get_keywords(Workbench(self.service.data_dir), self.rid)['keywords'][0]['term'], '1612N')
        self.edit('correction', {'correction': None}, 'K1')
        self.assertIsNone(rec.get_keywords(self.service, self.rid)['keywords'][0]['correction'])
        self.assertEqual(rec.get_task(self.service, task['id'])['keyword_snapshot'][0]['correction'], selected['meaning'])

    def test_manual_only_current_selection_multiple_separate_topics_and_direct_excludes_manual(self):
        old = self.edit('manual', {'term': '旧补词', 'meaning': ''})['keywords'][-1]
        new = self.edit('manual', {'term': '踏板', 'meaning': '创作线索'})['keywords'][-1]
        self.assertFalse(new['verified'])
        self.assertIsNone(new['source_id'])
        self.assertEqual(rec.get_keywords(self.service, self.rid)['keyword_ids'], [])
        self.edit('selection', {'keyword_ids': ['K1', new['id']]})
        self.model.return_value = self.response(topics(('K1', new['id']), ('1612N', '踏板')))
        task = self.start('manual')
        self.assertEqual(len(task['result']['candidates']), 2)
        self.assertEqual([k['id'] for k in task['keyword_snapshot']], ['K1', new['id']])
        self.assertNotIn(old['id'], str(task))
        self.edit('selection', {'keyword_ids': ['K1']})
        self.model.return_value = self.response(topics())
        self.assertEqual([k['id'] for k in self.start('manual')['keyword_snapshot']], ['K1'])
        self.assertEqual([k['id'] for k in self.start()['keyword_snapshot']], ['K1'])
        self.search.assert_not_called()

    def test_replay_uses_original_snapshot_and_new_operation_calls_model(self):
        body = {'operation_id': str(uuid.uuid4()), 'mode': 'direct'}
        first = self.start(body=body)
        self.edit('correction', {'correction': '新解释'}, 'K1')
        again = self.start(body=body)
        self.assertEqual(again['id'], first['id'])
        self.assertIsNone(again['keyword_snapshot'][0]['correction'])
        self.assertEqual(again['reuse'], 'operation')
        with self.assertRaises(BlockingIOError):
            self.start(body={**body, 'mode': 'manual'})
        self.assertNotEqual(self.start()['id'], first['id'])
        self.assertEqual(self.model.call_count, 2)

    def test_empty_requires_reason_and_is_persisted(self):
        self.model.return_value = self.response({'topics': [], 'reason': '当前词不足以提出独立问题'})
        task = self.start()
        self.assertEqual(task['status'], 'completed')
        self.assertEqual(task['result']['candidates'], [])
        self.assertTrue(task['result']['empty_reason'])
        self.model.return_value = self.response({'topics': [], 'reason': ''})
        self.assertEqual(self.start()['status'], 'failed')

    def test_new_batch_avoids_saved_angles_uses_current_selection_and_survives_restart(self):
        first = self.start()
        manual = self.edit('manual', {'term': '踏板', 'meaning': '创作线索'})['keywords'][-1]
        self.edit('selection', {'keyword_ids': [manual['id']]})
        self.edit('correction', {'correction': '当前解释'}, manual['id'])
        self.model.return_value = self.response(topics((manual['id'],), ('踏板',)))
        second = self.start('manual')
        payload = json.loads(self.model.call_args.kwargs['messages'][1]['content'])
        self.assertEqual(payload['previous_angles'], [{'title': first['result']['candidates'][0]['title'],
                                                      'question': first['result']['candidates'][0]['knowledge_question']}])
        self.assertEqual(list(payload['selection']['keywords']), [manual['id']])
        self.assertEqual(payload['selection']['keywords'][manual['id']]['meaning'], '当前解释')
        self.assertNotEqual(first['result']['input_hash'], second['result']['input_hash'])
        self.assertEqual(self.model.call_count, 2)
        self.search.assert_not_called()
        self.service = Workbench(self.service.data_dir)
        self.edit('correction', {'correction': '后续解释'}, manual['id'])
        saved = rec.saved_tasks(self.service, self.rid)['tasks']
        self.assertEqual(saved, [first, second])
        self.assertEqual(saved[1]['keyword_snapshot'][0]['correction'], '当前解释')
        self.assertEqual(self.start(body={'operation_id': second['operation_id'], 'mode': 'manual'})['id'], second['id'])
        self.assertEqual(self.model.call_count, 2)

    def test_budget_after_success_keeps_history_without_model_or_retrieval(self):
        first = self.start()
        ledger = Ledger(self.output / 'ledger.json')
        ledger.reserve('other', 'research', ledger.cap - ledger.total)
        blocked = self.start()
        self.assertEqual(blocked['status'], 'blocked')
        self.assertEqual(rec.saved_tasks(self.service, self.rid)['tasks'][0], first)
        self.assertEqual(self.model.call_count, 1)
        self.search.assert_not_called()

    def test_simultaneous_same_operation_charges_once(self):
        body = {'operation_id': str(uuid.uuid4()), 'mode': 'direct'}
        entered, release = threading.Event(), threading.Event()

        def response(**kwargs):
            entered.set()
            self.assertTrue(release.wait(10))
            return self.response(topics())

        self.model.side_effect = response
        results = []
        worker = threading.Thread(target=lambda: results.append(self.start(body=body)))
        worker.start()
        try:
            self.assertTrue(entered.wait(10))
            with self.assertRaises(ValidationError):
                self.start(body=body)
        finally:
            release.set()
            worker.join(10)
        self.assertEqual(results[0]['status'], 'completed')
        self.assertEqual(self.start(body=body)['id'], results[0]['id'])
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual(len(Ledger(self.output / 'ledger.json').data['entries']), 1)

    def test_bad_outputs_never_replace_saved_success(self):
        original = self.start()
        invalid = []
        too_many = topics(('K1',) * 4, ('1612N',) * 4)
        invalid.append(too_many)
        for field, value in [('keyword_ids', ['U-unknown']), ('title', '错误替换成1000N'),
                             ('visuals', []), ('verify_before_script', [42])]:
            bad = copy.deepcopy(topics())
            bad['topics'][0][field] = value
            invalid.append(bad)
        for bad in invalid:
            self.model.return_value = self.response(bad)
            self.assertEqual(self.start()['status'], 'failed')
        self.assertEqual(rec.get_task(self.service, original['id']), original)
        self.assertEqual(rec.research.get_task(self.service, self.rid), self.source)

    def test_failure_is_replayed_retains_reserve_and_does_not_retry(self):
        self.model.side_effect = RuntimeError('test-private')
        body = {'operation_id': str(uuid.uuid4()), 'mode': 'direct'}
        task = self.start(body=body)
        self.assertEqual(task['status'], 'failed')
        self.assertNotIn('test-private', json.dumps(task))
        self.assertGreater(Ledger(self.output / 'ledger.json').total, 0)
        self.assertEqual(self.start(body=body)['id'], task['id'])
        self.assertEqual(self.model.call_count, 1)

    def test_budget_pending_price_account_and_lock_block_without_model(self):
        ledger = Ledger(self.output / 'ledger.json')
        entry = ledger.reserve('terminal', 'research', 5)
        self.assertEqual(self.start()['status'], 'blocked')
        self.model.assert_not_called()
        ledger.finish(entry, 0)
        ledger.reserve('workbench-' + self.hotspot['id'], 'recommend', 0.1)
        self.assertEqual(self.start()['status'], 'blocked')
        self.model.assert_not_called()
        with RunLock(self.output):
            with self.assertRaises(ValidationError):
                self.start()

    def test_price_and_account_protection(self):
        with patch('research_validation.cli.price_check', side_effect=ValidationError('expired')):
            self.assertEqual(self.start()['status'], 'blocked')
        self.account.return_value = Mock(status_code=200, json=lambda: {'is_available': False})
        self.assertEqual(self.start()['status'], 'blocked')
        self.model.assert_not_called()

    def test_invalid_request_selection_and_forged_snapshots_never_call_model(self):
        for body in [{'operation_id': 'bad', 'mode': 'direct'}, {'operation_id': str(uuid.uuid4()), 'mode': 'other'},
                     {'operation_id': str(uuid.uuid4()), 'mode': 'direct', 'keywords': []}]:
            with self.assertRaises(ValueError):
                self.start(body=body)
        for ids in [['unknown'], ['K1', 'K1'], [42]]:
            with self.assertRaises(ValueError):
                self.edit('selection', {'keyword_ids': ids})
        with self.assertRaises(ValueError):
            self.start('manual')
        self.model.assert_not_called()

    def test_http_routes_local_guard_and_persisted_task(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'topic_workbench/public')))
        server.workbench = self.service
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()

        def request(method, path, body=None, origin=None):
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=30)
            headers = {'Content-Type': 'application/json'}
            if origin:
                headers['Origin'] = origin
            try:
                conn.request(method, path, None if body is None else json.dumps(body), headers)
                response = conn.getresponse()
                return response.status, json.loads(response.read())
            finally:
                conn.close()

        try:
            base = f'/api/research/{self.rid}'
            self.assertEqual(request('GET', '/api/budget')[1]['cap_cny'], 5)
            self.assertEqual(request('GET', '/api/budget', origin='https://evil.example')[0], 403)
            self.assertEqual(request('PATCH', base + '/keywords/K1', {'correction': '修正'})[0], 200)
            self.assertEqual(request('PUT', base + '/selection', {'keyword_ids': ['K1']})[0], 200)
            self.assertEqual(request('PUT', base + '/selection', {'keyword_ids': []}, 'https://evil.example')[0], 403)
            body = {'operation_id': str(uuid.uuid4()), 'mode': 'manual'}
            self.assertEqual(request('POST', base + '/recommendations', {**body, 'keywords': []})[0], 400)
            status, task = request('POST', base + '/recommendations', body)
            self.assertEqual(status, 200)
            self.assertEqual(task['status'], 'completed')
            self.assertEqual(request('GET', '/api/tasks/' + task['id'])[1]['result'], task['result'])
            self.assertEqual(request('POST', base + '/recommendations', body)[1]['reuse'], 'operation')
            self.assertEqual(request('GET', base + '/recommendations')[1]['tasks'][0]['id'], task['id'])
            draft_path = f"/api/rounds/{task['id']}/drafts/T1"
            self.assertEqual(request('PATCH', draft_path, {'status': 'selected'}, 'https://evil.example')[0], 403)
            self.assertEqual(request('PATCH', draft_path, {'title': '人工标题', 'opening': '人工开场', 'status': 'selected'})[0], 200)
            self.assertEqual(request('GET', '/api/tasks/' + task['id'])[1]['result']['candidates'][0]['draft']['title'], '人工标题')
            self.assertEqual(request('PATCH', draft_path, {'status': 'invalid'})[0], 400)
            self.assertEqual(request('PATCH', draft_path + '-missing', {'status': 'selected'})[0], 404)
            self.assertEqual(self.model.call_count, 1)
            self.search.assert_not_called()
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_drafts_independent_across_candidates_rounds_and_restart_without_paid_calls(self):
        self.model.return_value = self.response(topics(('K1', 'K1'), ('1612N', '1612N')))
        first, second = self.start(), self.start()
        self.model.reset_mock()
        self.account.reset_mock()
        ledger = (self.output / 'ledger.json').read_bytes()
        source = rec.task_path(self.service, first['id']).read_bytes()
        rec.edit_draft(self.service, first['id'], 'T1', {'title': '人工标题', 'opening': '人工开场'})
        for cid in ('T1', 'T2'):
            rec.edit_draft(self.service, first['id'], cid, {'status': 'selected'})
        reopened = Workbench(self.service.data_dir)
        candidates = rec.get_task(reopened, first['id'])['result']['candidates']
        self.assertEqual([c['draft']['status'] for c in candidates], ['selected', 'selected'])
        self.assertEqual(candidates[0]['draft']['title'], '人工标题')
        self.assertEqual(candidates[0]['draft']['opening'], '人工开场')
        rec.edit_draft(reopened, first['id'], 'T1', {'status': 'discarded'})
        candidates = rec.saved_tasks(reopened, self.rid)['tasks'][0]['result']['candidates']
        self.assertEqual([c['draft']['status'] for c in candidates], ['discarded', 'selected'])
        self.assertEqual(candidates[0]['draft']['title'], '人工标题')
        self.assertEqual(rec.get_task(reopened, second['id'])['result']['candidates'][0]['draft']['status'], 'pending')
        self.assertEqual(rec.task_path(self.service, first['id']).read_bytes(), source)
        self.assertEqual((self.output / 'ledger.json').read_bytes(), ledger)
        self.model.assert_not_called()
        self.account.assert_not_called()
        self.search.assert_not_called()

    def test_invalid_draft_edits_preserve_saved_content(self):
        task = self.start()
        draft = rec.edit_draft(self.service, task['id'], 'T1', {'status': 'selected'})
        for body in ({}, {'title': ''}, {'opening': ' '}, {'title': 'x' * 201},
                     {'opening': 'x' * 2001}, {'status': []}, {'title': 42}, {'selected': True}):
            with self.assertRaises(ValueError):
                rec.edit_draft(self.service, task['id'], 'T1', body)
        with self.assertRaises(FileNotFoundError):
            rec.edit_draft(self.service, task['id'], 'missing', {'status': 'selected'})
        self.assertEqual(rec.get_task(self.service, task['id'])['result']['candidates'][0]['draft'], draft)

    def test_current_budget_is_read_only_and_distinguishes_uncertain_reservations(self):
        self.assertEqual(rec.materials.budget_summary()['accounted_cny'], 0)
        self.assertFalse((self.output / 'ledger.json').exists())
        ledger = Ledger(self.output / 'ledger.json')
        ledger.finish(ledger.reserve('terminal', 'research', 0.2), 0.1, cost_basis='peak_rate_usage_estimate')
        ledger.finish(ledger.reserve('terminal', 'recommend', 0.3), status='failed')
        ledger.reserve('workbench-' + self.hotspot['id'], 'recommend', 0.4)
        before = ledger.path.read_bytes()
        self.assertEqual(rec.materials.budget_summary(), {
            'accounted_cny': 0.8, 'cap_cny': 5.0, 'uncertain_cny': 0.7,
            'pending_count': 1, 'pricing_overrun': False})
        self.assertEqual(ledger.path.read_bytes(), before)
        self.model.assert_not_called()
        self.account.assert_not_called()
        self.search.assert_not_called()

    def test_interrupted_recommendation_preserves_rounds_drafts_and_pending_after_reopen(self):
        first = self.start()
        draft = rec.edit_draft(self.service, first['id'], 'T1', {'title': '已保存标题', 'status': 'selected'})
        body = {'operation_id': str(uuid.uuid4()), 'mode': 'direct'}
        self.model.side_effect = SystemExit('simulated process interruption')
        with self.assertRaises(SystemExit):
            self.start(body=body)
        before = (self.output / 'ledger.json').read_bytes()
        self.service = Workbench(self.service.data_dir)
        history = rec.saved_tasks(self.service, self.rid)['tasks']
        self.assertEqual(history[0]['result']['candidates'][0]['draft'], draft)
        self.assertEqual(history[-1]['status'], 'running')
        self.assertEqual(self.start(body=body)['status'], 'running')
        self.assertEqual(self.start()['status'], 'blocked')
        self.assertEqual((self.output / 'ledger.json').read_bytes(), before)
        self.assertEqual(rec.materials.budget_summary()['pending_count'], 1)
        self.assertEqual(self.model.call_count, 2)
        self.search.assert_not_called()

    def test_account_http_errors_and_model_timeout_keep_real_history_without_retries(self):
        import requests
        first = self.start()
        for status in (401, 402, 429):
            with self.subTest(status=status):
                self.account.return_value = Mock(status_code=status)
                self.assertEqual(self.start()['status'], 'blocked')
                self.assertEqual(self.model.call_count, 1)
        self.account.return_value = Mock(status_code=200, json=lambda: {'is_available': True})
        self.model.side_effect = requests.Timeout('test-private')
        body = {'operation_id': str(uuid.uuid4()), 'mode': 'direct'}
        failed = self.start(body=body)
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(self.start(body=body)['id'], failed['id'])
        self.assertEqual(self.model.call_count, 2)
        self.assertEqual(rec.get_task(self.service, first['id']), first)
        self.assertNotIn('test-private', json.dumps(rec.saved_tasks(self.service, self.rid)))
        self.assertNotIn('test-private', ''.join(p.read_text(encoding='utf-8') for p in self.root.rglob('*.json')))


if __name__ == '__main__':
    unittest.main()
