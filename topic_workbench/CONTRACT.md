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

## ticket06 已接入的取材接口

- `POST /api/hotspots/:id/research`，仅接受 `{operation_id:UUID}`。本票同步执行取材，返回保存后的取材任务；不启动模型提词。`status=completed` 只表示取材结束，`kind=materials`、`research_completed=false`。失败/受阻也返回200及持久化任务的error；非法输入400、同operation输入冲突或共享进程锁忙409。暂不采用模拟版的后台队列/轮询。
- `GET /api/hotspots/:id/materials` 返回 `{tasks:[...]}`，按创建时间倒序，纯磁盘读取。任务包含输入快照、materials、原始search_results（含未读/重复链接）、warnings、error和结束时budget快照。运行中/中断任务读取已落盘阶段文件，不触发续跑。
- materials保留 `id/title/url/published_at/searched_at/read_at/retrieved_at/status/text/summary/error/retrieval_status`；status区分body/search_summary/duplicate/read_failed，duplicate_of仅指完全相同文本，不宣称识别所有转载链。未知发布时间为null；搜索时间、正文读取时间及人工提交时间不互代。
- 同热点、同operation重放原任务 `reuse=operation`；不同有效输入返回409。同热点同输入的新operation复用原任务 `reuse=result_cache`，包含失败记录。改输入保留旧任务，调用次数按热点累计。重复、失败、不足均不自动追加请求。
- 共享终端的核价、账号检查、5元账本与OS锁；锁内才构造Runner并读取账本。挂起pending请求保留全额预留并阻止同类重发。POST返回前即保存成功或失败；中途关闭浏览器不取消服务端已启动操作。

本段覆盖上文「真实研究尚未接入」中取材部分；完整研究卡/任务队列、提词与推荐接口仍未接入。页面可直接发起研究取材，自动保存输入；「保存热点」仍是独立免费操作，不是研究的强制前置点击。

## ticket07 已接入的研究接口（覆盖06的取材阶段终点）

- `POST /api/hotspots/:id/research` 仍仅接受 `{operation_id:UUID}`，同步取材后自动研究，返回 `kind=research` 的任务；不再以取材任务作为本接口终点。取材记录仍独立保留，`GET /api/hotspots/:id/materials` 继续可读。未建立后台队列；完成返回前已保存，浏览器关闭不取消服务端工作。
- `GET /api/hotspots/:id/research` 返回 `{tasks:[...]}`；`GET /api/tasks/:id` 返回单个研究任务。纯磁盘读取，绝不自动执行。任务保留06身份、输入快照、材料、警告和预算字段，新增 `kind:research/result/event_candidates/selected_event/research_completed`。running读取只表示尚未完成，可能执行中或中断，不自动续跑。
- 状态为 `running/completed/needs_clarification/failed/blocked`。仅有候选事件时 result=null、research_completed=false；`PATCH /api/tasks/:id/event` 仅接受 `{event_id}`，仅限该任务已保存的候选，用其 source_ids 对材料过滤后继续提词。重复选同事件返回原任务；改选其他事件409，未知候选400，不搜索、不读新网页。同事件来源分歧使用带speaker及source_ids的disputed背景，不进入此暂停分支。
- result为 `{id,task_id,hotspot_id,status,event,background,keywords,evidence_groups,gaps,...}`，沿用现有Runner研究结构：event含name/time/location/identity_notes；background含text/source_ids/status/speaker；keyword含id/term/meaning/source_id/quote/stance/speaker/concepts。连续引文须包含原词且出现在引用材料中，最长160字；stance为neutral/affirmed/denied/disputed/attributed，否定与一方说法须有speaker。材料链不是真假判断，concepts为联想，不冒充原词。研究成功不自动推荐。
- `result.status=no_usable_text` 时没有背景、词和材料分组，research_completed=false且不调用模型；有可引用文本时允许在材料偏少警告下研究，keywords为空则status=insufficient。人工来源 `id=M1/kind=manual/status=manual`，保留text/source_description/submitted_at，read_at与published_at为null，校验其用户提交原文，不声称系统已读网页。全部网页不可读但有人工文本时可以仅研究人工文本。
- 研究沿用原正式账本和OS锁，模型也按热点累计计次。每热点研究最多四次（含失败与事件选择）；每条模型路径检查pending、核价、账号和预算后预留费用。失败或预留不清不自动重发；同operation、同输入重放包含失败及澄清结果。研究错误code为BUDGET_BLOCKED（付费保护受阻）/RESEARCH_STOPPED（模型或引用检查失败）/MODEL_FAILED（未完成），已有材料保留，错误不暴露外部敏感细节。

推荐、词义修改、选择、轮次与草稿真实接口仍由08–11接入。本票未验证正式收费服务的语义质量；事件划分、说法归属及引文语境仍需人工审核，逐字校验不等于事实核验。

## ticket08 已接入的词义、选择与推荐接口（覆盖上文相应未实现说明）

以下均为真实本地接口，继续使用同源保护与JSON大小限制；不接受demo参数。研究必须已完成，允许研究关键词为空时添加并选择人工补词。免费操作不加载模型客户端或密钥、不创建费用条目。

| 操作 | 请求 | 响应 |
| --- | --- | --- |
| 读取关键词及本轮选择 | `GET /api/research/:id/keywords` | `{keywords,keyword_ids,mock:false}` |
| 保存 / 撤销修正 | `PATCH /api/research/:id/keywords/:kid`，`{correction:string或null}` | 同上；空白视为撤销，仅修正解释 |
| 人工补词 | `POST /api/research/:id/keywords`，`{term,meaning}` | 同上；term非空且不超过100字，meaning可空且不超过1000字；新词默认未选 |
| 保存本轮选择 | `PUT /api/research/:id/selection`，`{keyword_ids:[...]}` | 同上；允许清空，拒绝未知或重复ID |
| 显式推荐 | `POST /api/research/:id/recommendations`，`{operation_id:UUID,mode:direct或manual}` | 同步执行并保存推荐任务；失败和拦截也返回200及任务error |
| 读取推荐记录 | `GET /api/research/:id/recommendations` | `{tasks:[...]}`，按创建时间排列，纯磁盘读取 |
| 查询推荐任务 | `GET /api/tasks/:id` | 原推荐任务，纯读取；与研究任务共用查询入口 |

真实POST不接受原型中客户端提供的`keywords`快照：服务端使用已保存关键词与当前选择构造快照，拒绝伪造原词、出处与解释。direct只向模型提供研究原词及已保存修正，模型自行择词，不混入人工补词；manual仅提供当前keyword_ids，即使历史补词仍保存，也不绕过选择。多个词可分别成题，不要求每题使用全部所选词。关键词含`kind:original/manual`与`correction`，原词保留meaning/source_id/quote/stance/speaker/concepts；人工词为独立U前缀ID，`verified:false,source_id:null,quote:null`，不会成为已核实事件事实。模型输入的meaning采用当前correction或原meaning，另保留original_meaning。轮次快照保留原meaning和correction，后续修改不回写旧候选。

修正、补词和选择存于`workbench-data/keyword_edits/:researchId.json`，不改研究文件。推荐任务独立存于`workbench-data/recommendation_tasks/:taskId.json`，包含id/kind/research_id/hotspot_id/operation_id/mode/keyword_snapshot/status/stage/result/error/created_at/finished_at/budget/reuse/mock:false。status为running/completed/failed/blocked。result含id/task_id/research_id/mode/keyword_snapshot/input_hash/candidates/empty_reason/validation_scope/human_review，候选沿用已确认的`id/title/opening/knowledge_question/used_keyword_ids/association_reason/visual_direction/verification_points`；visual_direction为文本数组，verification_points为非空文本数组。

复用原Runner的3072输出上限、核价、账号检查、共享5元账本、预留和OS锁；不重新搜索、取正文或研究，也不另建预算。最多三题；零题必须有非空理由。校验候选字段、唯一ID、所用词范围、标题/开场原词以及画面/待查证文本，`validation_scope=structure_and_keyword_references,human_review=pending`，不表示事件或科学内容通过核验。待确认pending推荐会阻止同热点推荐重发，失败保留费用记录，无隐式重试。

同一research与operation_id重放原任务，包含失败与当时快照；mode不同409。关键词后续修改不改变该操作的语义，新意图必须使用新operation_id。每次新的显式推荐都会调用模型，payload携带operation_id以避免把旧模型缓存冒充新生成；所有旧任务保留。失败时result=null，error为BUDGET_BLOCKED（付费保护受阻）/RECOMMENDATION_STOPPED（模型或输出校验失败）/MODEL_FAILED（其他失败），不暴露外部异常详情。请求中断后可重新打开热点只读查看，不自动续跑。

当前页面展示最近一次成功结果（包括零候选）和最新操作错误，失败不会清除已有候选。展示完整候选、材料引用链接、人工词未核实身份与解释快照，并提示人工检查原物件/数字辨识度、独立知识问题和待查证事项。未保存的修正或补词会阻止推荐并提示保存。刷新重开可恢复；历史切换、换批去重和草稿编辑选用仍由09、10接入。受控验收仅证明流程与保护逻辑，正式模型的选题语义和科学质量需后续真实审核。
