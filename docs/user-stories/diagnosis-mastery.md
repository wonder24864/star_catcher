# Diagnosis Agent + Student Mastery 用户故事

## US-035: Diagnosis Agent

**As a** 系统（自动触发）
**I want to** 在题目完成知识点映射后，自动分析学生的错题模式并结合知识图谱诊断薄弱知识点
**So that** 学生和家长能看到精准的薄弱知识点定位，而不是简单的对错统计

**验收标准：**
- [ ] Question Understanding Agent 完成后自动链式触发 Diagnosis Agent
- [ ] Agent 读取当前题目关联的知识点 + 该学生在这些知识点上的历史错题（最近 30 天 Real-time 分析）
- [ ] Agent 调用 AI 诊断错误模式（概念混淆/计算错误/方法不当/粗心等）
- [ ] 诊断结果通过 Memory 层写入 InterventionHistory（type = DIAGNOSIS）
- [ ] 对于新发现的薄弱知识点，自动创建 MasteryState（status = NEW_ERROR）
- [ ] 已 MASTERED 的知识点再次出错时，触发 REGRESSED 转换
- [ ] Agent Trace 完整记录每步推理和 Skill 调用

**边界条件：**
- 知识点映射为空时：Agent 跳过诊断，记录 "no_knowledge_mappings"
- 该知识点已有 MASTERED 状态时：触发 MASTERED → REGRESSED 转换
- 学生无历史错题时：仅分析当前错题，不做模式分析
- 同一 ErrorQuestion 不重复诊断（幂等检查）

**性能要求：**
- Agent 从触发到完成：< 20s（典型场景 3-5 步循环）
- 不阻塞学生端响应（异步 BullMQ Job）

---

### Agent 专属字段

**Skill 依赖**:
| Skill | 用途 |
|-------|------|
| diagnose-error | AI 分析错题错误模式和知识盲区 |
| search-knowledge-points | 搜索相关知识点及其前置依赖关系 |

**Agent 循环终止条件**:
- 最大步数: 6
- 决策停止条件: Agent 已完成所有关联知识点的诊断，并写入诊断记录
- Token 预算: 12000 tokens

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| diagnose-error 失败 | 基于错题对错记录进行规则诊断（错同一知识点 ≥ 2 次 = 薄弱） |
| search-knowledge-points 失败 | 使用已有 QuestionKnowledgeMapping 数据，跳过前置关系分析 |
| 全部 Skill 不可用 | 标记 Job FAILED，BullMQ retry |

**成本约束**:
- 单次 Agent 会话 Token 上限: 12000
- 每日用户 Agent 调用上限: 100 次/学生

---

## US-036: 薄弱知识点报告

**As a** 学生/家长
**I want to** 查看知识点掌握状态地图，一眼看到哪些知识点是薄弱的
**So that** 能有针对性地复习薄弱环节

**验收标准：**
- [ ] 学生端新增"掌握地图"页面（/mastery）
- [ ] 按学科分组显示知识点列表，每个知识点标注状态色标（NEW_ERROR=红、CORRECTED=橙、REVIEWING=蓝、MASTERED=绿、REGRESSED=紫）
- [ ] 点击知识点展开详情：错题数、正确率、最近错题时间、干预历史
- [ ] 家长可通过 family 权限查看子女的掌握地图
- [ ] 支持按学科/状态筛选
- [ ] 顶部统计摘要条：N 个薄弱 / N 个已掌握 / N 个新错

**边界条件：**
- 无 MasteryState 记录时：显示空状态提示"还没有学习记录"
- 知识点较多时：分页加载（每页 50 个）
- 家长查看时：需验证 family 关系

**性能要求：**
- 页面加载 < 2s
- 筛选响应 < 500ms

---

## US-037: 学生学习状态追踪

**As a** 系统
**I want to** 在检查流程的关键节点自动创建和更新知识点掌握状态
**So that** 掌握度数据始终与学生的实际学习进度同步

**验收标准：**
- [ ] CheckSession COMPLETED 且错题关联知识点时：Diagnosis Agent 自动创建 MasteryState（NEW_ERROR）
- [ ] 已有 MASTERED 的知识点再次出错时：自动转换为 REGRESSED
- [ ] 学生在改正流程中答对时：转换为 CORRECTED
- [ ] 状态变更均通过 Memory 层（遵循 ADR-010 状态机规则）
- [ ] 所有状态变更记录在 InterventionHistory（审计链）

**边界条件：**
- 知识点映射尚未完成时（QUA 还在跑）：跳过状态创建，等 Diagnosis Agent 处理
- 同一知识点多题出错：MasteryState 只创建一次，但 totalAttempts 递增
- 并发更新同一知识点：乐观锁保护（version 字段）
- MasteryState 不存在时 submitCorrections 的 CORRECTED 转换优雅跳过（null check）
