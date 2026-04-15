# 类似题检索 + 讲解卡 用户故事

## US-051: 类似题检索

**As a** 学生
**I want to** 在练习任务（PRACTICE）中看到与原错题相关的类似题，动手再做一次
**So that** 能在同一知识点的新情境下巩固，而不是机械地重复原题

**验收标准：**
- [ ] ErrorQuestion 入库后异步生成 pgvector embedding（text-embedding-3-small / 1536 维）
- [ ] 双路检索：知识点维度（同 KP 其他错题）+ 内容维度（pgvector cosine similarity on embedding）
- [ ] 合并去重（KP 优先），最多返回 `limit` 条（默认 5）
- [ ] 不暴露其他学生的 studentAnswer，仅返回 `{id, content, correctAnswer}`
- [ ] `find_similar_questions` Skill 作为 Agent 可调用的封装（Sprint 13 内无 Agent 调用，供后续阶段复用）
- [ ] `findSimilarQuestions(db, params)` 纯函数作为 tRPC `startTask` 的唯一实现入口

**边界条件：**
- target ErrorQuestion 无 embedding（异步未完成）：仅 KP 维度返回
- 同 KP 下错题不足：允许少于 limit
- 跨学生检索：类似题可来源任意学生的 ErrorQuestion（题目内容本身不含隐私），但不附带其他学生答题记录

**性能要求：**
- 单次双路检索 < 100ms（在 100+ ErrorQuestion 规模下）
- embedding 生成异步不阻塞错题入库

---

### Skill 专属字段

**Skill 入参**:
| 参数 | 类型 | 说明 |
|------|------|------|
| errorQuestionId | string | 原错题 ID（检索目标 + 排除自身） |
| knowledgePointId | string | 知识点 ID（第一路过滤） |
| limit | number? | 默认 5 |

**Skill 输出**:
```ts
{ similar: Array<{ id: string; content: string; source: "KP" | "EMBEDDING"; similarity?: number }> }
```

**AI 调用**: 无 —— 纯确定性查询（Skill 仅做 IPC 封装，实际查询由 `findSimilarQuestions` 纯函数完成）

**Skill 失败恢复**: target embedding 不存在 → 仅 KP 路；Redis/DB 不可用 → throw（BullMQ 或调用方处理）

---

## US-052: 讲解卡三格式

**As a** 学生
**I want to** 在讲解任务（EXPLANATION）中看到按我的年级和错因定制的讲解内容
**So that** 理解概念而不是只看答案 —— 低年级看得懂交互分步，高年级能读推导，被误导时能跟对话纠偏

**验收标准：**
- [ ] `generate-explanation-card` Skill 调用 `GENERATE_EXPLANATION` AI operation 生成结构化讲解卡
- [ ] 格式自动选择规则：
  - K1–K6（小学低年级）：默认 `interactive`（分步展开 + 每步小问答）
  - K10–K12（高中）：默认 `static`（完整推导 + Markdown + KaTeX）
  - 学生答案显示概念混淆时：强制 `conversational`（对话式纠偏）
  - 调用方可通过 `format` 参数覆盖自动选择
- [ ] 输出 JSON schema：`{ format, title, steps: [{content, question?, expectedAnswer?}], metadata: {targetGrade, difficulty} }`
- [ ] UI 三子组件：`StaticCard`（React-Markdown + remark-math + rehype-katex）、`InteractiveCard`（分步 + 就地校验）、`ConversationalCard`（Q&A 气泡）
- [ ] 讲解卡 lazy cache 进 `DailyTask.content.explanationCard`，同一任务重复打开不再触发 AI
- [ ] i18n：系统提示走英文模板 + `{{locale}}` 约束输出语言

**边界条件：**
- AI 输出不符合 Zod schema：`AIHarnessResult.success = false`，前端展示错误态
- ErrorQuestion.studentAnswer 为空：按 `format = "auto"` 走年级规则
- 讲解卡首次生成失败：SemanticCache miss，下次重试

**性能要求：**
- 首次生成 < 8s（AI 生成讲解通常 2–5s）
- 二次打开 < 200ms（读 DailyTask.content）

---

### Skill 专属字段

**Skill 入参**:
| 参数 | 类型 | 说明 |
|------|------|------|
| errorQuestionId | string | 错题 ID |
| knowledgePointId | string | 知识点 ID |
| format | "auto" \| "static" \| "interactive" \| "conversational"? | 默认 "auto" |

**AI 调用**: `GENERATE_EXPLANATION` operation（走 Harness 管道）

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| AI 返回非法 JSON / schema 不符 | 直接 throw，前端显示"讲解生成失败，请稍后重试" |
| Azure OpenAI 限流 | Harness 层重试 |

**成本约束**:
- 单次讲解生成 Token 上限: 由 GENERATE_EXPLANATION prompt 模板控制
- 每任务仅生成一次（lazy cache）

---

## Router RBAC（daily-task 扩展）

| 端点 | STUDENT | PARENT | ADMIN |
|------|---------|--------|-------|
| startTask | 读自己 | 读孩子 | 读任意 |
| submitPracticeAnswer | 提交自己 | — | — |
| completeTask（现有） | 完成自己 | — | — |
