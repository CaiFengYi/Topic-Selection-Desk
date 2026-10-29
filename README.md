# Topic Selection Desk · 热点创作选题台

个人使用的本地工作台：从热点中理解语境、提取有出处的原词，再生成可独立观看的科普选题草稿。数据保存在本机，服务只监听 `127.0.0.1`。

## 能做什么

1. **选择热点**：查看B站、抖音、微博榜单，或手动输入标题，按需补充事件线索和人工材料。
2. **研究与选词**：Exa取材，DeepSeek整理事件语境和关键词；展示来源说法、原文、材料链及缺口，支持词义修正和人工补词。
3. **挑选草稿**：明确点击直接推荐或人工选词推荐，每批最多3题；可换批、查看历史、编辑、多选并保存，重启后读取已有记录。

分步工作区只展示当前重点。材料、引文、创作依据及编辑表单按需展开，左侧切换「发现热点 / 已保存」。选用不自动启动知识核验、脚本或视频制作。

## 安装与启动

需要 Git、[uv](https://docs.astral.sh/uv/) 和Python 3.12。以下命令在PowerShell中执行；uv可管理所需Python版本。

```powershell
git clone --recurse-submodules https://github.com/CaiFengYi/Topic-Selection-Desk.git
cd Topic-Selection-Desk
uv sync --frozen --project TrendRadar --python 3.12
./run-topic-workbench.ps1 -Port 8766
```

打开 [本地选题台](http://127.0.0.1:8766/)，Ctrl+C停止服务。已有旧进程时停止它再启动，或指定其他端口；更新代码后需重启服务并刷新页面。

漏取子模块时运行 `git submodule update --init --recursive`。`TrendRadar/`固定在上游提交 `68c8916c450f8c8dd36cb88a189f7c2e46681ab5`，使用其锁文件安装依赖，虚拟环境位于 `TrendRadar/.venv/`。

如果系统阻止未签名脚本，可仅对当前进程使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./run-topic-workbench.ps1 -Port 8766
```

也可以从仓库根目录运行 `uv run --frozen --project TrendRadar python -m topic_workbench --port 8766`。

## 免费演示与真实服务

打开 `http://127.0.0.1:8766/?mode=demo` 可使用明确标注的模拟原型，无需API密钥、不调用收费服务；模拟数据在页面内存中，不能证明真实研究内容质量。

真实页面查看、保存、编辑、选用和恢复不收费；榜单刷新只采集，不调用模型。新安装没有历史记录；榜单只显示当天数据，空榜单时可以手动添加或显式刷新。

需要真实研究时，先创建本机配置：

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

在本机编辑 `.env.local` 填写 `AI_API_KEY`（DeepSeek）和 `EXA_API_KEY`。不要将密钥发到聊天或写入版本控制。

检查 `TrendRadar/config/config.yaml` 的 `ai` 配置，仅调整以下字段，保留其他上游配置，密钥字段保持空：

```yaml
ai:
  model: "deepseek/deepseek-v4-flash"
  api_base: "https://api.deepseek.com"
  api_key: ""
```

正式请求使用Exa和DeepSeek官方服务，依赖服务进程的网络与代理。程序不自动清除系统代理，不因浏览器能打开本机页面就推断外网可用。

**当前价格快照已过期**：仓库保留的核价有效期截至2026-10-28 23:59:59 +08:00，之后正式收费操作会被拦截。必须重新核对官方价格、模型与计费依据后更新 `research_validation/settings.json`，不能只延长日期。查看、恢复、模拟演示及离线测试仍可执行；上传仓库不表示已重新核价或确认账号可用。

## 费用与数据保护

- 前端与终端共用累计5元预算和 `validation-output/ledger.json`；失败或中断保留不确定费用，不自动扩容或重置账本。
- 每热点最多两次搜索，每次最多5条；最多一批5页正文。材料不足不补查，不隐式重试；明确换批只重新推荐。
- 费用按返回用量及核价快照估算，不等于账户实际扣款；API成功但内容校验失败仍可能计费。
- 热点、修正、轮次和草稿在 `workbench-data/`；正文、模型原始输出及用量在 `validation-output/`。这些目录、密钥、环境与缓存均不上传。
- **迁移旧实例时私下备份并恢复上述两个数据目录**，尤其保留原累计账本；不能通过重新克隆或换目录绕过费用限制。本仓库不携带个人运行数据。

研究卡、来源引用和结构校验不等于事实已核实；转载不等于独立佐证，人工补词不自动成为事实。内存价格倒挂等历史案例仍有证据缺口。草稿中的科学结论、计算和演示条件须继续核验，最终取舍由用户判断。

## 开发与检查

原生HTML/CSS/ES模块，Python标准库HTTP服务，无Node运行依赖或前端打包步骤。JavaScript语法检查需要本机Node.js；不必安装npm包。

```powershell
./TrendRadar/.venv/Scripts/python.exe -m unittest discover -s tests -v
Get-ChildItem topic_workbench/public/*.js | ForEach-Object {
    Get-Content -LiteralPath $_.FullName -Raw | node --input-type=module --check
    if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($_.Name)" }
}
git diff --check
```

测试使用隔离数据和受控外部响应，不消耗正式额度。价格相关测试固定在核价快照内的时间，正式程序仍使用真实时间并保留价格过期测试。前端改动还需浏览器验证交互、控制台及响应式布局；已有浏览器证据只覆盖Chromium。

| 目录 | 内容 |
| --- | --- |
| `topic_workbench/` | 本地HTTP、热点与草稿业务、真实页面及模拟原型 |
| `research_validation/` | 检索、研究、推荐、引用校验、预算与锁 |
| `tests/` | 离线回归 |
| `TrendRadar/` | 固定版本的第三方采集器子模块与依赖锁 |
| `.scratch/topic-workbench/` | 产品规格、任务与验收记录 |

开发约定见 [AGENTS.md](AGENTS.md)；领域术语见 [CONTEXT.md](CONTEXT.md)；接口见 [CONTRACT.md](topic_workbench/CONTRACT.md)；设计见 [DESIGN.md](topic_workbench/DESIGN.md)；历史真实验收及限制见 [验收记录](docs/topic-workbench-acceptance.md)。历史文档中的本机磁盘路径、截图和报告链接不随仓库分发。

## 上游说明

采集能力复用 [sansan0/TrendRadar](https://github.com/sansan0/TrendRadar)，通过子模块保留其源码、许可证与版本信息；本仓库未将上游源码复制为自有代码。选题台通过独立本地服务运行，不经过上游整榜AI分析入口。原终端验证说明见 [research_validation/README.md](research_validation/README.md)。
