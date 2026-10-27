---
name: 选题台
description: Operate 风格的本地热点研究模拟工作台
colors:
  canvas: "#f6f8f7"
  surface: "#fff"
  surface-muted: "#f7f9f8"
  ink: "#25332e"
  muted: "#5f6c65"
  line: "#e3e9e5"
  control-line: "#bbc9c0"
  accent: "#24674e"
  accent-hover: "#1c503c"
  accent-soft: "#eaf4ee"
  warning: "#79551b"
  warning-soft: "#fcf7ec"
  danger: "#a32d30"
  danger-soft: "#fff2f1"
typography:
  body: {fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif', fontSize: "14px", lineHeight: 1.65}
rounded: {control: "8px", panel: "12px"}
spacing: {space-1: "4px", space-2: "8px", space-3: "12px", space-4: "16px", space-5: "20px", space-6: "24px", space-8: "32px", space-10: "40px"}
components:
  button-primary: {backgroundColor: "{colors.accent}", textColor: "{colors.surface}", rounded: "{rounded.control}", padding: "10px 16px"}
---
# Design System: 选题台

## Overview
保留现有绿色主色的 Operate 工作区：简洁现代、层级清楚，以榜单、研究输入和材料结果为中心。ticket02–03 在研究结果下方延伸关键词、模拟推荐、历史轮次和草稿编辑多选，不改变现有视觉方向。本文件描述现有实现，不引入新品牌概念。
产品事实来源为 `../.scratch/topic-workbench/issues/02-keyword-recommendation-prototype.md`、`../.scratch/topic-workbench/issues/03-rounds-drafts-prototype.md` 与 `README.md`，实现参照 `public/mock-api.js` 和 `public/index.html`；视觉与交互来源为 `public/styles.css`、`public/index.html`、`public/app.js`、`public/views.js`、`public/recommendation.js` 和 `public/rounds.js`。

## Colors
绿色用于主操作、当前步骤、选中项与来源引用；浅绿承载轻强调。白色面板叠在浅灰绿画布上，深色正文、灰绿辅助文本和细分隔线组织信息。琥珀色提示研究缺口，红色提示输入或执行错误，状态同时保留文字。

## Typography
使用上述系统字体栈，不加载网络字体。页面标题为 27px / 650 / 1.4，面板标题为 15px / 600，结果标题为 20px / 600 / 1.6；正文与控件为 12–14px，辅助信息为 11px。背景正文最长 72ch；JSON 使用 Consolas / monospace 11px / 1.8。

## Layout
主容器最大宽度 1720px，默认内边距 32px、列间距 24px；榜单宽 264px，输入与结果按 `minmax(320px, .9fr) minmax(0, 1.3fr)` 排列。
在 `max-width: 1279px` 时，榜单缩至 240px，输入与结果上下排列；900px 时主内边距与顶栏水平内边距改为 24px，列间距改为 16px。
在 `max-width: 640px` 时全部单列，水平内边距 16px，顶栏高 64px，页面标题 24px、结果标题 18px；事件元数据单列。榜单仅首次加载默认折叠，始终允许原生展开。
推荐区沿结果面板纵向展开，桌面内边距 20px、手机 16px；关键词和候选以细分隔线分组，操作区复用浅色底与 8px 圆角，标题和计数允许换行。

## Elevation & Depth
面板以白底、1px 边框和浅色分区区分层级；主按钮按下时使用 `inset 0 2px 3px #0002`，不依赖面板阴影。

## Shapes
控件圆角 8px，面板圆角 12px；徽标与状态点保留现有局部形状。图标统一使用内嵌 SVG symbol sprite：默认 20px、`currentColor`、1.7 描边、圆端点与圆连接，装饰图标隐藏于辅助技术。

## Components
使用原生表单、按钮和 `details/summary`；主按钮最小高 44px、输入框最小高 42px。平台筛选和榜单选择使用 `aria-pressed`，流程使用 `aria-current`。
等待状态展示说明；加载展示阶段文字、旋转指示和骨架，设置 `aria-busy` 并锁定输入与提交，平台筛选仍可用；失败保留输入并提供重试。状态区使用 polite live region，校验错误使用 alert。
按钮、链接、summary 的键盘焦点为绿色 2px 外框、偏移 4px；输入焦点使用浅绿 2px 外框、偏移 2px。校验时展开所在分组并聚焦无效字段；来源引用展开材料并聚焦 summary。
控件颜色与边框过渡为 160ms ease-out，结果进入为 180ms，旋转周期 800ms；`prefers-reduced-motion: reduce` 停用动画和过渡。

### 关键词与推荐
研究完成显示「从关键词到选题」，停在「尚未推荐」等待明确操作。关键词使用原生复选框和最小高 44px 的标签行；「修正词义」「添加人工补词」和「我来挑关键词」使用原生折叠区。原词、引用与原 AI 解释保持可见，已保存修正另以绿色文字显示；留空保存可撤销。未保存修正会阻止推荐、展开编辑区并聚焦文本框。补词标注人工、未核实且无材料引用，添加后默认未选中；保存、补词和选词均不触发推荐。

「直接推荐」为绿色主按钮，从材料原词取角度并采用已保存修正；「使用本轮选词推荐」为人工模式次按钮，只提交本轮勾选词，未选词时禁用，可分别成题。两个模式均由明确点击触发。加载时显示旋转指示与文字、设置 `aria-busy`，锁定研究输入、编辑控件与两个推荐按钮，保留已有研究和候选；失败以 alert 提示，保留研究、修正与已有候选，等待再次明确点击重试。

每轮最多三个模拟候选，以分隔线列表展示「待核验」徽标、18px 标题、开场、知识问题、所用词、关联理由、画面方向和待查证点。折叠区展示发起时的关键词与解释快照，后续修正不改写已有候选。「演示零候选」仅控制模拟响应，空结果复用琥珀色缺口提示并说明理由。候选是固定交互夹具，通用词使用问题模板，标题与问题未执行真实语义推理。

### 轮次与草稿

候选上方的历史轮次使用原生按钮和 `aria-pressed`，选中轮次使用绿色边框与浅绿底。按钮展示轮次、方式、题数和是否有选用；单行横向滚动，避免窄屏挤压或页面溢出。轮次标题与「换一批」操作允许换行；说明明确复用当前关键词、只重新推荐和真实模式的额度消耗。新轮次完成后聚焦候选标题；查看历史不会发起请求。

每个候选顶部独立展示「待选用 / 已选用 · 待核验」、轮内编号和「已修改」状态。原生复选框支持多选，编辑按钮与复选框行最小高44px。编辑区复用现有控件、间距和分隔线，标题与开场分别标注，空白不可保存；支持保存与取消。编辑缓冲在切换轮次、换批和失败时保留。选用、保存、取消和切换后恢复相应控件焦点，反馈使用 polite live region。

「已选用草稿」折叠区汇总跨轮次草稿，点击可返回并聚焦对应草稿。「模拟保存与恢复」作为次级原生折叠区，未保存快照时禁用恢复，说明覆盖范围、刷新清空及未验证真实持久化的边界。折叠展开状态在草稿操作后保留。模拟快照只含已保存修改，不回退上方关键词；编辑与选用不启动知识核验或制作。

`index.html` 提供语义结构与图标；`styles.css` 管视觉与响应式；`app.js` 管研究事件、校验、状态和任务轮询；`views.js` 仅渲染并在 HTML 边界转义文本；`recommendation.js` 管修正、补词、选词与推荐状态；`rounds.js` 管历史轮次、草稿和内存快照；`mock-api.js` 管内存模拟适配器、候选夹具和接口记录。

## Do's and Don'ts

ticket04 沿用上述 Operate 风格，研究输入上方和推荐操作区增加原生场景下拉框，使用现有输入边框、颜色和焦点外框。澄清事件选项使用可换行的次按钮，补充线索展开并聚焦原表单；警告使用原 gap，失败保留数据。读取失败只展示记录，不展示虚构研究卡；接口样例入口放在既有开发参考折叠区。
- Do 复用现有颜色、字体、间距、圆角和 SVG 图标，保持原生 ES modules、无构建步骤及最低必要依赖。
- Do 明示模拟榜单、虚构材料、未核实出处及人工原文边界；手动标题使用通用模板，修改榜单标题后切换手动入口。
- Don't 把候选接口记录当作真实 HTTP 业务接口；模拟数据和快照仅在页面内存中，刷新清空，没有真实检索、模型推荐、收费调用、正式写入或持久化。切换热点或修改研究输入清除当前研究、修正、轮次、草稿与快照。
- Don't 将同一材料链当作独立佐证，或把模拟研究结果表述为已验证事实。
