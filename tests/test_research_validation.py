import json
import os
import shutil
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch

from research_validation.cli import Runner, price_check
from research_validation.core import (Ledger, RunLock, ValidationError, canonical_url,
                                      check_research, check_topics, digest, read_json, write_json)


QUOTE = "测试中测得踏板力为1612N，测试方随后发布了相关说明。"


def material():
    return [{"id": "S1", "status": "body", "text": QUOTE * 12},
            {"id": "S2", "status": "body", "text": "另一份实际读到的材料正文。"}]


def research():
    return {"event": {"name": "测试事件", "identity_notes": ["用户称M8，报道标注M9"]},
            "background": [{"text": "测试方公布测量结果", "source_ids": ["S1"],
                            "status": "attributed", "speaker": "测试方"}],
            "keywords": [{"id": "K1", "term": "1612N", "quote": QUOTE, "source_id": "S1",
                          "meaning": "测试方给出的力值", "stance": "affirmed", "concepts": ["力"], "speaker": "测试方"}],
            "evidence_groups": [{"label": "同一声明的转载", "source_ids": ["S1", "S2"], "basis": "相同原始声明"}],
            "comparison": {}, "gaps": []}


def topics():
    return {"topics": [{"id": "T1", "title": "1612N到底有多大？", "opening": "这个力是什么量级？",
                        "keyword_ids": ["K1"], "question": "如何理解力的量级", "association_reason": "保留原数字",
                        "visuals": ["测力计示意动画"], "verify_before_script": ["核对力的单位"]}], "reason": ""}


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.test_root = Path(__file__).resolve().parents[1] / "validation-output" / "test-tmp"
        self.test_root.mkdir(parents=True, exist_ok=True)
        # Python 3.12 mkdtemp's private Windows ACL excludes the sandbox token.
        self.path = self.test_root / ("case-" + uuid.uuid4().hex)
        self.path.mkdir()

    def tearDown(self):
        if not self.path.resolve().is_relative_to(self.test_root.resolve()):
            raise RuntimeError("Refusing cleanup outside the test workspace")
        shutil.rmtree(self.path)

    def test_budget_blocks_before_request_and_persists_uncertain_charge(self):
        ledger = Ledger(self.path / "ledger.json")
        pending = ledger.reserve("brakes", "search", 4.95)
        ledger.finish(pending, status="failed", error="Timeout")
        restarted = Ledger(ledger.path)
        self.assertEqual(restarted.total, 4.95)
        with self.assertRaises(ValidationError):
            restarted.reserve("memory", "research", 0.06)
        self.assertEqual(len(restarted.data["entries"]), 1)

    def test_actual_cost_releases_unused_reservation(self):
        ledger = Ledger(self.path / "ledger.json")
        entry = ledger.reserve("brakes", "research", 0.5)
        ledger.finish(entry, 0.02)
        self.assertEqual(Ledger(ledger.path).total, 0.02)
        self.assertEqual(entry["status"], "success")

    def test_unexpected_price_stops_further_spending(self):
        ledger = Ledger(self.path / "ledger.json")
        entry = ledger.reserve("brakes", "search", 0.01)
        ledger.finish(entry, 0.02)
        with self.assertRaises(ValidationError):
            ledger.reserve("brakes", "search", 0.01)

    def test_budget_cannot_be_raised_or_reset_by_new_runner(self):
        ledger = Ledger(self.path / "ledger.json", 1)
        ledger.reserve("brakes", "search", 0.9)
        other = Ledger(ledger.path, 100)
        self.assertEqual(other.cap, 1)
        with self.assertRaises(ValidationError):
            other.reserve("brakes", "search", 0.2)

    def test_process_lock_rejects_overlapping_work(self):
        with RunLock(self.path):
            with self.assertRaises(ValidationError):
                with RunLock(self.path):
                    pass

    def test_secrets_are_redacted_from_nested_files(self):
        with patch.dict(os.environ, {"EXA_API_KEY": "test-exa-private-value"}):
            write_json(self.path / "response.json", {"text": "echo test-exa-private-value"})
        self.assertNotIn("test-exa-private-value", (self.path / "response.json").read_text())

    def test_source_urls_normalize_tracking_but_preserve_semantic_query(self):
        self.assertEqual(canonical_url("https://EXAMPLE.com/a?id=3&utm_source=x#p"), "https://example.com/a?id=3")
        self.assertIsNone(canonical_url("http://example.com"))
        self.assertIsNone(canonical_url("https://secret@example.com/a"))

    def test_number_unit_and_denial_are_preserved(self):
        data = research()
        data["keywords"][0]["stance"] = "denied"
        self.assertEqual(check_research(data, material(), "brakes")["keywords"][0]["term"], "1612N")
        self.assertEqual(data["keywords"][0]["stance"], "denied")

    def test_fabricated_quote_or_source_is_rejected(self):
        for field, value in (("quote", "测试中测得踏板力为1000N，测试方随后发布了相关说明。"),
                             ("source_id", "S99"), ("term", "1000N")):
            data = research()
            data["keywords"][0][field] = value
            with self.assertRaises(ValidationError):
                check_research(data, material(), "brakes")

    def test_short_but_exact_quote_is_valid(self):
        data = research()
        data["keywords"][0]["quote"] = "踏板力为1612N"
        self.assertLess(len(data["keywords"][0]["quote"]), 15)
        check_research(data, material(), "brakes")

    def test_summary_and_duplicate_cannot_count_as_second_read_source(self):
        for status in ("search_summary", "duplicate", "read_failed"):
            sources = material()
            sources[1]["status"] = status
            with self.assertRaises(ValidationError):
                check_research(research(), sources, "brakes")

    def test_attributed_claim_requires_speaker(self):
        data = research()
        data["background"][0]["speaker"] = ""
        with self.assertRaises(ValidationError):
            check_research(data, material(), "brakes")

    def test_background_denial_keeps_attribution_category(self):
        data = research()
        data["background"][0].update(text="厂商否认该说法", speaker="厂商", status="denied")
        with self.assertRaises(ValidationError):
            check_research(data, material(), "brakes")
        data["background"][0]["status"] = "attributed"
        check_research(data, material(), "brakes")

    def test_memory_requires_evidence_for_comparison(self):
        with self.assertRaises(ValidationError):
            check_research(research(), material(), "memory")

    def test_missing_comparison_is_preserved_with_explicit_gap(self):
        data = research()
        data["comparison"] = {"left": "", "right": ""}
        data["gaps"] = ["缺少同容量、同口径、同一时点的双方报价"]
        self.assertEqual(check_research(data, material(), "memory")["gaps"], data["gaps"])

    def test_attributed_keyword_requires_source_speaker(self):
        data = research()
        data["keywords"][0]["stance"] = "attributed"
        check_research(data, material(), "brakes")
        data["keywords"][0]["speaker"] = ""
        with self.assertRaises(ValidationError):
            check_research(data, material(), "brakes")

    def test_memory_growth_rates_are_not_price_inversion(self):
        data = research()
        quote = "在相同容量条件下，16Gb DDR4现货报价高于DDR5。"
        sources = material()
        sources[0]["text"] += quote
        data["comparison"] = {"left": "16Gb DDR4现货", "right": "同容量DDR5现货", "conditions": "同一供货方当日报价",
                              "source_id": "S1", "quote": quote}
        check_research(data, sources, "memory")
        data["comparison"].update(left="DDR4三个月涨幅24%", right="DDR5三个月涨幅20%")
        with self.assertRaises(ValidationError):
            check_research(data, sources, "memory")

    def test_manual_choice_and_recognizable_anchor(self):
        selected = {"K1": research()["keywords"][0]}
        check_topics(topics(), selected)
        data = topics()
        data["topics"][0]["title"] = "1000N到底有多大？"
        with self.assertRaises(ValidationError):
            check_topics(data, selected)
        with self.assertRaises(ValidationError):
            check_topics(topics(), {"K2": {"term": "踏板"}})

    def test_no_viable_topic_is_allowed_with_reason(self):
        check_topics({"topics": [], "reason": "材料不足以提出独立知识问题"}, {})

    def test_exa_errors_are_recorded_without_retry_or_secret_logging(self):
        for status in (401, 402, 429, 503):
            folder = self.path / str(status)
            with patch("research_validation.cli.model_config", return_value={"model": "deepseek/deepseek-v4-flash", "api_key": "private", "api_base": "https://api.deepseek.com"}), \
                 patch.dict(os.environ, {"EXA_API_KEY": "test-exa-private-value"}), \
                 patch.object(Runner, "check_accounts"), \
                 patch("requests.post") as post:
                post.return_value.status_code = status
                runner = Runner(folder)
                with self.assertRaises(ValidationError):
                    runner.exa("brakes", "search", {"query": "test"})
                with self.assertRaises(ValidationError):
                    Runner(folder).exa("brakes", "search", {"query": "test"})
                self.assertEqual(post.call_count, 1)
                self.assertGreater(Ledger(folder / "ledger.json").total, 0)

    def test_research_cache_stops_before_recommendation_and_preserves_edits(self):
        cached = {"status": "ready", "data": research(), "source_hash": digest(material())}
        write_json(self.path / "brakes/research.json", cached)
        write_json(self.path / "brakes/sources.json", material())
        write_json(self.path / "brakes/human_edits.json", {"topic_notes": ["保留人工标题"]})
        with patch("research_validation.cli.model_config", return_value={}), \
             patch.object(Runner, "model_call") as call, patch.object(Runner, "gather") as gather:
            self.assertEqual(Runner(self.path).research("brakes"), cached)
            call.assert_not_called()
            gather.assert_not_called()
        self.assertEqual(read_json(self.path / "brakes/human_edits.json")["topic_notes"], ["保留人工标题"])

    def test_expired_prices_or_other_provider_stop_calls(self):
        settings = {"pricing": {"valid_until": "2000-01-01T00:00:00+00:00"}}
        with self.assertRaises(ValidationError):
            price_check(settings, {"model": "deepseek/deepseek-v4-flash"})

    def test_empty_balance_blocks_paid_search_without_reservation(self):
        config = {"model": "deepseek/deepseek-v4-flash", "api_key": "private", "api_base": "https://api.deepseek.com"}
        with patch("research_validation.cli.model_config", return_value=config), \
             patch.dict(os.environ, {"EXA_API_KEY": "test-exa-private-value"}), \
             patch("requests.get") as get, patch("requests.post") as post:
            get.return_value.status_code = 200
            get.return_value.json.return_value = {"is_available": False}
            runner = Runner(self.path)
            with self.assertRaises(ValidationError):
                runner.exa("brakes", "search", {"query": "test"})
            post.assert_not_called()
            self.assertEqual(runner.ledger.total, 0)

    def test_successful_search_cache_survives_restart_without_network(self):
        config = {"model": "deepseek/deepseek-v4-flash", "api_key": "private", "api_base": "https://api.deepseek.com"}
        response = {"results": [{"title": "真实返回", "url": "https://example.com/a"}], "costDollars": {"total": 0.007}}
        with patch("research_validation.cli.model_config", return_value=config), \
             patch.dict(os.environ, {"EXA_API_KEY": "test-exa-private-value"}), \
             patch.object(Runner, "check_accounts") as check, patch("requests.post") as post:
            post.return_value.status_code = 200
            post.return_value.json.return_value = response
            first = Runner(self.path).exa("brakes", "search", {"query": "test"})
            second = Runner(self.path).exa("brakes", "search", {"query": "test"})
            self.assertEqual(first, second)
            self.assertEqual(post.call_count, 1)
            self.assertEqual(check.call_count, 1)

    def test_both_recommendation_modes_keep_human_notes_and_versions(self):
        write_json(self.path / "brakes/research.json", {"status": "ready", "input_hash": "research-1", "data": research()})
        write_json(self.path / "brakes/sources.json", material())
        write_json(self.path / "brakes/human_edits.json", {"user_keywords": [], "topic_notes": ["我修改的标题"]})
        with patch("research_validation.cli.model_config", return_value={}), \
             patch.object(Runner, "model_call", side_effect=[(topics(), "direct-1"), (topics(), "manual-1")]) as call:
            runner = Runner(self.path)
            direct = runner.recommend("brakes")
            manual = runner.recommend("brakes", ["K1"])
            self.assertEqual(direct["selection"]["mode"], "direct")
            self.assertEqual(manual["selection"]["mode"], "manual")
            self.assertEqual(list(call.call_args_list[1].args[3]["selection"]["keywords"]), ["K1"])
        self.assertEqual(len(list((self.path / "brakes/recommendations").glob("*.json"))), 2)
        self.assertEqual(read_json(self.path / "brakes/human_edits.json")["topic_notes"], ["我修改的标题"])

    def test_user_keyword_is_persisted_as_unverified(self):
        write_json(self.path / "brakes/research.json", {"status": "ready", "input_hash": "r1", "data": research()})
        write_json(self.path / "brakes/sources.json", material())
        output = topics()
        output["topics"][0].update(title="支架结构有什么作用？", keyword_ids=["U1"])
        with patch("research_validation.cli.model_config", return_value={}), \
             patch.object(Runner, "model_call", return_value=(output, "user-1")):
            record = Runner(self.path).recommend("brakes", additions=["支架结构"])
        self.assertEqual(list(record["selection"]["keywords"]), ["U1"])
        self.assertFalse(record["selection"]["keywords"]["U1"]["verified"])

    def test_creative_payload_uses_keywords_without_event_narrative(self):
        write_json(self.path / "brakes/research.json", {"status": "ready", "input_hash": "r1", "data": research()})
        write_json(self.path / "brakes/sources.json", material())
        with patch("research_validation.cli.model_config", return_value={}), \
             patch.object(Runner, "model_call", return_value=(topics(), "creative-1")) as call:
            Runner(self.path).recommend("brakes")
        payload = call.call_args.args[3]
        self.assertNotIn("research", payload)
        self.assertNotIn("background", payload)
        self.assertNotIn("event", payload)
        self.assertEqual(payload["selection"]["keywords"]["K1"]["term"], "1612N")

    def test_cached_recommendation_preserves_review_and_original_time(self):
        write_json(self.path / "brakes/research.json", {"status": "ready", "input_hash": "r1", "data": research()})
        write_json(self.path / "brakes/sources.json", material())
        with patch("research_validation.cli.model_config", return_value={}), \
             patch.object(Runner, "model_call", return_value=(topics(), "same-input")):
            runner = Runner(self.path)
            first = runner.recommend("brakes")
            first["editorial_review"] = {"status": "needs_revision", "issues": ["开场需要查证"]}
            write_json(self.path / "brakes/recommendations/same-input.json", first)
            repeated = runner.recommend("brakes")
        self.assertEqual(repeated["created_at"], first["created_at"])
        self.assertEqual(repeated["editorial_review"], first["editorial_review"])

    def test_model_sdk_does_not_retry_http_503(self):
        import httpx
        config = {"model": "deepseek/deepseek-v4-flash", "api_key": "test-private-key", "api_base": "https://api.deepseek.com"}
        response = httpx.Response(503, json={"error": {"message": "temporary", "type": "server_error"}},
                                  request=httpx.Request("POST", "https://api.deepseek.com/chat/completions"))
        with patch("research_validation.cli.model_config", return_value=config), \
             patch.dict(os.environ, {"EXA_API_KEY": "test-exa-private-value"}), \
             patch.object(Runner, "check_accounts"), patch("httpx.Client.send", return_value=response) as send:
            runner = Runner(self.path)
            with self.assertRaises(ValidationError):
                runner.model_call("brakes", "research", "输出JSON对象", {"example": True}, 100)
            self.assertEqual(send.call_count, 1)
            self.assertEqual(len(runner.ledger.data["entries"]), 1)


if __name__ == "__main__":
    unittest.main()
