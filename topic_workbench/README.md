# 选题台：本地榜单与热点记录

ticket05 已接通真实本地榜单、仅采集刷新与热点记录持久化。默认打开 `http://127.0.0.1:8765/`；已确认的 ticket01–04 模拟原型移至 `http://127.0.0.1:8765/?mode=demo`，仍可演示原有研究与推荐交互。

运行 `./run-topic-workbench.ps1`。服务沿用 Python 标准库，仅监听 `127.0.0.1`，静态文件根目录限于 `public/`；业务接口检查 Host、Origin 与 Fetch Metadata，不开放 CORS。页面查看、保存和榜单刷新不读取密钥、不调用收费服务；显式取材才加载 `.env.local`，不经过原版整榜 AI 入口。

默认页面操作：

1. 读取 `TrendRadar/output/news/当日.db` 最近一次采集的三平台榜单，按平台筛选后带入表单；无当天记录时明确显示空榜单，不回退到历史示例。
2. 「刷新榜单 · 仅采集」显式请求公开聚合接口，每平台一次、无自动重试，复用采集器域名校验与 SQLite 存储。单个平台失败显示失败，不把该平台上次成功结果冒充当前结果。采集与来源更新时间分别显示，聚合缓存明确标记；原有数据库未记录来源更新时显示未知。
3. 选择榜单或手动输入任意标题，可填写地点、事件时间、关注点和人工材料。点击「保存热点」仅写本地 JSON。人工原文、来源说明与提交时间保留，标注未回查；相似标题和来源差异不自动合并。
4. 「已保存热点」重新打开记录，修改后保存更新同一 ID；页面刷新或服务重启后仍可读取。修改榜单标题后转为手动入口。保存不会启动研究或推荐。点击「发起研究 · 取材阶段」会自动保存当前输入并取材，无需先点保存。

热点记录在 `workbench-data/hotspots/`，榜单来源时间补充在 `workbench-data/collections/`，均已忽略 Git。JSON 使用锁和临时文件替换，保存异常保留输入、无自动重试。测试可通过 `python -m topic_workbench --port 8766 --data-dir <isolated-data> --news-dir <isolated-output/news>` 隔离存储；不得借此另建收费账本。

接口与验收证据见 [CONTRACT.md](CONTRACT.md) 和 [ticket05](../.scratch/topic-workbench/issues/05-hotlist-hotspot-integration.md)。后端运行 `./TrendRadar/.venv/Scripts/python.exe -m unittest discover -s tests -v`。前端为原生 ES 模块，无新增依赖和构建步骤。

## ticket01–04 历史原型说明

以下记录只适用于 `?mode=demo`，其中“仅静态服务”描述的是历史交付；当前本地服务还提供上文真实 API。模拟研究、推荐与草稿仍只在页面内存中，不能作为真实持久化与费用保护验收。

ticket04 已补齐七种异常演示，用户于2026-10-27确认本次交付，04已完成。研究输入上方选择正常、事件澄清、来源分歧、材料过少、读取失败、模型失败或预算拦截；推荐区保留零候选演示，并增加模型失败/预算拦截选择。修改场景本身不执行请求，再明确点击对应操作才演示。事件选择复用原任务和材料；全部网页不可读时不生成研究内容；失败保留数据、无自动重试。

2026-10-27设计精修：零新增依赖，复用原生控件与统一反馈组件。异常标题去重、警告与失败区分、事件整行选择、材料折叠、取材统计分列，完善下拉框状态和手机字号。14组ticket04检查、15组ticket03回归与4组设计检查通过；5个ES模块语法检查通过。源码即运行产物，无打包步骤。详细证据见ticket04末尾的设计精修记录；既有契约和模拟边界保持。

逐动作字段与边界见 [CONTRACT.md](CONTRACT.md)，完整浏览器操作样例见 [contract-examples.json](public/contract-examples.json)，页面「候选接口记录」可打开样例。新增14组浏览器检查、15组ticket03回归、29项离线测试通过。详见 [ticket04 验收与确认记录](../.scratch/topic-workbench/issues/04-prototype-contract-approval.md)。真实持久化、缓存、并发锁和预算保护仍须后续接入验收。

实现「模拟榜单 / 手动输入 → 模拟研究 → 背景、材料与关键词 → 修正词义 / 补词 / 本轮选词 → 明确点击模拟推荐 → 换批 / 历史轮次 / 草稿编辑与多选」。支持当前页面内存快照的模拟保存与恢复，未接真实服务或持久化。

页面已按研究工作区重构：宽屏并排展示榜单、输入和结果，小屏纵向排列，手机首次打开默认折叠榜单。包含内联校验、加载骨架、步骤状态、保留输入的错误重试、键盘焦点与减少动画支持。

在工作区运行：

```powershell
./run-topic-workbench.ps1
# 端口被占用时：./run-topic-workbench.ps1 -Port 8766
```

打开 http://127.0.0.1:8765 ，Ctrl+C 停止。也可用现有 Python 执行 `python -m topic_workbench --port 8765`。无新增依赖、无构建步骤；仅监听 127.0.0.1，仅提供 `public/` 中的静态文件，不加载 `.env.local` 或研究验证客户端。

## 操作

1. 从 B站、抖音、微博的虚构榜单中选一条，或手动填写任意热点标题。
2. 展开可选线索，填写来源链接、地点、事件时间和关注点；可粘贴人工材料并注明来源。
3. 点击「开始模拟研究」，查看等待、整理材料、提取关键词及完成状态。执行期间锁定输入与提交，筛选榜单仍可操作；执行失败可显式重试。
4. 查看研究卡、缺口及关键词出处；点击 S1 可展开材料。人工原文完整保留，标注未回查；转载与原材料归入同一内容链。
5. 在「从关键词到选题」中保存词义修正；原词、原文和原 AI 解释仍保留。留空保存可撤销修正。未保存的修改会阻止推荐并提示先保存。
6. 点击「直接推荐」，模拟从材料原词中取角度；或勾选关键词、展开「我来挑关键词」，点击「使用本轮选词推荐」。补词默认未选中，人工模式仅提交本轮所选词，可分别成题。
7. 每次最多三题，展示标题、开场、知识问题、所用词、关联理由、画面方向与待查证点。勾选「演示零候选」后再次点击推荐，可查看零候选及理由。
8. 点击「换一批」，使用当前查看轮次的推荐方式与当前关键词、已保存修正，新增模拟轮次；人工方式未选词时提示先选词。换批不重新研究或检索，真实模式将消耗模型额度，本原型不收费。两种初始推荐按钮也会新增轮次。
9. 点击历史轮次比较当时的关键词与解释快照。编辑草稿标题和开场后点击「保存草稿修改」，或取消未保存编辑；空白内容不能保存。切换轮次或换批保留编辑中的内容，各轮同编号候选互不覆盖。
10. 勾选多个「选用此草稿」，各草稿独立保存状态；可取消选用。展开「已选用草稿」跨轮次查看，点击标题回到该轮并聚焦对应草稿。选用只表示继续打磨，不启动核验或制作。
11. 展开「模拟保存与恢复」，模拟保存轮次、已保存编辑和选用的内存快照。恢复会覆盖当前轮次、修改和未保存编辑，不回退上方关键词；快照可以重复恢复。刷新、切换热点或修改研究输入后清空，不能用于验证真实数据库、持久化或费用控制。
12. 展开「候选接口记录」，查看完整模拟请求与响应。原始候选与输入快照保留，编辑和选用通过按轮次定位的独立 PATCH 记录展示。保存/恢复只操作页面内存，不产生业务 HTTP 请求。

三条榜单使用各自的虚构夹具；任意手动标题使用明确标注的通用模板，**不会分析该标题的真实语义或真实事件**。修改榜单标题后转为手动入口，避免套用原事件夹具。人工材料仅展示原文，不自动参与模拟提词。来源地址使用保留的 `.invalid` 域名，不访问原页面。

数据只存于当前浏览器页面的内存，刷新即清空。静态服务只支持读取，不包含业务写接口。API 收费请求、正式资料写入均为零；推荐请求只是内存适配器记录。模拟流程不能证明真实取材质量、引用校验、费用保护或持久化已实现。

推荐也是固定交互夹具：六个材料原词有示例角度，其他词使用显式标注的通用问题模板；同一研究的推荐交替使用两种固定标题与开场表达，用于观察换批，并非真实生成新知识。直接模式从材料原词取前三个，人工模式从本轮选词取前三个。修正进入解释快照和关联理由，标题与问题不执行语义推理，需人工复核。零候选由演示选项控制，不代表已判定真实材料不足。切换热点或修改研究输入会清除当前研究、修正、轮次、编辑、选用与快照。

修改任意研究输入会清除旧研究卡，避免把旧结果误认为当前输入的结果。标题的字符计数、空白校验及来源链接校验均在本地执行；无效字段会自动展开并获得焦点。

## 前端维护

继续使用原生组件，无 React、UI 框架或前端构建链。当前只有表单、列表、折叠区和状态反馈，浏览器原生组件足以满足；后续出现复杂组合组件时，再评估组件库。

- `public/index.html`：语义结构、原生表单及统一描边 SVG 图标。
- `public/styles.css`：集中设计变量、组件状态与响应式布局，使用可读的分区规则。
- `public/app.js`：交互控制、校验及执行状态；通过适配器发起模拟任务。
- `public/views.js`：结果及列表渲染，用户文本统一转义，日期格式器复用。
- `public/recommendation.js`：词义修正、补词、选词与推荐交互，复用现有转义和图标。
- `public/rounds.js`：轮次历史、按轮次隔离的草稿编辑、多选与页面内存快照。
- `public/mock-api.js`：内存模拟数据、推荐夹具及候选接口记录。

设计约定见 [DESIGN.md](DESIGN.md)。不加载外部字体、图标脚本或 CDN；无第三方运行时依赖。源码即运行产物，无需打包构建。可在 PowerShell 检查 ES 模块语法：

```powershell
Get-Content topic_workbench/public/app.js -Raw | node --input-type=module --check
Get-Content topic_workbench/public/views.js -Raw | node --input-type=module --check
Get-Content topic_workbench/public/mock-api.js -Raw | node --input-type=module --check
Get-Content topic_workbench/public/recommendation.js -Raw | node --input-type=module --check
Get-Content topic_workbench/public/rounds.js -Raw | node --input-type=module --check
```

## 接口契约（ticket04 已确认）

接口由 `public/mock-api.js` 的内存适配器演示，**当前没有对应 HTTP 业务接口**。页面仅通过 HTTP GET 加载静态文件。用户已在 ticket04 对照实际原型接受本次接口交付；后续真实接入以 CONTRACT.md 为依据。

| 动作 | 候选请求 | 响应 |
| --- | --- | --- |
| 创建热点 | `POST /api/hotspots` | `{id, mock: true, input}` |
| 发起研究 | `POST /api/hotspots/:id/research`，`{operation_id}` | `{id, hotspot_id, operation_id, mock, status: "queued", stage, result: null}` |
| 查看任务 | `GET /api/tasks/:id` | 同一任务身份，`status: running / completed`，`stage`；完成后包含 `result` |
| 保存 / 撤销词义修正 | `PATCH /api/research/:id/keywords/:keywordId`，`{correction: string / null}` | `{keyword_id, correction, mock: true}`，不改原词与原解释 |
| 人工补词 | `POST /api/research/:id/keywords`，`{term, meaning}` | `{id, term, meaning, kind: "manual", mock: true}`；默认未选中 |
| 本轮选词 | `PUT /api/research/:id/selection`，`{keyword_ids}` | `{keyword_ids, mock: true}`；不发起推荐 |
| 发起推荐 / 换一批 | `POST /api/research/:id/recommendations`，`{operation_id, mode: "direct" / "manual", keywords, demo_outcome: "normal" / "empty"}` | `{id, kind: "recommendation", research_id, round_number, operation_id, mock, status: "queued", stage, snapshot, result: null}`；读取原任务取得结果 |
| 编辑 / 选用草稿 | `PATCH /api/rounds/:roundId/drafts/:draftId`，`{title?, opening?, selected?}` | `{round_id, draft_id, ...changes, mock: true}`；原始候选保留，当前页面按轮次保存修改与选用 |

推荐 `keywords` 是本轮输入快照，保留 `id, term, meaning, correction` 以及已有的引用与来源字段；人工词带 `kind: manual`。`demo_outcome` 仅用于原型演示，不是正式业务参数。推荐完成结果为 `{id, research_id, mock, mode, keyword_snapshot, candidates, empty_reason, usage}`。每个候选包含 `id, title, opening, knowledge_question, used_keyword_ids, association_reason, visual_direction, verification_points`；零候选时 `candidates: []` 且 `empty_reason` 非空。

修正、补词与选词由页面保存于内存，适配器记录对应动作；尚无服务端状态写入。推荐发起后锁定输入和两种推荐按钮，重复点击不创建第二个操作；同一研究及 `operation_id` 复用任务。失败保留研究、修正和已有候选，不自动重试，用户可再次明确点击推荐。推荐不重新研究、不读取网页。

轮次 `id` 与候选 `id` 共同定位草稿，界面中的「候选 01」只是轮内编号。草稿修改与选用保存在候选旁的页面状态 `{title, opening, selected}`，不改写原始生成字段；编辑缓冲单独保存，取消会回到最近保存版本。历史、选用列表、内存快照的查看与恢复均不发起推荐。`round_number` 仅是模拟适配器的推荐序号，不是正式费用计数；恢复界面快照不会回退适配器任务或接口记录。用户已在 ticket04 确认本次契约。

热点输入字段：`entry_kind`（hotlist / manual）、`entry_id`、`platform`、`rank`、`collected_at`、`title`、`source_url`、`location`、`event_time`、`focus`、`manual_material: {text, source_description} | null`。未知值为 null。`title` 必填，纯空白不提交。来源链接使用浏览器 URL 校验。

完成结果包含：`id`、`task_id`、`hotspot_id`、`mock`、`status`、`event`、`background`、`materials`、`keywords`、`evidence_groups`、`warnings`、`gaps`、`recommendations: []`、`usage`。页面接口记录提供可实际操作生成的完整 JSON 样例。

- 热点、任务、结果分别有身份；页面轮询只读取原任务，不再次发起研究。
- 同一热点与同一 `operation_id` 的重复提交返回同一任务；仅为当前页面内存语义，真实并发与持久化保护留待后续任务。
- `event_time` 是用户提供的事件线索；`collected_at` 是榜单模拟采集时间；材料的 `published_at`、`read_at` 与人工 `submitted_at` 单独记录。未知发布时间保持 null。
- 网页材料保留正文、来源、读取状态及内容链；人工材料没有伪造读取时间，`status: unverified`。
- 关键词保留原词、模拟词义、完整摘录、来源身份、说话者和语境。背景显示为模拟材料的来源说法，不显示事实已核实。
- `usage: {paid_requests: 0, production_writes: 0}` 及 `mock: true` 明示原型边界；研究完成不会触发候选生成。
- 事件澄清、材料不足及服务失败已由 ticket04 补齐，完整契约及缓存边界以 [CONTRACT.md](CONTRACT.md) 为准，已获用户确认。

## 验证

Browser plugin not available；使用已有 Playwright 与本机 Chromium。重构后14组检查通过，覆盖三平台与手动研究、线索和人工原文、安全文本渲染、加载防重复、出处展开及焦点、平台筛选的键盘焦点、空标题切换恢复、隐藏无效URL字段展开、输入修改清除旧结果、注入失败后的显式重试、手机首次使用与研究、减少动画和次要文字对比度。布局覆盖320/390/768/1280/1440像素。控制台无错误，网络仅本机静态GET请求，正式账本哈希不变。

重构验收结果：[JSON记录](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/refactor-qa.json)；[浏览器验收脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/refactor-qa.cjs)。原有29项离线测试保留并回归。当前仅验证Chromium；未做真实服务、跨浏览器或完整读屏器验收。

ticket02 验收：13组浏览器行为检查通过，覆盖修正分离与保存、HTML安全渲染、未保存修正提示、补词默认不选、直接推荐快照、人工选词隔离与分别成题、最多三题、零候选及理由、失败保留与显式重试、重复点击、键盘与减少动画、热点切换，以及1440/1280/768/390/320宽度无横向溢出。29项既有离线测试通过；所有ES模块语法检查通过。源码即产物，无打包步骤。网络仅本机静态GET、控制台无错误、正式账本哈希一致。

验收证据保存在仓库之外：[结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-qa.json)、[可重跑脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-qa.cjs)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-mobile.png)。机械视觉检测以降级正则模式运行，缺少解析依赖；仅报告既有颜色字面量，不能替代浏览器视觉检查。

ticket03 验收：15组浏览器检查、13组ticket02浏览器回归、29项既有离线测试及5个ES模块语法检查通过。覆盖换批不重新研究、跨轮次相同候选ID隔离、未保存编辑保留、快照恢复、失败显式重试、多选与键盘焦点；1440/1280/768/390/320宽度无页面横向溢出。桌面与手机视觉复核通过；控制台错误/警告0，网络仅本机静态GET，正式账本哈希未变。Browser plugin not available，使用现有Playwright/Chromium；未验证其他浏览器、完整读屏器、真实服务、持久化及费用控制。

证据：[ticket03结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-qa.json)、[验收脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-qa.cjs)、[02回归](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket02-qa.json)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-preview-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-preview-mobile.png)。

## ticket06 取材接入

默认页面可直接点击「发起研究 · 取材阶段」。复用 Runner 的 Exa 检索、正文读取、核价、账号检查、失败缓存、预算预留和 RunLock。每个输入版本最多一次搜索（5条）和一批正文（最多5页）；同一热点跨输入修改累计最多两次搜索、一批正文，失败也占次数。任意热点输入均适用，不依赖固定案例。不自动补查、重试或调用研究/推荐模型。来源链接是搜索线索，未承诺直接访问用户填写的链接；人工材料仍单独保留且不计入已读网页正文。

正式费用与终端共用 `validation-output/ledger.json`，共用 `validation-output/run.lock`；即使通过 `--data-dir` 隔离热点记录，也不能新建收费账本。累计上限5元，正式调用仍需价格配置未过期、密钥存在及账号可用。结束时显示费用估算/不确定预留快照，不作为最终账单。

任务存于 `workbench-data/tasks/`；原始请求、搜索结果和正文存于 `validation-output/workbench-<hotspot-id>-<input-hash>/`。同 operation_id 重放返回原任务，改变输入返回409；同热点同输入的新 operation_id 复用已有任务，包括失败，不额外请求。刷新、关闭和服务重启后重新打开热点即可只读回看正文、读取错误和取材警告。中断记录显示「尚未完成，可能仍在执行或已中断」，保留已写入的阶段材料和pending预留，不自动续跑；显式失败重试策略由后续恢复票据处理。

06 的 completed 只表示取材操作结束，始终 `research_completed:false`；不会显示研究提词完成，也没有新增最终流程的强制确认步骤。关键词、推荐与后续轮次仍由07–12实现。
