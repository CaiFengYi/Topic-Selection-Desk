# Triage Labels

五种标准角色与本地任务状态的对应关系：

| 标准角色 | 本地状态 | 含义 |
| --- | --- | --- |
| needs-triage | needs-triage | 等待维护者评估 |
| needs-info | needs-info | 等待报告者补充信息 |
| ready-for-agent | ready-for-agent | 规格完整，代理无需额外人工背景即可接手 |
| ready-for-human | ready-for-human | 需要人工实现 |
| wontfix | wontfix | 不予处理 |

任务实现并通过验收后，使用终态 `completed`，并在任务文件中勾选验收清单、追加验证证据；它不属于上述五种分诊角色。

技能要求应用标签时，更新任务文件顶部附近的 `Status:` 行，
使用表中的本地状态名称，例如：

Status: needs-triage
