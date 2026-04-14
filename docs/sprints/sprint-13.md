# Sprint 13: 类似题检索 + 讲解卡 (Week 18)

**Status**: DRAFT

**目标**: 类似题推荐 + 多格式讲解卡，丰富任务包内容质量。覆盖 REQUIREMENTS S11 讲解卡三格式 + 渐进展示增强。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 114 | Sprint 13 用户故事 + Sprint 文件 | US-051 (类似题检索)、US-052 (讲解卡 + 渐进展示增强) |
| 115 | find-similar-questions Skill | `skills/find-similar-questions/`：双路检索 — KP 维度（同 KP 其他错题）+ pgvector cosine similarity on ErrorQuestion.embedding |
| 116 | ErrorQuestion embedding 生成 | BullMQ 后台任务：新错题入库后异步生成 embedding（text-embedding-3-small），写入 ErrorQuestion.embedding |
| 117 | generate-explanation-card Skill | `skills/generate-explanation-card/`：AI 生成讲解卡（static / interactive / conversational 三种格式） |
| 118 | 讲解卡 UI 组件 | `src/components/explanation-card.tsx`：StaticCard（Markdown + KaTeX）、InteractiveCard（分步展开+答题）、ConversationalCard（对话 Q&A） |
| 119 | 类似题展示 + 练习流程 | PRACTICE 卡片：展示类似题 -> 学生作答 -> AI 判分 -> 更新 MasteryState |
| 120 | Sprint 13 集成验证 | 类似题端到端（embedding 生成 -> pgvector 查询 -> 展示），讲解卡三格式渲染。npm test + tsc --noEmit |

## 设计要点

- ErrorQuestion 新增 `embedding` 列（`Unsupported("vector(1536)")?`）。DB schema 见 `docs/phase3-db-schema.md`
- 双路检索合并去重：(1) 知识点维度 — 同 KP 下其他错题；(2) 内容维度 — pgvector cosine on embedding。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D15
- 讲解卡格式由 AI 自动选：小学低年级默认 interactive，高中默认 static。设计决策见 §四 D16
- ExplanationCard: `{ format: 'static'|'interactive'|'conversational', title, steps: Array<{content, question?, expectedAnswer?}>, metadata }`

## 验证清单

- [ ] find-similar-questions Skill 双路检索端到端
- [ ] embedding 异步生成 BullMQ 任务正常
- [ ] pgvector cosine 查询 < 100ms
- [ ] 讲解卡三格式渲染正确（StaticCard / InteractiveCard / ConversationalCard）
- [ ] 类似题练习流程：作答 -> 判分 -> MasteryState 更新
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] i18n 新增 key 覆盖 zh + en
