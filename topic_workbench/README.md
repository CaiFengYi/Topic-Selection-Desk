# 选题台：ticket01 本地原型

只实现「模拟榜单 / 手动输入 → 模拟研究 → 背景、材料与关键词 → 停止」。不包含推荐、词义修正、保存恢复或真实服务接入。

在工作区运行：

```powershell
./run-topic-workbench.ps1
# 端口被占用时：./run-topic-workbench.ps1 -Port 8766
```

打开 http://127.0.0.1:8765 ，Ctrl+C 停止。也可用现有 Python 执行 `python -m topic_workbench --port 8765`。无新增依赖、无构建步骤；仅监听 127.0.0.1，仅提供 `public/` 中的静态文件，不加载 `.env.local` 或研究验证客户端。

## 操作

1. 从 B站、抖音、微博的虚构榜单中选一条，或手动填写任意热点标题。
2. 展开可选线索，填写来源链接、地点、事件时间和关注点；可粘贴人工材料并注明来源。
3. 点击「开始模拟研究」，查看等待、整理材料、提取关键词及完成状态。执行期间锁定输入与提交，筛选榜单仍可操作。
4. 查看研究卡、缺口及关键词出处；点击 S1 可展开材料。人工原文完整保留，标注未回查；转载与原材料归入同一内容链。
5. 展开「候选接口记录」，查看本次操作的完整模拟请求与响应。

三条榜单使用各自的虚构夹具；任意手动标题使用明确标注的通用模板，**不会分析该标题的真实语义或真实事件**。修改榜单标题后转为手动入口，避免套用原事件夹具。人工材料仅展示原文，不自动参与模拟提词。来源地址使用保留的 `.invalid` 域名，不访问原页面。

数据只存于当前浏览器页面的内存，刷新即清空。静态服务只支持读取，不包含业务写接口。API 收费请求、正式资料写入、推荐请求均为零。模拟流程不能证明真实取材质量、引用校验、费用保护或持久化已实现。

## 候选接口契约（未确认）

接口由 `public/mock-api.js` 的内存适配器演示，**当前没有对应 HTTP 业务接口**。页面仅通过 HTTP GET 加载静态文件。契约待 ticket04 对照实际原型由用户确认，不能据此视为已经冻结。

| 动作 | 候选请求 | 响应 |
| --- | --- | --- |
| 创建热点 | `POST /api/hotspots` | `{id, mock: true, input}` |
| 发起研究 | `POST /api/hotspots/:id/research`，`{operation_id}` | `{id, hotspot_id, operation_id, mock, status: "queued", stage, result: null}` |
| 查看任务 | `GET /api/tasks/:id` | 同一任务身份，`status: running / completed`，`stage`；完成后包含 `result` |

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

Browser plugin not available；使用已有 Playwright 与本机 Chromium，从浏览器完成三平台榜单研究、手动输入、线索、人工原文、安全文本渲染、阶段状态、防重复提交、出处展开、空标题和窄屏布局验证。验收证据与执行结果链接记录在 ticket01；原有 29 项离线测试保留并运行。
