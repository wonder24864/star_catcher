# Question Understanding Agent 用户故事

## US-033: Question Understanding Agent

**As a** 系统（自动触发）
**I want to** 在学生完成错题检查后，自动分析题目涉及的知识点并建立映射关系
**So that** 后续 Diagnosis Agent 能基于知识图谱进行薄弱知识点分析

**验收标准：**
- [ ] 完成检查（CheckSession 状态 → COMPLETED）时自动触发 Question Understanding Agent
- [ ] Agent 分析题目文本 + 学科 + 年级，输出关联知识点列表（含置信度）
- [ ] 输出写入 QuestionKnowledgeMapping 表（mappingSource = AI_DETECTED）
- [ ] 置信度 ≥ 0.8 的映射自动激活；0.5-0.8 标记为待确认
- [ ] Agent Trace 完整记录分析过程（每步的 tool call + 推理）
- [ ] 管理员可在错题详情页看到知识点映射，并确认/修改（AI_DETECTED → ADMIN_VERIFIED）

**边界条件：**
- 知识图谱为空时：Agent 跳过分析，记录日志"无可用知识点数据"
- 题目文本为空/图片题无 OCR 文本时：使用题目元信息（学科+年级）做粗粒度映射
- 同一题目重复提交时：不重复分析（幂等，检查已有 mapping）
- 映射结果为空（未匹配到知识点）：记录 mapping 为空，不报错

**性能要求：**
- Agent 从触发到完成：< 15s（典型场景 3 步循环）
- 不阻塞学生端响应（异步 BullMQ Job）

---

### Agent 专属字段

**Skill 依赖**:
| Skill | 用途 |
|-------|------|
| search-knowledge-points | 根据关键词/学科/年级搜索候选知识点 |
| classify-question-knowledge | 判断题目与候选知识点的关联度（返回置信度） |

**Agent 循环终止条件**:
- 最大步数: 5
- 决策停止条件: Agent 已为当前题目确定 1-5 个置信度 ≥ 0.5 的知识点映射
- Token 预算: 8000 tokens

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| search-knowledge-points 失败 | 使用题目学科+年级做树形遍历获取候选知识点（DB 查询降级） |
| classify-question-knowledge 失败 | 用搜索结果的排名作为置信度估计（top-1 = 0.9, top-2 = 0.7, etc.） |
| 全部 Skill 不可用 | 标记该 Job 为 FAILED，等服务恢复后重试（BullMQ retry） |

**成本约束**:
- 单次 Agent 会话 Token 上限: 10000
- 每日用户 Agent 调用上限: 100 次 / 学生
