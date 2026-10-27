# 选题台任务索引

依据：[正式规格](PRD.md)。用户已认可12项拆分；任务已逐文件发布。01至03已实现并通过浏览器验收，Status为completed；04至12仍为ready-for-agent，尚未实现。

ready-for-agent表示任务定义可供代理接手，不表示已完成或阻塞条件已解除。03已完成，04的前置阻塞已解除，其他任务仍依表中依赖推进。

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

01–03原型运行：`./run-topic-workbench.ps1`，打开 `http://127.0.0.1:8765`。说明与候选接口见[原型说明](../../topic_workbench/README.md)，验收记录见01至03任务文件。已支持研究、修正、补词、两种模拟推荐、换批、历史、草稿编辑多选及内存快照保存恢复。数据只保存在页面内存，未接真实服务或持久化。

先完成01至04的可操作原型和接口确认，再接真实服务。04必须记录用户对实际原型与接口的确认，不能用任务拆分批准代替。

08完成后09与10可分别推进；09、10均完成后进入11，再进入12。12还需满足有效核价、账号可用及原累计预算充足的条件，不能重置账本或自动扩容。

原型阶段不调用付费服务、不修改正式资料或费用账本；真实路径从首个收费操作开始执行预算、次数及无自动补查和无隐式重试规则。
