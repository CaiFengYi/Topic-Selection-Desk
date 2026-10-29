# Issue tracker: Local Markdown

本工作区的需求与问题保存在根目录 `.scratch/`。
`TrendRadar/` 是上游源码子仓库，不作为本项目的任务跟踪器。

## 文件约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD：`.scratch/<feature-slug>/PRD.md`
- 实现任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 编号
- 每个任务文件顶部附近使用 `Status:` 行记录状态，名称见 `triage-labels.md`
- 评论与讨论追加在任务文件末尾的 `## Comments` 下

## 技能操作映射

“发布到任务跟踪器”：按上述约定创建本地 Markdown 文件，按需创建目录。

“读取相关任务”：读取用户指定路径的文件；若提供任务编号，在对应功能目录中查找。
