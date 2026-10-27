# 06: 研究取材与取材警告的前端接入

**What to build:** 用户在页面发起研究后，能看到真实取得的来源、正文、读取状态及取材警告，失败后仍可回看已有材料。

**Blocked by:** 05: 真实榜单与热点记录的前端接入

Status: completed

- [x] 复用现有检索、正文读取及保存能力，做本路径所需的最小通用化整理；保持旧案例及终端行为兼容。
- [x] 付费前核价、账号检查、共享预算预留、调用次数限制、防重复与无隐式重试已生效，不开新账本绕开5元累计上限。
- [x] 来源链接、可获得的发布时间、读取时间、实际文本和错误可从前端查看；搜索结果、正文、重复项和失败不混淆。
- [x] 材料过少只显示基于现有结果的警告，不追加请求；本票可演示取材阶段，不将其伪称为研究提词已完成，也不新增最终流程的强制点击步骤。
- [x] 使用可控外部响应证明请求数、预留和失败保存正确，正式调用另受既有核价及预算限制。

## Comments

2026-10-27：用户回复“可以”，认可任务拆分与阻塞关系。本任务已发布，尚未开始实现；任务状态不代表阻塞条件已解除。


2026-10-27：用户要求“/goal 实现ticket06”。核对05为completed，前置条件已解除。本票已实现并验证；07前置阻塞解除，未实施07–12，未提交Git。

实现：默认本地页面可一键保存输入并发起取材，独立「保存热点」仍免费，不强制先点保存。新增POST /api/hotspots/:id/research与GET /api/hotspots/:id/materials；同步取材返回任务及输入快照，明确kind=materials、research_completed=false。来源正文可展开，保留链接、未知null发布时间、搜索/读取时间、实际全文、读取错误和原始搜索结果；body/search_summary/duplicate/read_failed分别显示，完全重复标注对应来源，不把不同网站当独立证据链。人工材料保留原文、说明和提交时间，仍标注未回查。

最小复用research_validation Runner.gather/exa，新增任意热点检索定义和计次范围；旧三案例、CLI、模型路径与原型保留。每个输入版本一次搜索与最多五页正文；同热点跨输入版本累计最多两次搜索、一批正文，失败也计次。同operation重放、同输入新operation复用原任务（含失败）；同operation不同输入409。材料偏少只警告，无补查/自动重试/模型调用。读取失败先保存已有来源及错误，进程中断后GET读取阶段文件，不自动续跑。

付费共用原validation-output/ledger.json及run.lock；Workbench可隔离data-dir但不能另建收费账本。核价、账号检查、5元上限、预留及异常费用停止均复用原逻辑。Runner在OS锁内构造，CLI锁内重新加载账本，消除并发进程持有旧账本问题。pending不确定请求保留预留并阻止同类重发。页面查看和榜单刷新不发起收费请求。

验证：`./TrendRadar/.venv/Scripts/python.exe -m unittest discover -s tests -q`最终47项通过（37项既有回归、10项新增），覆盖收费次数、超时预留、共享旧账本预算不足、过期核价、账号不可用、进程锁、operation冲突、空结果、修改输入不重置上限、中断阶段读取和HTTP同源校验。请求边界使用可控响应，未调用正式Exa/DeepSeek。全部前端ES模块语法检查及git diff --check通过。

浏览器：Playwright Chromium（Browser plugin not available），http://127.0.0.1:8767，1440×1000、390×844、320×844。8组检查通过：页面身份与非空/无覆盖层、一键保存取材、链接/时间/正文/警告及文本转义、重复点击不追加请求、页面刷新、服务重启恢复、响应式无横向溢出、失败保留来源与错误、控制台无错误。测试服务只替换外部响应，页面通过真实HTTP与Workbench/Runner/磁盘持久化贯通。最终桌面和手机截图已复核；正式账本SHA-256仍为2c8971e3343de9a6b1a9c0508203eac64f4947fa5fe2989a17e23479dadb22d6。未验证正式收费服务或其他浏览器；价格过期仍会拦截正式取材，不自动更新核价。

证据：[47项测试日志](../../../validation-output/ticket06-tests.log)、[8组浏览器检查](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-qa.json)、[可重跑浏览器脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-qa.cjs)、[受控响应测试服务](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-server.py)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-mobile.png)、[失败状态](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d34-5b83-7c73-8ee1-6eff31394606/ticket06-failure.png)。接口/数据边界及恢复限制见topic_workbench/CONTRACT.md与README.md。
