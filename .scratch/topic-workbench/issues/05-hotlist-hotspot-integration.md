# 05: 真实榜单与热点记录的前端接入

**What to build:** 用户从前端读取真实本地榜单或手动建立任意热点，保存后可重新打开；榜单刷新只采集与保存。

**Blocked by:** 04: 演示异常流程并确认原型与接口

Status: completed

- [x] 本地服务、热点记录、榜单接口和页面按已确认契约贯通，三平台信息和时间如实显示。
- [x] 无当前榜单时明确提示，不把历史示例数据当作当前热榜；已确定同一事件的来源差异不自动合并成结论。
- [x] 两种入口建立可恢复的同类热点记录，保留人工线索和补充材料来源；不依赖三个固定案例。
- [x] 服务仅供本机使用，浏览器不获得密钥；页面查看、热点保存及榜单刷新均不调用模型。

## Comments

2026-10-28验收缺陷修复：用户报告“刷新榜单 · 仅采集”失败。读取当日持久化记录并再次请求原服务，均复现三平台failed/0条；同一采集器在受限环境的HTTP(S)_PROXY指向不可用127.0.0.1:9，报ProxyError/WinError10061。正常主机网络使用本机有效代理，以原URL、原请求头和域名校验取得三平台各30条。已核对并停止原8765选题台进程，在正常网络环境重启同端口服务；未改采集源、代理系统设置、域名校验或重试次数。曾用不同查询参数拼接方式探测得到HTTP403，不能代表生产原URL不可用；最终以原采集器及真实页面刷新验证恢复。

另修复错误反馈缺陷：原接口把全部失败表述为“暂无当前榜单”，部分失败则只说普通采集完成；现在message明确列出失败平台、提示检查服务网络或代理，部分成功时说明其余平台为本次结果。读取持久化失败记录后仍显示同一提示，不把历史数据冒充当前数据。新增两项测试先失败后通过，完整75项后端测试通过；6组Chromium/Playwright页面检查通过，Browser plugin not available。覆盖真实页面刷新90条、重载、原有热点ID保留、1440/390/320布局、外部失败夹具提示、无自动重试及无付费POST；无控制台错误。截图复核通过。测试过程中与用户操作并行，未修改或回滚用户热点或账本；浏览器诊断脚本自身前后费用账本哈希一致，不把之后的用户研究计为诊断调用。

本次证据：[75项后端日志](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-diagnosis-tests.log)、[6组页面结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-fix-qa.json)、[可重跑浏览器脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-fix-qa.cjs)、[真实刷新响应](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-fixed-response.json)、[恢复截图](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-fixed-desktop.png)、[失败提示截图](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/hotlist-failure-message.png)。未提交Git。

2026-10-27：用户回复“可以”，认可任务拆分与阻塞关系。本任务已发布，尚未开始实现；任务状态不代表阻塞条件已解除。

2026-10-27：用户要求“/goal 执行ticket05直至完成”。已确认04实际交付获认可，前置阻塞解除；本票实现并通过下述验收，Status改为completed，06前置阻塞解除。未实施06至12。用户随后要求“提交”，授权提交本票实现与验收记录。

默认入口 `http://127.0.0.1:8765/` 接真实本地榜单与热点JSON持久化；`/?mode=demo` 保留已确认原型。运行 `./run-topic-workbench.ps1`。接口见 [CONTRACT.md](../../../topic_workbench/CONTRACT.md) 的ticket05段；操作与存储见 [README.md](../../../topic_workbench/README.md)。新增GET榜单、POST仅采集刷新、POST/GET/PATCH热点及列表；同一热点修改保留ID，页面刷新、关闭及服务重启后可重新打开。保存完整人工材料原文、来源说明、提交时间及地点/事件时间/关注点，榜单来源快照独立保留。相似标题分别保存，不自动裁定或合并来源说法。

仅读取香港时区当日SQLite最近一次采集，无当天数据时显示空态，不读2025历史示例。刷新复用现有DataFetcher域名校验（每平台一次、max_retries=0）和LocalStorageBackend，不调用TrendRadar应用主入口，不加载密钥或研究/模型客户端。失败平台不以旧结果冒充当前榜单。兼容旧HH-MM采集时间；未知来源更新时间保持null，新采集分别记录source_updated_at、collected_at和success/cache。服务仅绑定127.0.0.1并检查Host、Origin及Fetch Metadata，静态根目录限public，业务响应不暴露异常细节，JSON原子替换且忽略Git。

验收：37项Python测试通过（29项原有回归+8项新增），覆盖持久化、任意标题、两种入口、人工原文、旧时间格式、无当日数据、部分/全部采集失败、重复刷新锁、无效输入/伪造条目、HTTP同源边界及未接入付费端点。修复Windows下SQLite只读连接未显式关闭导致的文件占用；最终全套通过。命令：`./TrendRadar/.venv/Scripts/python.exe -m unittest discover -s tests -q`。全部7个ES模块语法检查及git diff --check通过，无新增依赖/构建步骤。

前端：9组ticket05浏览器验收及14组ticket04原型回归通过，Chromium/Playwright（Browser plugin not available）。覆盖1440/1280/768/390/320宽度、页面身份/非空/无框架覆盖层、零控制台错误、文本转义、从真实SQLite读90条、筛选、保存人工材料、未知手动标题、更新同一ID、页面刷新和服务进程重启恢复、无榜单手动保存及真实三平台刷新。截图复核后修复已保存列表的排名列继承问题，重跑验收通过。测试热点与刷新结果置于validation-output隔离存储，未混入正式热点；浏览器仅请求本机API。

真实外部采集：最终一次于2026-10-27 19:41:31 +08:00保存B站/抖音/微博各30条；来源更新时间分别为19:41:28、19:41:29、19:33:14，微博明确为聚合cache。旧正式当日SQLite仍为08:00采集，来源时间未知。没有调用Exa或DeepSeek；正式账本SHA-256前后均为 `2c8971e3343de9a6b1a9c0508203eac64f4947fa5fe2989a17e23479dadb22d6`。未验证其他浏览器、完整读屏器；研究、推荐、草稿持久化和付费保护仍由后续票据负责。

证据：[9组浏览器结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-qa.json)、[可重跑脚本](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-qa.cjs)、[37项后端结果](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-tests.log)、[14组原型回归](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket04-polish-qa.json)、[真实采集响应](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-real-collection.json)、[桌面](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-desktop.png)、[手机](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-mobile.png)、[无榜单](C:/Users/CaiFY/.codex/visualizations/2026/10/27/01a17d23-307a-74a3-a9a8-2c1db92ad246/ticket05-empty.png)。
