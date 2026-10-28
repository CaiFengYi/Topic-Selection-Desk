import json
import os
import shutil
import unittest
import uuid
from unittest.mock import Mock, patch

from research_validation.core import Ledger, RunLock, ValidationError
from topic_workbench import research
from topic_workbench.service import ROOT, Workbench

QUOTE = '测试方否认踏板力达到1612N。'


def output(source='S1'):
    return {'status': 'ready', 'event': {'name': '任意事件', 'identity_notes': []},
            'background': [{'text': QUOTE, 'source_ids': [source], 'status': 'attributed', 'speaker': '测试方'}],
            'keywords': [{'id': 'K1', 'term': '1612N', 'quote': QUOTE, 'source_id': source,
                          'meaning': '被否认的力值', 'stance': 'denied', 'speaker': '测试方',
                          'concepts': ['力的量级']}],
            'evidence_groups': [{'label': '测试方声明', 'source_ids': [source], 'basis': '同一声明'}],
            'gaps': ['事件原因未知'], 'comparison': {}}


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.root = ROOT / 'validation-output/test-tmp' / ('research-' + uuid.uuid4().hex)
        self.output = self.root / 'shared'
        self.service = Workbench(self.root / 'data', self.root / 'news')
        self.record = self.service.save_hotspot({'title': '任意事件', 'entry_kind': 'manual'})
        self.body = {'operation_id': str(uuid.uuid4())}
        config = {'model': 'deepseek/deepseek-v4-flash', 'api_key': 'test-private', 'api_base': 'https://api.deepseek.com'}
        self.patches = [patch('topic_workbench.materials.OUTPUT', self.output),
                        patch('research_validation.cli.model_config', return_value=config),
                        patch.dict(os.environ, {'EXA_API_KEY': 'test-private'}),
                        patch('dotenv.load_dotenv'), patch('requests.get'), patch('requests.post'),
                        patch('litellm.completion')]
        mocks = [p.start() for p in self.patches]
        self.get, self.post, self.model = mocks[-3:]
        self.get.return_value = Mock(status_code=200, json=lambda: {'is_available': True})
        self.post.side_effect = [Mock(status_code=200, json=lambda: {'results': [{'url': 'https://example.com', 'title': '来源'}]}),
                                 Mock(status_code=200, json=lambda: {'results': [{'url': 'https://example.com', 'text': QUOTE * 30}]})]
        self.model.return_value = self.response(output())

    def response(self, data):
        return Mock(usage=Mock(model_dump=lambda: {'prompt_tokens': 100, 'completion_tokens': 100}),
                    choices=[Mock(message=Mock(content=json.dumps(data)), finish_reason='stop')], model='deepseek-v4-flash')

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.assertTrue(self.root.resolve().is_relative_to((ROOT / 'validation-output/test-tmp').resolve()))
        shutil.rmtree(self.root)

    def start(self):
        return research.start(self.service, self.record['id'], self.body)

    def test_sparse_research_persists_quotes_no_recommendation_or_extra_search(self):
        task = self.start()
        self.assertEqual(task['status'], 'completed')
        self.assertTrue(task['research_completed'])
        self.assertEqual(task['result']['keywords'], output()['keywords'])
        self.assertEqual(self.post.call_count, 2)
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual([e['operation'] for e in Ledger(self.output / 'ledger.json').data['entries']], ['search', 'contents', 'research'])
        self.assertEqual(self.start()['reuse'], 'operation')
        self.body = {'operation_id': str(uuid.uuid4())}
        self.assertEqual(self.start()['reuse'], 'result_cache')
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual(research.get_task(Workbench(self.service.data_dir), task['id'])['result'], task['result'])

    def test_clarification_stops_keywords_and_selection_reuses_only_selected_text(self):
        clarification = {'status': 'needs_clarification', 'event_candidates': [
            {'id': 'E1', 'label': '第一件事', 'source_ids': ['S1']},
            {'id': 'E2', 'label': '人工提供的另一事件', 'source_ids': ['M1']}]}
        self.service.save_hotspot({'title': '任意事件', 'entry_kind': 'manual',
                                  'manual_material': {'text': QUOTE, 'source_description': '字幕片段'}}, self.record['id'])
        self.model.side_effect = [self.response(clarification), self.response(output('M1'))]
        task = self.start()
        self.assertEqual(task['status'], 'needs_clarification')
        self.assertIsNone(task['result'])
        self.assertEqual(self.model.call_count, 1)
        selected = research.select_event(self.service, task['id'], {'event_id': 'E2'})
        self.assertTrue(selected['research_completed'])
        self.assertEqual(self.post.call_count, 2)
        payload = json.loads(self.model.call_args.kwargs['messages'][1]['content'])
        self.assertEqual([s['id'] for s in payload['sources']], ['M1'])
        self.assertEqual(payload['sources'][0]['kind'], 'manual')
        self.assertIsNone(payload['sources'][0]['read_at'])
        self.assertEqual(research.select_event(self.service, task['id'], {'event_id': 'E2'})['reuse'], 'operation')
        with self.assertRaises(BlockingIOError):
            research.select_event(self.service, task['id'], {'event_id': 'E1'})
        self.assertEqual(self.model.call_count, 2)

    def test_no_text_returns_honest_incomplete_without_model(self):
        self.post.side_effect = [Mock(status_code=200, json=lambda: {'results': []})]
        task = self.start()
        self.assertEqual(task['result']['status'], 'no_usable_text')
        self.assertFalse(task['research_completed'])
        self.assertFalse(task['result']['keywords'])
        self.model.assert_not_called()

    def test_manual_only_is_quoted_without_claiming_web_read(self):
        text = '  ' + QUOTE + '\n用户原始提交'
        self.service.save_hotspot({'title': '任意事件', 'entry_kind': 'manual',
                                  'manual_material': {'text': text, 'source_description': '评论'}}, self.record['id'])
        self.post.side_effect = [Mock(status_code=200, json=lambda: {'results': []})]
        self.model.return_value = self.response(output('M1'))
        task = self.start()
        self.assertTrue(task['research_completed'])
        self.assertEqual(task['materials'][0]['text'], text)
        self.assertEqual(task['materials'][0]['status'], 'manual')
        self.assertIsNone(task['materials'][0]['read_at'])

    def test_failed_paid_collection_with_manual_text_stops_before_model_and_replays(self):
        import requests
        for failure in (401, 402, 429, 'timeout'):
            with self.subTest(failure=failure):
                self.record = self.service.save_hotspot({'title': f'失败 {failure}', 'entry_kind': 'manual',
                    'manual_material': {'text': QUOTE, 'source_description': '人工材料'}})
                self.body = {'operation_id': str(uuid.uuid4())}
                self.post.reset_mock()
                self.post.side_effect = (requests.Timeout('test-private') if failure == 'timeout' else
                                         [Mock(status_code=failure)])
                task = self.start()
                self.assertEqual(task['status'], 'failed')
                self.assertFalse(task['research_completed'])
                self.assertEqual(task['materials'][-1]['text'], QUOTE)
                self.assertEqual(self.start()['id'], task['id'])
                self.assertEqual(self.post.call_count, 1)
                self.model.assert_not_called()
                self.assertNotIn('test-private', json.dumps(task))

    def test_invalid_quote_and_candidate_never_publish_result(self):
        for invalid in ('quote', 'candidate'):
            data = output()
            if invalid == 'quote':
                data['keywords'][0]['quote'] = '从未取得的1612N原文'
            else:
                data = {'status': 'needs_clarification', 'event_candidates': [{'id': 'E1', 'label': '伪造事件', 'source_ids': ['S99']}]}
            self.model.return_value = self.response(data)
            task = self.start()
            self.assertEqual(task['status'], 'failed')
            self.assertIsNone(task['result'])
            self.assertTrue(task['materials'])
            # A fresh hotspot has independent task identity, sharing the same ledger.
            if invalid == 'quote':
                self.record = self.service.save_hotspot({'title': '另一个事件', 'entry_kind': 'manual'})
                self.post.side_effect = [Mock(status_code=200, json=lambda: {'results': [{'url': 'https://example.com'}]}),
                                         Mock(status_code=200, json=lambda: {'results': [{'url': 'https://example.com', 'text': QUOTE * 30}]})]

    def test_model_failure_is_persisted_and_not_retried(self):
        self.model.side_effect = RuntimeError('private upstream details')
        task = self.start()
        self.assertEqual(task['status'], 'failed')
        self.assertTrue(task['materials'])
        self.assertNotIn('private', str(task))
        self.start()
        self.assertEqual(self.model.call_count, 1)
        self.assertGreater(Ledger(self.output / 'ledger.json').data['entries'][-1]['accounted_cny'], 0)

    def test_shared_budget_blocks_model_after_successful_collection(self):
        self.service.collect_materials(self.record['id'], self.body)
        ledger = Ledger(self.output / 'ledger.json')
        ledger.reserve('terminal', 'research', 5 - ledger.total)
        task = self.start()
        self.assertEqual(task['status'], 'blocked')
        self.assertTrue(task['materials'])
        self.model.assert_not_called()
        self.assertEqual(self.post.call_count, 2)

    def test_same_event_conflict_continues_with_attribution(self):
        data = output()
        data['background'][0].update(status='disputed', text='同事件来源对力值有分歧')
        data['gaps'] = ['不同来源说法有分歧，原因未知']
        self.model.return_value = self.response(data)
        task = self.start()
        self.assertEqual(task['status'], 'completed')
        self.assertEqual(task['event_candidates'], [])
        self.assertEqual(task['result']['background'][0]['status'], 'disputed')
        self.assertEqual(self.post.call_count, 2)

    def test_pending_and_attempt_limit_stop_before_model(self):
        self.service.collect_materials(self.record['id'], self.body)
        ledger = Ledger(self.output / 'ledger.json')
        ledger.reserve('workbench-' + self.record['id'], 'research', 0.1)
        self.assertEqual(self.start()['status'], 'blocked')
        self.model.assert_not_called()

    def test_four_prior_research_attempts_block_before_model(self):
        self.service.collect_materials(self.record['id'], self.body)
        ledger = Ledger(self.output / 'ledger.json')
        for _ in range(4):
            entry = ledger.reserve('workbench-' + self.record['id'], 'research', 0.01)
            ledger.finish(entry, status='failed')
        self.assertEqual(self.start()['status'], 'blocked')
        self.model.assert_not_called()

    def test_selection_invalid_id_and_lock_never_call_model(self):
        self.model.return_value = self.response({'status': 'needs_clarification', 'event_candidates': [
            {'id': 'E1', 'label': '事件', 'source_ids': ['S1']}]})
        task = self.start()
        with self.assertRaises(ValueError):
            research.select_event(self.service, task['id'], {'event_id': 'missing'})
        with RunLock(self.output), self.assertRaises(ValidationError):
            research.select_event(self.service, task['id'], {'event_id': 'E1'})
        self.assertEqual(self.model.call_count, 1)


if __name__ == '__main__':
    unittest.main()
