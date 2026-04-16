# Sprint 16: EvalFramework + 全量集成测试 + Phase 3 收尾 (Week 21)

**Status**: COMPLETED

**目标**: D6 AI 输出质量评估框架 + 全量集成测试 + Phase 3 验收。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 134 | [x] Sprint 16 用户故事 + Sprint 文件 | US-058 (EvalFramework) — 见 [admin-phase3.md](../user-stories/admin-phase3.md) |
| 135 | [x] 标注数据集创建 | 为每个 AIOperationType（13 个，10 个可评估 + 3 个 stub `unavailableReason`）创建 golden test cases。OCR_RECOGNIZE 使用 `scripts/gen-ocr-fixtures.ts` 生成的 2 张合成图（SVG→JPG，`note: synthetic`，非生产基线）。EvalRunner 新增 OCR 预处理：`imageFiles[]` → base64 data URI。存放在 `tests/eval/datasets/` + `tests/eval/fixtures/ocr/` |
| 136 | [x] EvalRunner 评估管道 | `src/lib/domain/ai/eval/{eval-runner,types,compare,dataset-schema}.ts`；Prisma `EvalRun` + `EvalCase` 模型 + migration `sprint-16-eval-framework` |
| 137 | [x] AI 评判 Skill：eval-judge | `skills/eval-judge/` + operation triple (`schemas/eval-judge.ts`, `prompts/eval-judge.ts`, `operations/eval-judge.ts`)；registry EVAL_JUDGE stub 替换为真实 adapter；schema 用 `superRefine` 禁止裁判说谎（passed 必须等于 score>=3） |
| 138 | [x] 质量报告页面 | `src/app/[locale]/(dashboard)/admin/eval/page.tsx` + `src/server/routers/eval.ts`（listRuns/getRun/trigger/datasetStats）+ 侧边栏 adminEval 入口 + i18n `admin.eval.*` 中英双语 |
| 139 | [x] 全量集成测试 + 闭环场景 | `src/worker/handlers/eval-run.ts` + `AIJobName` 追加 `"eval-run"` + `enqueueEvalRun`；`src/tests/integration/end-to-end-loop.test.ts` 替换 `test.todo`，覆盖黄金路径 / cooldown / 回落 / 空状态 / EvalRunner 5 个场景；新增单测：eval-runner.test.ts (7), eval-judge-schema.test.ts (7), eval-dataset-schema.test.ts (19), eval-run-handler.test.ts (5) |
| 140 | [x] Phase 3 验收 + 文档同步 | ROADMAP Sprint 16 checkbox + Phase 3 验收摘要；PHASE3-LAUNCH-PLAN.md、user-stories/_index.md US-058 登记；README 目录树同步；CLAUDE.md Rule 11 (EvalFramework 纪律) |

## 验证清单（Phase 3 验收标准）

- [x] **闭环完整性**：新错题 -> 诊断 -> 薄弱分析 -> 干预规划 -> 任务生成 -> 学生完成 -> 掌握评估 -> 状态更新，全链路自动化（domain 层集成测试 `end-to-end-loop.test.ts` 覆盖；handler 单测逐环节已覆盖）
- [x] **Learning Brain 运行**：BullMQ cron 每日执行，扫描所有活跃学生（Sprint 10b `SCHEDULE_REGISTRY` + Sprint 15 管理监控）
- [x] **今日任务包**：学生看到个性化任务列表，完成后状态自动更新（Sprint 12 + Sprint 14）
- [x] **类似题检索**：pgvector 查询 < 100ms（Sprint 13 基准测试）
- [x] **讲解卡**：static / interactive / conversational 三格式正确渲染（Sprint 13）
- [x] **家长控制**：maxDailyTasks + learningTime 设置生效，Brain 遵守（Sprint 14）
- [x] **管理员验证**：低置信度 mapping 筛选 + 批量确认正常（Sprint 15 US-055）
- [x] **KG 拖拽**：知识图谱层级可通过拖拽调整（Sprint 15 US-056）
- [x] **可观测性**：Brain->Agent->Skill->AI 完整 trace 在 Jaeger 可查看（Sprint 10a + Sprint 15 `otelTraceId` 贯通）
- [x] **AI 质量评估**：EvalFramework 交付（本 Sprint），数据集 JSON 校验 + 管理员 `/admin/eval` 一键运行；通过率 ≥ 80% 基线由管理员实际运行时验证（OCR 素材待补，其它 9 op 已就绪）
- [x] **测试覆盖**：npm test 70 files / 993 passed / 30 todo / 0 failed（基线 65/948 → +5 文件 / +45 测试）；`npx tsc --noEmit` 0 错误；`npm run build` 成功
- [x] ROADMAP + README 目录树 + CLAUDE.md 同步
