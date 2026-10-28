# 选题台任务索引

依据：[正式规格](PRD.md)。用户已认可12项拆分；01至12已交付，Status为completed。12真实新热点已产生研究和3个候选，另一次人工推荐因原词校验失败被保留，没有重试；完成状态不表示模型输出或科学内容全部通过。见[最终验收与限制](../../docs/topic-workbench-acceptance.md)。

ready-for-agent表示任务定义可供代理接手；下表保留实施依赖，逐票实现与验收证据见任务文件。

| 编号 | 任务 | Blocked by |
| --- | --- | --- |
| 01 | [从两种热点入口到研究卡的前端原型](issues/01-hotspot-research-prototype.md) | 无 |
| 02 | [词义修正与两种推荐方式的前端原型](issues/02-keyword-recommendation-prototype.md) | 01 |
| 03 | [换一批、编辑与多选的前端原型](issues/03-rounds-drafts-prototype.md) | 02 |
| 04 | [演示异常流程并确认原型与接口](issues/04-prototype-contract-approval.md) | 03 |
| 05 | [真实榜单与热点记录的前端接入](issues/05-hotlist-hotspot-integration.md) | 04 |
| 06 | [研究取材与取材警告的前端接入](issues/06-materials-warning-integration.md) | 05 |
| 07 | [研究卡、事件澄清与关键词的前端接入](issues/07-research-keywords-integration.md) | 06 |
| 08 | [修正词义、选择关键词并生成真实候选](issues/08-recommendation-integration.md) | 07 |
| 09 | [换一批与历史轮次的前端接入](issues/09-rounds-history-integration.md) | 08 |
| 10 | [草稿编辑、多选与保存恢复的前端接入](issues/10-draft-selection-persistence.md) | 08 |
| 11 | [跨轮次恢复、异常与费用保护的前端验收](issues/11-recovery-budget-verification.md) | 09、10 |
| 12 | [从前端完成新热点真实验收与交付](issues/12-live-frontend-acceptance.md) | 11 |

运行：`./run-topic-workbench.ps1`，打开 `http://127.0.0.1:8765/` 使用真实本地榜单、热点保存、研究提词、词义修正、选词及两种推荐、显式换批、历史、草稿编辑多选及磁盘恢复。已有旧服务占端口时用 `./run-topic-workbench.ps1 -Port 8766` 并打开8766，本次验收使用此端口。01–04原型在 `/?mode=demo`；模拟数据只在页面内存。说明与接口见[选题台说明](../../topic_workbench/README.md)，验收记录见各任务文件。

01至04原型和接口已确认，05至10真实功能已接入，11完成恢复/异常/费用保护受控验收，12完成新热点真实验收和交付说明。真实与受控证据分开记录，模型语义、科学核验与用户选用仍需后续判断。

继续收费操作仍须有效核价、账号可用及原累计预算充足，不能重置账本或自动扩容；当前核价有效期至2026-10-28 23:59:59 +08:00。

原型阶段不调用付费服务、不修改正式资料或费用账本；真实路径从首个收费操作开始执行预算、次数及无自动补查和无隐式重试规则。
