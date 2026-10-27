# ticket04 候选接口与操作对照（2026-10-27 用户已确认）

## ticket05 已接入的真实接口

默认 `/` 为本地模式，`/?mode=demo` 保留下文模拟契约。真实服务只监听 `127.0.0.1`；Host 必须匹配实际地址端口，写操作接收 JSON，并检查同源 Origin / Fetch Metadata。无 CORS，不读取或返回模型密钥。所有响应禁用缓存。

| 操作 | 请求 | 响应 |
| --- | --- | --- |
| 查看榜单 | `GET /api/hotlist` | `{date, items, platforms, message, mock:false}`；仅当日最近一次采集，空榜不回退示例 |
| 仅采集刷新 | `POST /api/hotlist/refresh`，`{}` | 同上；三平台各请求一次、保存 SQLite 与来源时间，无模型、无自动重试；重叠刷新返回409 |
| 保存热点 | `POST /api/hotspots`，下文热点输入 | 201，完整热点记录；不发起研究 |
| 查看已保存列表 | `GET /api/hotspots` | `{hotspots:[完整热点记录]}`，按更新时间倒序 |
| 重新打开热点 | `GET /api/hotspots/:id` | 完整热点记录；读取不发起研究 |
| 保存输入修改 | `PATCH /api/hotspots/:id`，完整热点输入 | 同 ID 的完整热点记录，保留 created_at；不触发研究 |

榜单项沿用 `id/platform/rank/title/source_url/collected_at`，新增 `platform_id/source_status/source_updated_at/mock:false`。每个平台有 `id/platform/status/collected_at/source_status/source_updated_at`；status为success/failed/missing；source_status区分success/cache/未知null。失败平台不混入旧条目，来源更新时间未知为null，不能以采集时间代替。保留平台各自的原始标题，不做语义合并。

完整热点记录为 `{id,input,provenance,manual_material_submitted_at,created_at,updated_at,mock:false}`；input沿用下文已确认字段，另保留来源更新时间和缓存状态。provenance为被选榜单条目的原始快照，手动入口为null。entry_id须可回查当前榜单或该记录已有快照，平台、排名及采集时间由服务端填充，不信任浏览器伪造。人工原文与来源说明保留，提交时间独立，不表示已回查或核实。

保存按钮锁定执行期间的重复点击；热点创建每次显式新建一个ID，保存修改使用PATCH。热点保存不使用付费任务的operation_id语义。研究、任务、推荐、轮次和草稿真实接口尚未接入，返回404，不接受demo开关。后续票据继续实现下文已确认语义。

错误统一为 `{error:{code,message}}`：无效输入400/INVALID_INPUT；非本机同源403/LOCAL_ONLY；热点不存在404/NOT_FOUND；未接入404/NOT_IMPLEMENTED；刷新重叠409/BUSY；本地读写失败500/LOCAL_SERVICE_ERROR。响应不暴露异常堆栈或外部原始错误。保存失败页面保留输入，无自动重试。

## 以下为已确认的原型契约与后续接入约定

这是静态原型的候选契约，不是已上线的 HTTP API。所有业务调用在浏览器内存中执行，`mock: true`；刷新清空。真实服务、并发锁、持久化缓存与费用控制尚未验证。`demo_scenario`、`demo_outcome`、`demo_failure` 只控制夹具，真实接口不得接受这些开关。

完整请求响应来自浏览器实际操作，见 [contract-examples.json](public/contract-examples.json)。页面「候选接口记录」显示当前操作的完整对象；这些记录是业务契约演示，浏览器实际网络只有静态 GET。

## 身份和状态

- `hotspot.id` 标识热点；`task.id` 标识一次工作任务；研究结果 `id` 与 `task_id/hotspot_id` 相连。
- 推荐任务的 `research_id` 指向研究结果；完成结果 `id` 标识推荐轮次，另带 `task_id`。`round_number` 是任务序号，失败可能留空号；页面按实际成功轮次排列，不把它当费用计数。
- 草稿由 `(round_id, draft_id)` 共同定位；轮内显示编号不能当作全局 ID。原始候选保留，标题、开场与选用另存。
- 请求任务初始 `queued`，轮询为 `running`，最终为 `completed / failed / blocked`；`needs_clarification` 为暂停状态，等待用户选择事件。轮询只读原任务，不启动新研究或模型工作。
- `completed` 表示任务完成，不表示事实已核实。研究结果可为 `no_usable_text`，无背景和关键词，页面禁用推荐。零候选则为成功的推荐轮次，带空数组和非空理由。
- `error` 正常为 null，失败为 `{code, message}`；预算拦截为 `BUDGET_BLOCKED`，模型失败为 `MODEL_FAILED`。警告在研究 `warnings: [{code, message}]`，不会自动变成错误或触发重试。
- `usage: {paid_requests: 0, production_writes: 0}` 仅说明原型。实际预算必须由服务端在每条收费路径前检查并记账，不能相信前端的 usage。

## 页面动作、请求与响应样例位置

下表中的身份占位符按上节关联；JSON 文件的 `samples[].scenario` 可定位完整实例。

| 页面动作 | 候选请求 / 本地动作 | 响应与样例 |
| --- | --- | --- |
| 初次加载、平台筛选 | 读取模拟 `hotlist`，筛选在本地 | 榜单项 `{id, platform, rank, title, source_url, collected_at}`，结构见 mock-api.js；真实读取安排在05 |
| 榜单点选 / 手动添加 / 修改输入 | 本地更新表单，清除旧研究、轮次和快照 | `{entry_kind: "hotlist" / "manual", entry_id, title, ...}`；不收费，尚未创建业务记录 |
| 折叠区展开、材料引用、键盘定位 | 本地展示或聚焦 | request=null；响应为打开的分组或材料身份，无业务请求 |
| 切换演示场景 | 仅修改下一次模拟参数 | request=null；已有结果保留，不自动执行 |
| 开始研究 | `POST /api/hotspots`，body=热点输入；再 `POST /api/hotspots/:id/research`，body=`{operation_id, demo_scenario}` | `normal`：热点与 queued 任务；研究完成后停在提词 |
| 查询进度 | `GET /api/tasks/:id` | `normal`：同一任务的 running/completed，完成时带 result |
| 暂停澄清 | 同一研究任务返回 `needs_clarification` | `needs_clarification`：result=null，`materials` 与 `event_candidates: [{id,label,source_ids}]` 保留 |
| 选择候选事件 | `PATCH /api/tasks/:id/event`，`{event_id: "E2"}` | `clarification_resolved`：原任务 queued → completed；材料身份及内容不变，仅使用对应事件材料提词，无新研究请求 |
| 补充事件线索 | 本地展开线索并聚焦地点，编辑后旧结果失效 | request=null；保留输入，用户明确开始研究才新建操作；不自动补查 |
| 来源分歧 | 完成结果带 `SOURCE_CONFLICT` 警告和分别归属的背景 | `source_conflict`：S1、S2 的不同说法及引用同时展示，不再次澄清、不裁定真伪 |
| 材料过少 | 完成结果带 `SPARSE_MATERIALS` 警告 | `sparse`：acquisition 的链接、可读、重复、失败数及已知原因；只警告，已有原词可用，不另设确认 |
| 全部网页不可读 | 完成结果 `status: "no_usable_text"` | `no_usable_text`：空 background/keywords/evidence_groups，保留失败记录；人工原文如有也保留但未分析，不虚构结论 |
| 保存或撤销词义修正 | `PATCH /api/research/:id/keywords/:keywordId`，`{correction: "修正后的含义"}` 或 `{correction:null}` | `manual_keywords_drafts`：keyword_id/correction/mock，不改原词、引文与原解释，不启动推荐 |
| 添加人工补词 | `POST /api/research/:id/keywords`，`{term:"人工线索",meaning:""}` | 同上：新 id、kind=manual；默认不选中，不冒充原词 |
| 本轮勾选或取消 | `PUT /api/research/:id/selection`，`{keyword_ids:["K1"]}` 或空数组 | 同上：返回本轮 keyword_ids，不启动推荐；历史补词不自动入选 |
| 直接推荐 / 人工推荐 | `POST /api/research/:id/recommendations`，`{operation_id, mode, keywords, demo_outcome, demo_failure}` | `explicit_recovery_and_direct` / `manual_keywords_drafts`：任务携带发起时的关键词快照；人工模式仅本轮所选词 |
| 换一批 | 同推荐端点，新的 operation_id，当前关键词与修正，所查看轮次的 mode | `empty_round`：追加新轮次，不重新研究、检索或读取；固定夹具只交替两种表达，不是真实语义去重 |
| 零候选 | 完成的推荐结果 `candidates: [], empty_reason: "…"` | `empty_round`：仍加入历史轮次，旧候选及修改保留 |
| 模型失败 | 任务 `failed, result:null, error:{code:"MODEL_FAILED",message}` | `research_model_failure` / `recommendation_model_failure`：研究失败保留输入及已取材料；推荐失败保留研究、修正、历史和草稿，无自动重试 |
| 预算拦截 | 任务 `blocked, result:null, error:{code:"BUDGET_BLOCKED",message}` | `research_budget` / `recommendation_budget`：收费操作未启动，不重置账本、不自动扩容 |
| 用户再次发起 | 明确点击，新的 operation_id | `explicit_recovery_and_direct`：新任务；模型失败可能已产生真实费用，显式重试也必须重新经过预算检查 |
| 重复提交 | 同热点/研究和同 operation_id 重放原 POST | `operation_replay`：同 task.id 和原结果，`reuse:"operation"`，不创建新轮次；防重复仅在页面内存中模拟 |
| 查看历史 / 已选用列表 | 从已加载轮次本地选择 active round | request=null；响应为该轮 id、keyword_snapshot、candidates 及各自 draft，不启动推荐 |
| 编辑 / 取消编辑 | 本地维护独立编辑缓冲 | request=null；取消回到已保存版本，跨轮次保留未保存编辑；空白标题/开场不保存 |
| 保存草稿修改 | `PATCH /api/rounds/:roundId/drafts/:draftId`，`{title:"人工编辑标题",opening:"…"}` | `manual_keywords_drafts`：返回 round_id/draft_id 和变更，原始生成内容保留 |
| 选用 / 取消选用 | 同草稿 PATCH，`{selected:true}` / `{selected:false}` | 同上：每个草稿独立支持多选，不启动知识核验或制作 |
| 模拟保存快照 | 本地复制 `{rounds, active, selectedCount}` | request=null；响应为页面内存 checkpoint，仅含已保存草稿编辑与选用，不含关键词编辑缓冲 |
| 恢复快照 | 本地读取 checkpoint 并覆盖轮次、草稿和未保存草稿编辑 | request=null；响应为保存时的 rounds/active，不回退关键词、任务、接口记录或费用账本；刷新丢失。真实持久化由09–11实现 |

热点输入包含 `entry_kind, entry_id, platform, rank, collected_at, title, source_url, location, event_time, focus, manual_material`。未知字段为 null；人工材料是 `{text, source_description}`，保留原文并标注未回查。输入验证发生在提交前，空白标题不创建热点；URL 格式错误会展开字段并聚焦，真实服务须再次校验。

## 缓存、重复与失败恢复约定

1. 当前模拟只提供 `reuse:"none" / "operation"`。同一身份范围内相同 operation_id 返回原任务当前状态；完成结果稳定，失败重放也保持失败。页面加载时禁用重复点击；这不验证真实多进程锁。
2. 真实服务中的同 operation_id 不同有效载荷应返回冲突（候选 HTTP 409，`OPERATION_CONFLICT`），不得启动第二次收费；当前夹具未模拟冲突验证。
3. 原型内复用已有研究、查看历史与恢复快照都不检索、不读网页、不调用模型。内容缓存的磁盘读取、失效与数据库恢复尚未实现；真实命中可使用候选 `reuse:"result_cache"`，必须返回原结果身份与出处，不伪造新的研究或费用记录。
4. 「换一批」与再次明确推荐使用新 operation_id 并新建轮次，不能用命中旧推荐结果冒充新一批。若真实实现复用研究缓存，推荐仍受原累计预算及次数限制。
5. failed/blocked 不自动重试；轮询不追加付费操作。材料过少不补查、不重读、不替换来源、不付费诊断；无可用文本不执行模型生成研究内容。
6. 原始材料的 published_at、read_at、人工 submitted_at 和榜单 collected_at 独立，未知保持 null；它们不能代替事件发生时间。

## 确认范围

2026-10-27：用户明确回复“接受本次交付，提交”，接受正常流程、七种异常展示及本次接口交付。确认已记录在 ticket04，04完成并解除05前置阻塞；真实服务、缓存、并发锁、持久化与预算保护仍须后续实现及验收。
