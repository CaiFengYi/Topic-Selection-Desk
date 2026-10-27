# Exa + DeepSeek 按需研究验证

入口：`D:\ai-projects\ai-video-edit\run-research-validation.ps1`。复用TrendRadar现有uv环境和锁定依赖；原版采集、主配置和AI客户端接口不变。本轮提供终端研究与推荐，不含网页和视频生成。

## 密钥与体检

工作区根目录 `.env.local` 使用 `AI_API_KEY`（已有DeepSeek密钥）和 `EXA_API_KEY`。文件已忽略；不要把值发到聊天或写进命令行。程序只向Exa和DeepSeek官方API发送请求。

```powershell
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' doctor
```

体检检查配置、价格有效期和费用预估，不请求API。正式执行时，首次真实请求同时验证账号鉴权与额度。入口可从任意工作目录运行。

## 分步执行

```powershell
# 收集三个已由用户选定的事件，并调用DeepSeek提词；到此停止，不生成选题。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' research --case all

# 看完研究卡后，用户选择“直接推荐”，再运行：
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' recommend --case all

# 人工选词：请使用该事件研究卡中的实际编号。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' recommend --case brakes --keywords K1,K3

# 人工补充词只作为创作线索，不自动视为已核实事实。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' recommend --case brakes --keywords K1 --add-keyword '支架结构'

# 仅从本地文件生成报告，零网络调用。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' report

# 免费查询DeepSeek账号是否可用，不显示余额金额。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' doctor --online

# 排除账号/网络问题后，显式重试失败的模型请求；此前费用和预留继续累计。
& 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' research --case fire --retry-failed
```

案例：`brakes`（尊界踏板）、`fire`（神木问界事故）、`memory`（内存价格倒挂）。`all`表示三个已选案例，不会研究整榜。

若系统阻止未签名脚本，可使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\ai-projects\ai-video-edit\run-research-validation.ps1' doctor
```

## 结果与人工修改

结果位于工作区 `validation-output/`：

- `report.md`：研究卡、关键词、推荐轮次、来源与费用摘要。
- `latest_topics.md`：每例最新一轮直接推荐，附开场、原词、待查证事项和助手编辑复核，便于选择。历史轮次保留在完整报告中。
- `report.json`：完整机器可读报告；不是最终人工验收结论。
- `ledger.json`：三例共用的预算账本，含失败或未完成请求的预留额。不要删除或重置它来重跑本轮。
- `<case>/sources.json`：实际取得的正文、摘要、读取状态、URL、发布时间和读取时间。
- `<case>/research.json`：通过结构与引用校验的研究卡。
- 研究状态`ready`表示结构和出处检查通过；`insufficient`表示保留了可追溯关键词，但关键背景仍有缺口，不计为研究验收通过。后者仍可在用户选择后围绕已有关键词推荐，模型必须保留缺口。`research`命令遇到该状态会返回非零退出码。
- `<case>/research_versions/`：复核后失效的旧研究版本。读取缓存时也会重新校验；旧版本和实际模型返回均保留。
- `<case>/requests/`与`model/`：已脱敏的请求结果、模型用量及失败记录。
- `<case>/recommendations/`：各输入对应的推荐轮次，相同输入不再付费请求。
- 结构和关键词引用校验通过不等于内容审核通过；`editorial_review`保存助手编辑复核，`human_review`仍等待用户。重复运行不会覆盖原轮次时间或已有复核意见。
- `<case>/human_edits.json`：人工修改单独保留，程序不会用模型输出覆盖。`user_keywords`可填写`{"term":"原词","meaning":"你的解释"}`；`topic_notes`可记录选用、修改、放弃和理由。

两份相同正文不会当作两份材料；媒体转引同一声明由研究卡的`evidence_groups`归组。不同网站不自动视为独立佐证。分组、事件身份、来源观点归属与科学选题仍需要人工审核。

## 费用控制与失败

- 本轮累计上限5元，持久账本和Windows进程锁防止并发重复扣费。
- 每例最多两次搜索、每次五条结果；最多一个五页正文批次。默认不使用Exa深度研究或AI摘要。
- 请求发送前保存预留额；失败或进程中断时保留该金额，不能假定对方没有计费。
- 成功后按Exa返回的估算或公开单价计账；DeepSeek记录实际token用量，使用已核对的高峰单价估算。Exa按8元/美元预留预算，参考核查时中行现汇卖出价6.685元/美元；这不是实际外汇结算报价。
- SDK与LiteLLM均关闭自动重试。失败请求缓存后不隐式重发；保留错误供排查。模型JSON、原词引用或输出长度不合格时，不会伪造修复结果，也不会自动产生下一次模型费用。
- 新收费请求之前，先用DeepSeek免费余额接口确认账号可用；余额不足、鉴权失败或限流时停止后续收费请求。命中已有缓存不要求在线检查。`--retry-failed`仅显式重试失败的模型请求，原始失败记录会另存。
- LiteLLM使用本地内置模型表，不额外请求远端价格表；本工具的费用估算只使用已核对的`settings.json`快照。
- 当前核价快照截至2026-10-28有效，之后停止付费调用；重新核对后更新`settings.json`里的价格、来源和有效期。其他接入地址或未核价模型会停止。
- 输入材料每页最多6000字进入模型，完整已取得正文另存。未读到的部分不能承诺被模型分析。
- 创作调用只接收选词、词义和研究缺口，不再复制整份事件背景，减少生成事件解说或争议辨别内容。标题保留原数字和物件，正文聚焦一般性知识问题；具体事实和科学结论仍待查证。
- 摘录只要求非空、逐字匹配正文并不超过160字，不设任意的最短字数门槛。内存倒挂比较必须区分价格水平与涨幅，缺乏同条件报价时记录证据不足；一方报价标明来源，不能自动推广成整个市场事实。
- 账号可能使用赠送额度；应用费用是估算/预留，不等同于账单扣款，税费与支付渠道费用需以账号账单为准。

DeepSeek保留原配置名`deepseek/deepseek-v4-flash`。2026-10-27官方文档说明此旧名现映射到Flash当前版本；每次调用记录实际返回的模型名，不把别名当作固定模型权重。

价格与协议依据：[Exa价格](https://exa.ai/pricing)、[搜索](https://exa.ai/docs/reference/search)、[正文](https://exa.ai/docs/reference/get-contents)、[DeepSeek价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。

## 离线测试

```powershell
& 'D:\ai-projects\ai-video-edit\TrendRadar\.venv\Scripts\python.exe' -m unittest discover -s 'D:\ai-projects\ai-video-edit\tests' -v
```

测试覆盖预算持久化与拦截、并发锁、秘密脱敏、引用伪造、来源不足、否定语境、未知关键词、原词辨识度、缓存、价格过期及401/402/429/503失败处理，不请求真实API。运行测试时工作目录使用工作区根目录。
