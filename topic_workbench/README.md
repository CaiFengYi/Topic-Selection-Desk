# 选题台：ticket01–03 本地原型

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

## 候选接口契约（未确认）

接口由 `public/mock-api.js` 的内存适配器演示，**当前没有对应 HTTP 业务接口**。页面仅通过 HTTP GET 加载静态文件。契约待 ticket04 对照实际原型由用户确认，不能据此视为已经冻结。

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

轮次 `id` 与候选 `id` 共同定位草稿，界面中的「候选 01」只是轮内编号。草稿修改与选用保存在候选旁的页面状态 `{title, opening, selected}`，不改写原始生成字段；编辑缓冲单独保存，取消会回到最近保存版本。历史、选用列表、内存快照的查看与恢复均不发起推荐。`round_number` 仅是模拟适配器的推荐序号，不是正式费用计数；恢复界面快照不会回退适配器任务或接口记录。候选契约仍待 ticket04 用户确认。

热点输入字段：`entry_kind`（hotlist / manual）、`entry_id`、`platform`、`rank`、`collected_at`、`title`、`source_url`、`location`、`event_time`、`focus`、`manual_material: {text, source_description} | null`。未知值为 null。`title` 必填，纯空白不提交。来源链接使用浏览器 URL 校验。

完成结果包含：`id`、`task_id`、`hotspot_id`、`mock`、`status`、`event`、`background`、`materials`、`keywords`、`evidence_groups`、`warnings`、`gaps`、`recommendations: []`、`usage`。页面接口记录提供可实际操作生成的完整 JSON 样例。

- 热点、任务、结果分别有身份；页面轮询只读取原任务，不再次发起研究。
- 同一热点与同一 `operation_id` 的重复提交返回同一任务；仅为当前页面内存语义，真实并发与持久化保护留待后续任务。
- `event_time` 是用户提供的事件线索；`collected_at` 是榜单模拟采集时间；材料的 `published_at`、`read_at` 与人工 `submitted_at` 单独记录。未知发布时间保持 null。
- 网页材料保留正文、来源、读取状态及内容链；人工材料没有伪造读取时间，`status: unverified`。
- 关键词保留原词、模拟词义、完整摘录、来源身份、说话者和语境。背景显示为模拟材料的来源说法，不显示事实已核实。
- `usage: {paid_requests: 0, production_writes: 0}` 及 `mock: true` 明示原型边界；研究完成不会触发候选生成。
- 事件澄清、材料不足及服务失败的完整契约和可操作演示属于 ticket04，本票不扩展实现。

## 验证

Browser plugin not available；使用已有 Playwright 与本机 Chromium。重构后14组检查通过，覆盖三平台与手动研究、线索和人工原文、安全文本渲染、加载防重复、出处展开及焦点、平台筛选的键盘焦点、空标题切换恢复、隐藏无效URL字段展开、输入修改清除旧结果、注入失败后的显式重试、手机首次使用与研究、减少动画和次要文字对比度。布局覆盖320/390/768/1280/1440像素。控制台无错误，网络仅本机静态GET请求，正式账本哈希不变。

重构验收结果：[JSON记录](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/refactor-qa.json)；[浏览器验收脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c1d-96eb-71b0-8bd4-f224c1fd541d/refactor-qa.cjs)。原有29项离线测试保留并回归。当前仅验证Chromium；未做真实服务、跨浏览器或完整读屏器验收。

ticket02 验收：13组浏览器行为检查通过，覆盖修正分离与保存、HTML安全渲染、未保存修正提示、补词默认不选、直接推荐快照、人工选词隔离与分别成题、最多三题、零候选及理由、失败保留与显式重试、重复点击、键盘与减少动画、热点切换，以及1440/1280/768/390/320宽度无横向溢出。29项既有离线测试通过；所有ES模块语法检查通过。源码即产物，无打包步骤。网络仅本机静态GET、控制台无错误、正式账本哈希一致。

验收证据保存在仓库之外：[结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-qa.json)、[可重跑脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-qa.cjs)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c82-2a2d-7193-876c-c2ad17df8593/ticket02-mobile.png)。机械视觉检测以降级正则模式运行，缺少解析依赖；仅报告既有颜色字面量，不能替代浏览器视觉检查。

ticket03 验收：15组浏览器检查、13组ticket02浏览器回归、29项既有离线测试及5个ES模块语法检查通过。覆盖换批不重新研究、跨轮次相同候选ID隔离、未保存编辑保留、快照恢复、失败显式重试、多选与键盘焦点；1440/1280/768/390/320宽度无页面横向溢出。桌面与手机视觉复核通过；控制台错误/警告0，网络仅本机静态GET，正式账本哈希未变。Browser plugin not available，使用现有Playwright/Chromium；未验证其他浏览器、完整读屏器、真实服务、持久化及费用控制。

证据：[ticket03结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-qa.json)、[验收脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-qa.cjs)、[02回归](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket02-qa.json)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-preview-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17c90-e2c2-7a92-8c72-3118f996dd50/ticket03-preview-mobile.png)。
