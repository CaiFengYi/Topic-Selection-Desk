# 01: 从两种热点入口到研究卡的前端原型

**What to build:** 用户可从模拟榜单选择或手动输入热点，在页面发起模拟研究，看到材料、背景及关键词；流程停在提词完成，不自动生成候选。

**Blocked by:** None (can start immediately)

Status: completed

- [x] 提供可启动、可操作的本地原型，两种入口进入同一研究流程，支持填写可选线索和人工补充材料。
- [x] 使用候选请求响应格式演示加载及正常研究结果；来源、事件时间与采集时间区分。
- [x] 模拟数据明确标注，API收费请求与正式数据写入均为零；通过浏览器操作验证而非仅提供静态截图。

## Comments

2026-10-27：用户回复“可以”，认可任务拆分与阻塞关系。本任务已发布，尚未开始实现；任务状态不代表阻塞条件已解除。

2026-10-27：实现并验证完成。运行 `./run-topic-workbench.ps1`，打开 `http://127.0.0.1:8765`。实现位于 `topic_workbench/`，无新增依赖，服务仅监听回环地址并暴露原型静态目录。研究止于关键词，不生成候选；任意手动标题使用显式标注的通用交互模板，不冒充真实事件分析。人工原文与来源说明保留并标注未回查。详见[原型与候选接口说明](../../../topic_workbench/README.md)。

浏览器验收使用已有 Playwright + Chromium（Browser plugin not available）。完成平台筛选、三平台榜单分别研究、手动新标题、可选线索、人工材料保留与 HTML 安全文本渲染、标题编辑转手动、加载防重复、出处展开、空白标题校验、1440/768/390 宽度检查。共10组检查通过，控制台错误0；仅有4个本地静态GET请求，收费请求0。正式账本操作前后SHA-256一致；静态服务不能读取 `.env.local` 或正式账本。既有29项离线测试全部通过。

验收脚本及证据保存在仓库之外：[浏览器检查结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-qa.json)、[可重跑脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-qa.cjs)、[桌面首屏](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-desktop.png)、[研究结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-research.png)、[人工输入与材料](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-manual.png)、[窄屏](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/ticket01-mobile-390.png)。

本票完成解除02的前置阻塞；不代表ticket04的用户原型审核及接口确认已经完成。接口仍是候选契约；未接真实服务，未验证真实持久化或服务预算行为，未修改原业务入口、配置和正式账本。
