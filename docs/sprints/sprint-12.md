# Sprint 12: 干预规划 Agent + 今日任务包 (Week 17)

**Status**: DRAFT

**目标**: Intervention Planning Agent + Daily Task 数据模型 + 学生任务 UI。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 107 | Sprint 12 用户故事 + Sprint 文件 | US-049 (干预规划 Agent)、US-050 (今日任务包) |
| 108 | Intervention Planning Agent 定义 | `src/lib/domain/agent/definitions/intervention-planning.ts`：allowedSkills (weakness_profile, search_knowledge_points, generate_daily_tasks), maxSteps: 8, memoryWriteManifest: ["logIntervention"] |
| 109 | generate-daily-tasks Skill | `skills/generate-daily-tasks/`：根据薄弱分析 + 复习调度 + 家长 maxDailyTasks，AI 生成任务列表（REVIEW / PRACTICE / EXPLANATION） |
| 110 | Daily Task Router + API | `src/server/routers/daily-task.ts`：todayTasks / completeTask / taskHistory。STUDENT + PARENT 权限 |
| 111 | 今日任务包 UI | `src/app/[locale]/(dashboard)/tasks/page.tsx`：TaskCard 列表（三种卡片样式）+ 完成打勾 + 进度条 |
| 112 | intervention-planning BullMQ handler | `src/worker/handlers/intervention-planning.ts`：JOB_HANDLERS 注册 -> 运行 Agent -> 结果写入 DailyTaskPack + DailyTask |
| 113 | Sprint 12 集成验证 | Brain -> Intervention Agent -> DailyTask 写入 -> 学生 API 读取，端到端。npm test + tsc --noEmit |

## 设计要点

- DailyTaskPack/DailyTask DB schema 见 `docs/phase3-db-schema.md`
- Brain cron 时读取 `ParentStudentConfig.maxDailyTasks`，传给 Agent 作为约束
- Agent 不直接写 DailyTask — Agent 输出任务计划 JSON，handler 代码解析后写入 DB。设计决策见 PHASE3-LAUNCH-PLAN.md §六 D14/D17

## 验证清单

- [ ] Intervention Planning Agent 定义完整（allowedSkills + memoryWriteManifest + termination）
- [ ] generate-daily-tasks Skill 注册 ACTIVE
- [ ] DailyTask Router RBAC：STUDENT 读/完成，PARENT 读，ADMIN 全部
- [ ] Brain -> Agent -> DailyTask 端到端
- [ ] 今日任务包 UI 三种卡片渲染
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] i18n 新增 key 覆盖 zh + en
