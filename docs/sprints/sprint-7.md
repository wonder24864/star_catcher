# Sprint 7: Mastery Tracking + 间隔复习 (Week 11)

## 目标

基于 Sprint 6 交付的 Student Memory 状态机和掌握地图，实现 SM-2 间隔复习算法、自动状态转换、复习提交流程和复习通知 UI，完成学习闭环的复习阶段。

## 用户故事范围

- US-038: 间隔复习调度 — SM-2 算法 + 自动状态转换（CORRECTED→REVIEWING, REGRESSED→REVIEWING）
- US-039: 复习任务通知 — 学生首页 Today's Reviews widget + 掌握地图 Overdue 增强
- US-040: 掌握度评估 — 复习对话框 + submitReview + SM-2 更新

## 任务清单

### Week 11

- [x] 65. US-038~040 用户故事 + Sprint 文件
  - 用户故事文档 `docs/user-stories/mastery-review.md`
  - Sprint 文件 `docs/sprints/sprint-7.md`
  - 更新 `docs/user-stories/_index.md` 和 `docs/ROADMAP.md`
  - 产出：文档

- [x] 66. SM-2 算法实现
  - 纯函数 `src/lib/domain/spaced-repetition/sm2.ts`
  - calculateSM2 + mapQuality 函数
  - SM-2 公式：EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))，EF floor 1.3
  - 产出：sm2.ts + index.ts + 单元测试

- [x] 67. Memory 层复习集成（核心）
  - 增强 scheduleReview：持久化 easeFactor + consecutiveCorrect
  - 新增 processReviewResult：SM-2 计算 + ReviewSchedule 更新 + 状态转换
  - updateMasteryState 新增 handleAutoTransitions（best-effort）
  - 产出：Memory 层增强 + 单元测试

- [x] 68. Mastery Router 复习接口
  - todayReviews / submitReview / reviewDetail tRPC procedures
  - list query 增加 ReviewSchedule nextReviewAt
  - 产出：router 代码 + 单元测试

- [x] 69. 学生首页 — 今日复习 Widget
  - Dashboard page 增加 TodayReviews 组件
  - STUDENT/PARENT 角色适配 + 空状态
  - i18n dashboard namespace
  - 产出：组件 + i18n

- [x] 70. 复习对话框 UI
  - ReviewDialog 组件（KP 素材 + 自评表单 + 结果反馈）
  - 掌握地图页集成 + URL query 深链
  - i18n mastery.review namespace
  - 产出：组件 + 页面集成 + i18n

- [x] 71. 掌握地图增强
  - 卡片 nextReviewAt + Overdue 徽章 + Start Review 按钮
  - OVERDUE 筛选条件 + Stats Overdue 计数
  - 产出：页面增强 + i18n

- [x] 72. Sprint 7 验证 + 自审
  - npm test + tsc --noEmit
  - 验证清单逐项检查
  - 更新 ROADMAP.md
  - 产出：验证报告

## 验证清单

- [x] SM-2 算法纯函数有完整单测覆盖（EF floor 1.3, quality 0-5, interval 递增）
- [x] CORRECTED 后自动转 REVIEWING + 首次复习调度（interval=1）
- [x] MASTERED→REGRESSED 后自动转 REVIEWING + 重新调度
- [x] processReviewResult 答对：更新 ReviewSchedule（SM-2 公式）
- [x] processReviewResult 答对 consecutiveCorrect≥3：REVIEWING → MASTERED
- [x] processReviewResult 答错：REVIEWING → REGRESSED → REVIEWING + interval=1
- [x] 所有状态转换记录 InterventionHistory（type=REVIEW）
- [x] MasteryState 并发更新受乐观锁保护
- [x] scheduleReview 持久化 easeFactor + consecutiveCorrect
- [x] todayReviews tRPC 返回到期 KP + 知识点详情
- [x] submitReview tRPC 权限：STUDENT only
- [x] submitReview 校验 KP 当前状态为 REVIEWING
- [x] list query 包含 nextReviewAt 字段
- [x] 首页 Today's Reviews widget 正常展示 + 空状态
- [x] 复习对话框：自评提交 → 反馈（MASTERED/REVIEWING/REGRESSED）
- [x] 掌握地图：nextReviewAt 显示 + Overdue 徽章 + Start Review 按钮
- [x] 所有用户可见字符串使用 i18n key
- [x] npm test 通过 + tsc --noEmit 无错误

## 关键设计决策

| # | 决策 | 方案 | 原因 |
|---|------|------|------|
| D1 | SM-2 不走 Harness | 纯函数 sm2.ts | 确定性数学公式，不需要 AI 调用 |
| D2 | 自动转换位置 | Memory 层 handleAutoTransitions | ADR-010 单一网关原则 |
| D3 | 自动转换策略 | best-effort + try-catch | 失败不影响显式转换，CORRECTED 是合法中间态 |
| D4 | 返回值语义 | 返回显式转换结果 | 不破坏现有测试和调用者预期 |
| D5 | Quality 来源 | 学生自评 (isCorrect + difficulty 1-5) | 无需 AI 评分，简单有效 |
| D6 | Review UI | 掌握地图内 Dialog | 与现有 detail dialog 一致 |
| D7 | Prisma | 无 migration | ReviewSchedule SM-2 字段 Sprint 4b 已预留 |

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过
- `npm test` 通过（含新增测试）
- `tsc --noEmit` 无错误
- i18n 中英双语覆盖
- ROADMAP.md Sprint 7 状态更新
