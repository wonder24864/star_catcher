# Agent Trace 可视化用户故事

## US-042: Agent Trace 管理员视图

**As a** 管理员
**I want to** 查看所有 Agent 执行的完整 Trace 时序图，包括每步 Skill 调用、输入输出、耗时和 Token 消耗
**So that** 能监控 AI Agent 的运行状态、诊断故障、优化成本

**验收标准：**
- [ ] 管理员端新增"Agent Traces"页面，展示 AgentTrace 分页列表
- [ ] 列表支持筛选：agentName（下拉）、status（RUNNING/COMPLETED/TERMINATED/FAILED）、日期范围
- [ ] 列表每行显示：Agent 名称、关联用户、状态徽章、步骤数、Token 总量、耗时、创建时间
- [ ] 点击进入详情页，展示完整步骤时序图
- [ ] 时序图为垂直时间线，每个步骤节点显示：序号、Skill 名称、状态徽章（SUCCESS/FAILED/TIMEOUT）、耗时(ms)、Token 数
- [ ] 点击步骤可展开查看 input/output JSON（collapsible）
- [ ] 详情页顶部概览卡片：Agent 名称、用户信息、总状态、终止原因、总耗时、总 Token、summary 文本
- [ ] 近 7 天统计卡片：按 Agent 分组的调用次数、成功率、平均耗时、平均 Token
- [ ] 仅 ADMIN 角色可访问

**边界条件：**
- 无 Trace 记录时：显示空状态
- RUNNING 状态的 Trace：时序图显示已完成步骤 + 最后一步显示 spinner
- 步骤 input/output 为大 JSON（>10KB）时：默认折叠，展开时 lazy render
- FAILED 步骤：红色高亮 + 展示 errorMessage

**性能要求：**
- Trace 列表查询 < 1s（分页 20 条）
- 详情页（含全部 Steps）加载 < 2s
- JSON 展开渲染 < 500ms

---

## US-043: Agent 分析简化视图

**As a** 家长/学生
**I want to** 在错题详情和掌握地图中看到 AI 分析的简化摘要
**So that** 了解 AI 做了什么分析，而不需要看复杂的技术细节

**验收标准：**
- [ ] 新增 AgentSummaryCard 共享组件
- [ ] 错题详情页集成：展示该题的 Diagnosis Agent 分析结果
- [ ] 掌握地图详情集成：展示该知识点最近一次 Agent 分析结果
- [ ] RUNNING 状态显示 spinner + "AI 正在分析..."（ADR-008 §6 要求）
- [ ] COMPLETED 显示本地化结果摘要：错误模式类型 + 薄弱知识点数量 + 掌握状态更新数
- [ ] summary 文本通过前端 i18n key 渲染（不直接显示英文原文）
- [ ] ADMIN 角色可看到"查看详情"链接，跳转到 Agent Trace 详情页
- [ ] FAILED 状态显示简短错误提示
- [ ] 无关联 Trace 时不显示组件（非空状态）

**边界条件：**
- Agent 分析尚未触发（无 Trace）时：组件不渲染
- 同一题/KP 有多次 Trace 时：显示最近一次 COMPLETED 的
- 学生只能看自己的 Trace summary
- 家长只能看自己家庭学生的 Trace summary

**性能要求：**
- latestForQuestion / latestForKnowledgePoint 查询 < 500ms
- 组件渲染不阻塞页面主体加载（条件渲染）
