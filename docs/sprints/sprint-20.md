# Sprint 20: 任务页 + 批改页年级自适应改造 (Week 25)

**Status**: COMPLETED

**目标**: 模块 D(上) — 将 Sprint 19 的年级自适应动画基础设施落地到任务页 + 批改页两个核心学生工作流。

## 用户故事

- US-068: 任务页 + 批改页年级自适应改造 — 见 [child-friendly-ui.md](../user-stories/child-friendly-ui.md)

## 设计决策

Sprint 19 D24-D32 继续生效（见 [ADR-012](../adr/012-grade-adaptive-ui.md)）。Sprint 20 新增：

1. D33: 新组件统一 `Adaptive*` 前缀（与 Sprint 19 AdaptiveCard/AdaptiveProgress 一致）
2. D34: `useTierTranslations()` hook — `useTranslations()` 的 drop-in 替换，`t.has()` 查 `tierText.{tier}.{key}` 后回退
3. D35: 布局用 tier-conditional className（ternary 切换 space-y / grid-cols）
4. D36: stagger 入场用 `motion.div` + `delay: index * 0.06`
5. D37: 任务完成 micro-animation 用 framer-motion `scale + opacity + pathLength`
6. D38: 提交过渡是同页脉冲而非跨页动画（Results 页 invalidate 后同页刷新）

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 173 | [x] Sprint 20 文件 + 用户故事确认 | `docs/sprints/sprint-20.md` |
| 174 | [x] AdaptiveButton 组件 | `src/components/adaptive/adaptive-button.tsx` + 测试 |
| 175 | [x] AdaptiveScore 组件 | `src/components/adaptive/adaptive-score.tsx` + 测试 |
| 176 | [x] AdaptiveSubjectBadge 组件 | `src/components/adaptive/adaptive-subject-badge.tsx` + 测试 |
| 177 | [x] 任务页改造 | `tasks/page.tsx` + `task-card.tsx` 年级自适应 |
| 178 | [x] PracticeDialog + ExplanationDialog + ExplanationCard 改造 | 对话框组件年级自适应 |
| 179 | [x] Check 三页改造 (session list + upload + OCR review) | `check/page.tsx` + `check/new/page.tsx` + `check/[sessionId]/page.tsx` |
| 180 | [x] Results 页改造 (642行 — 最复杂) | `check/[sessionId]/results/page.tsx` 年级自适应 |
| 181 | [x] 低年级友好 i18n | `useTierTranslations` hook + tierText JSON + 组件接入 |
| 182 | [x] 测试 + 构建验证 | tsc + build + test 全通过 |
| 183 | [x] 自审 + 文档同步 | ROADMAP + README + Sprint 文件勾选 + commit |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
- [x] `npm test` 全量通过（含新增测试）
- [x] AdaptiveButton: wonder 弹性缩放 / cosmic 发光 / flow 微浮起 / studio 直通
- [x] AdaptiveScore: wonder 弹跳计数 / cosmic 全息投影 / flow 翻转 / studio 精确数字
- [x] AdaptiveSubjectBadge: 4 tier × 3+ 学科 色板切换
- [x] 任务列表布局：P1-3 单列 / P4-6 双列 / 初中+ 紧凑
- [x] 任务列表 stagger 入场动画
- [x] 任务完成 micro-animation + Celebration 触发
- [x] AdaptiveProgress 替代原进度条
- [x] 批改分数用 AdaptiveScore 展示
- [x] 求助按钮 AdaptiveButton 适配
- [x] P1-3 更大输入框 + 更大字体（Textarea/Input）
- [x] SubjectBadge 年级自适应颜色
- [x] 低年级友好 i18n（wonder: "做完啦！帮帮我 我懂了！"）
- [x] useTierTranslations hook 正确 fallback
- [x] 家长/管理员始终 studio tier
- [x] i18n 完整覆盖 zh + en
- [x] 无 `any` 类型
- [x] 无 `ts-ignore` / `ts-expect-error`
- [x] 未使用声明溯源（Rule 8）
