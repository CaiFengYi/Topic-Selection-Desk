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
保留现有绿色主色的 Operate 工作区：简洁现代、层级清楚，以榜单、研究输入和材料结果为中心。本文件描述现有实现，不引入新品牌概念。
产品事实来源为 `README.md`、`public/mock-api.js` 和 `public/index.html`；视觉来源为 `public/styles.css`、`public/index.html`、`public/app.js` 和 `public/views.js`。

## Colors
绿色用于主操作、当前步骤、选中项与来源引用；浅绿承载轻强调。白色面板叠在浅灰绿画布上，深色正文、灰绿辅助文本和细分隔线组织信息。琥珀色提示研究缺口，红色提示输入或执行错误，状态同时保留文字。

## Typography
使用上述系统字体栈，不加载网络字体。页面标题为 27px / 650 / 1.4，面板标题为 15px / 600，结果标题为 20px / 600 / 1.6；正文与控件为 12–14px，辅助信息为 11px。背景正文最长 72ch；JSON 使用 Consolas / monospace 11px / 1.8。

## Layout
主容器最大宽度 1720px，默认内边距 32px、列间距 24px；榜单宽 264px，输入与结果按 `minmax(320px, .9fr) minmax(0, 1.3fr)` 排列。
在 `max-width: 1279px` 时，榜单缩至 240px，输入与结果上下排列；900px 时主内边距与顶栏水平内边距改为 24px，列间距改为 16px。
在 `max-width: 640px` 时全部单列，水平内边距 16px，顶栏高 64px，页面标题 24px、结果标题 18px；事件元数据单列。榜单仅首次加载默认折叠，始终允许原生展开。

## Elevation & Depth
面板以白底、1px 边框和浅色分区区分层级；主按钮按下时使用 `inset 0 2px 3px #0002`，不依赖面板阴影。

## Shapes
控件圆角 8px，面板圆角 12px；徽标与状态点保留现有局部形状。图标统一使用内嵌 SVG symbol sprite：默认 20px、`currentColor`、1.7 描边、圆端点与圆连接，装饰图标隐藏于辅助技术。

## Components
使用原生表单、按钮和 `details/summary`；主按钮最小高 44px、输入框最小高 42px。平台筛选和榜单选择使用 `aria-pressed`，流程使用 `aria-current`。
等待状态展示说明；加载展示阶段文字、旋转指示和骨架，设置 `aria-busy` 并锁定输入与提交，平台筛选仍可用；失败保留输入并提供重试。状态区使用 polite live region，校验错误使用 alert。
按钮、链接、summary 的键盘焦点为绿色 2px 外框、偏移 4px；输入焦点使用浅绿 2px 外框、偏移 2px。校验时展开所在分组并聚焦无效字段；来源引用展开材料并聚焦 summary。
控件颜色与边框过渡为 160ms ease-out，结果进入为 180ms，旋转周期 800ms；`prefers-reduced-motion: reduce` 停用动画和过渡。
`index.html` 提供语义结构与图标；`styles.css` 管视觉与响应式；`app.js` 管事件、校验、状态和任务轮询；`views.js` 仅渲染并在 HTML 边界转义文本；`mock-api.js` 管内存模拟适配器和接口记录。

## Do's and Don'ts
- Do 复用现有颜色、字体、间距、圆角和 SVG 图标，保持原生 ES modules、无构建步骤及最低必要依赖。
- Do 明示模拟榜单、虚构材料、未核实出处及人工原文边界；手动标题使用通用模板，修改榜单标题后切换手动入口。
- Don't 把候选接口记录当作真实 HTTP 业务接口；模拟数据仅在页面内存中，刷新清空，没有真实检索、收费调用、正式写入、保存恢复或推荐生成。
- Don't 将同一材料链当作独立佐证，或把模拟研究结果表述为已验证事实。
