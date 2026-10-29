# AGENTS.md

本文件适用于本仓库；`TrendRadar/` 是固定版本的第三方子模块，其源码遵循上游自己的说明。

## 产品边界

这是个人使用的本地热点创作选题台：榜单或手动输入 → 研究与语境提词 → 明确点击推荐 → 编辑、多选与保存草稿。知识问题应独立成立，不能用通用原理裁定具体争议或事故。

- 软件交付到选题草稿，不自动启动知识核验、脚本、配音或视频生成。
- 输入、来源一方说法、原词、人工补词、延伸概念及已核实知识必须区分；保留数字、单位、否定语境和出处。
- 材料不足时保留缺口，不凭模型记忆补全，也不把多家转载视为独立佐证。
- “选用”只表示继续打磨，不等于用户已完成内容审核。

## 开始工作前

先读 `README.md`、`CONTEXT.md`，再按任务读取：

| 工作 | 入口 |
| --- | --- |
| 产品规格与历史验收 | `.scratch/topic-workbench/PRD.md`、`issues/` |
| 前端设计与维护 | `topic_workbench/DESIGN.md`、`topic_workbench/README.md` |
| 接口与持久化约定 | `topic_workbench/CONTRACT.md` |
| 预算、模型和终端研究 | `research_validation/README.md` |
| 真实验收结论及内容限制 | `docs/topic-workbench-acceptance.md` |

文档中的本机截图、磁盘路径和历史结果是交付证据，不保证在另一台机器存在。以当前源码、任务记录及可复现检查为准，不将旧日期的账号或价格检查当作当前可用证明。

## 结构与依赖

- `topic_workbench/__main__.py`：Python标准库HTTP服务，仅监听 `127.0.0.1`，限制静态目录并检查同源。
- `service.py`：本地榜单、热点输入和保存；`materials.py` / `research.py` / `recommendation.py` 对接取材、提词、推荐及草稿。
- `public/`：原生HTML/CSS/ES模块；`workflow.js`管理视图步骤，`live.js`连接真实接口，`mock-api.js`只供显式模拟模式。
- `research_validation/`：Exa、DeepSeek、引用校验、共享预算及进程锁，前端与终端复用这些保护。
- `tests/`：unittest离线回归，外部响应受控；价格相关测试固定时间，正式程序继续检查真实时间。
- `TrendRadar/`：固定提交的上游采集器和依赖锁；不要更新子模块版本、修改上游源码或更换模型，除非任务需要。

没有Node运行依赖或前端构建链。优先复用现有原生控件、SVG图标及CSS变量；确有必要才增加组件库，不为局部改动迁移框架。

## 运行与验证

首次安装：`git submodule update --init --recursive`，然后 `uv sync --frozen --project TrendRadar --python 3.12`。

在仓库根目录使用PowerShell：

```powershell
./run-topic-workbench.ps1 -Port 8766
# http://127.0.0.1:8766/ 为真实本地界面；/?mode=demo 为模拟演示。
./TrendRadar/.venv/Scripts/python.exe -m unittest discover -s tests -v
Get-ChildItem topic_workbench/public/*.js | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw | node --input-type=module --check
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($_.Name)" }
}
git diff --check
```

前端改动还须在浏览器验证相关交互、控制台和桌面/手机布局；语法检查不能替代页面验收。优先使用隔离数据、受控响应，不为证明界面行为反复调用正式服务。未验证的浏览器或状态如实说明。

## 视觉与交互约束

- 保留已认可的绿色设计语言、完整侧栏、统一字号/间距/圆角和SVG描边。
- 每次仅展示一个主要工作阶段，步骤状态与执行、失败、恢复同步；切换视图不触发收费请求。
- 正文、引文、快照与编辑表单按需展开，候选标题、开场和下一步操作优先。
- 保留加载、空态、错误、禁用、键盘焦点及响应式行为；不以视觉精简为由丢弃数据或功能。
- 切换步骤或轮次保留当前页的未保存编辑；关闭页面只保证恢复已保存内容。
- 用户输入及外部文本在HTML边界转义；动态链接限制协议，不插入未转义模型输出。

## 凭据、费用与本地数据

- 凭据只放在忽略Git的 `.env.local`。不得输出、提交、复制到报告或通过聊天索取真实密钥。
- `workbench-data/`、`validation-output/`、虚拟环境和缓存不入库；迁移旧实例时私下保留数据及原账本。
- 前端和CLI共用 `validation-output/ledger.json`、OS锁及累计5元预算。禁止删账本、释放不确定预留、换目录或自动扩容来完成验收。
- 收费调用须有有效核价、账号可用和充足预算。过期时保持拦截，不能仅延长日期；重新核价后才更新配置。
- 不自动补查、重读、重试或续跑；显式换批只增加一次推荐，复用材料，保留旧轮次和人工修改。
- 正式服务失败须保留输入、已取得资料及真实错误，不以模拟结果冒充成功；费用估算不等于账户账单。

## 修改与交付

默认中文沟通，代码、命令、变量名和提交信息使用英文。结论先行，写明关键假设和验收标准；有阻塞先说明，不掩饰不确定性。

只改需求直接涉及的代码，遵循既有风格；不用一次性抽象或未经要求的可配置性，不顺手重构。问题先复现，再做最小修复和相关验证；只清理本次修改产生的遗留项。

提交前展示变更摘要，使用简洁英文commit message。只暂存任务相关文件；仅在用户授权时推送，禁止强推覆盖远端历史。交付说明包括改变的行为、验证结果及实际限制。

## Agent skills

### Issue tracker

需求与问题使用本地 Markdown，保存在 `.scratch/<feature>/`。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五种默认状态，通过任务文件的 `Status:` 行记录。详见 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context：根目录 `CONTEXT.md` 与 `docs/adr/`。详见 `docs/agents/domain.md`。
