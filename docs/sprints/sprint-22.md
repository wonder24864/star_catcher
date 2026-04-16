# Sprint 22: 学生画像 + Phase 4 验收 (Week 27)

**Status**: COMPLETED

**目标**: 模块 E — 学生画像可视化（US-070）+ Phase 4 全量验收。

## 用户故事

- US-070: 学生画像可视化 — 见 [child-friendly-ui.md](../user-stories/child-friendly-ui.md)

## 设计决策

Sprint 19 D24-D32、Sprint 20 D33-D38、Sprint 21 D39-D46 继续生效（见 [ADR-012](../adr/012-grade-adaptive-ui.md)）。Sprint 22 新增：

1. D47: Profile 导航：Sidebar 加入 profile 链接；BottomNav 不改 wonder/cosmic 白名单（尊重 D44）；mastery 页加"查看学习画像"上下文入口
2. D48: 进度图共享：提取 `historical-progress-chart.tsx` + tier 自适应配色（wonder 粉橙 / cosmic 青紫 / flow 绿灰 / studio 蓝灰）
3. D49: 旅程数据源：ErrorQuestion + MasteryState.masteredAt + InterventionHistory + HomeworkSession 四源并行查询 + JS 合并排序（MasteryState 是状态快照非事件日志）
4. D50: 仪表盘查询：`$queryRaw` GROUP BY + CASE WHEN，单次 DB 往返（匹配 mastery.stats 模式）
5. D51: 进度图数据：基线查询 + 期间每日增量 → TypeScript 累计曲线（比 generate_series 更简单可测试）
6. D52: 空状态：每段独立空状态 + tier 友好文案（wonder"还没有记录哦～"而非"No data"）

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 195 | [x] Sprint 22 文件 + US-070 确认 | `docs/sprints/sprint-22.md` |
| 196 | [x] profileRouter: learningJourney + masteryDashboard + historicalProgress | `src/server/routers/profile.ts` + `_app.ts` 注册 |
| 197 | [x] HistoricalProgressChart 共享组件（tier 自适应配色） | `src/components/profile/historical-progress-chart.tsx` |
| 198 | [x] /student/profile 页面（掌握仪表盘 + 进度图 + 学习旅程时间线） | `src/app/[locale]/(dashboard)/student/profile/page.tsx` |
| 199 | [x] /mastery 页面增加进度折线图 + "查看学习画像" 入口 | 编辑 `mastery/page.tsx` |
| 200 | [x] 导航集成（Sidebar + BottomNav） | 编辑 `sidebar.tsx` + `bottom-nav.tsx` |
| 201 | [x] i18n: learningProfile 命名空间 + tierText.wonder/cosmic.learningProfile | 编辑 `zh.json` + `en.json` |
| 202 | [x] profile-router 单测 | `src/tests/unit/profile-router.test.ts` |
| 203 | [x] Phase 4 验收（tsc + build + test + 验证清单） | 验证通过 |
| 204 | [x] 自审 + 文档同步 | ROADMAP + README + Sprint 文件勾选 + ADR-012 追加 + commit |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
- [x] `npm test` 全量通过（78 files, 1075 passed, 30 todo, 0 failed）
- [x] Profile 页 STUDENT 角色可访问
- [x] Profile 页 PARENT 可查看子女
- [x] PARENT 拒绝非关联学生 (FORBIDDEN)
- [x] 掌握度仪表盘按科目分组 + AdaptiveProgress 进度
- [x] 仪表盘网格 tier 分支：wonder/cosmic=2col, flow/studio=3col
- [x] 历史进度图 30d/90d 切换，累计曲线
- [x] 进度图 tier 配色正确
- [x] 学习旅程时间线 stagger 入场
- [x] 时间线 tier 分支视觉（wonder emoji / cosmic glow / flow line / studio compact）
- [x] 空状态 tier 友好文案
- [x] i18n: zh + en 完整覆盖
- [x] tierText.wonder/cosmic.learningProfile 友好文案
- [x] 进度图同时出现在 profile 页和 mastery 页
- [x] mastery 页"查看学习画像"按钮
- [x] Sidebar: profile 链接对 flow/studio 可见
- [x] BottomNav: wonder 仍 3 tab, cosmic 仍 4 tab（profile 在白名单外自动过滤）
- [x] 无 `any` / `ts-ignore`
- [x] 未使用声明溯源 (Rule 8) — CardHeader/CardTitle 无用导入已删除；EVENT_EMOJI 中 CORRECTED 为设计信号保留（待 Phase 5 MasteryState 历史追踪）
- [x] 家长/管理员始终 studio tier
