# Sprint 21: 错题本 + 掌握度 + 导航全面改造 (Week 26)

**Status**: COMPLETED

**目标**: 模块 D(下) — 将 Sprint 19 的年级自适应动画基础设施落地到错题本、掌握度、导航三个核心学生区域。

## 用户故事

- US-069: 错题本 + 掌握度 + 导航年级自适应改造 — 见 [child-friendly-ui.md](../user-stories/child-friendly-ui.md)

## 设计决策

Sprint 19 D24-D32、Sprint 20 D33-D38 继续生效（见 [ADR-012](../adr/012-grade-adaptive-ui.md)）。Sprint 21 新增：

1. D39: Sidebar 用 `TierSidebar` 客户端包装组件（layout.tsx 是 Server Component），wonder/cosmic 隐藏 sidebar，flow/studio 在 md+ 显示
2. D40: 错题详情 wonder tier 错答颜色从 `text-red-600` 软化为 `text-amber-600`
3. D41: 掌握度网格列数 tier 分支：wonder=单列 / cosmic=两列 / flow+studio=三列
4. D42: ReviewDialog Adaptive 组件替换 + 掌握时触发 Celebration 庆祝
5. D43: Wonder tier 错题列表隐藏日期筛选器，降低低年级认知负担
6. D44: BottomNav 桌面端 wonder/cosmic 可见（不加 `md:hidden`），配合 CSS padding 适配，确保无 sidebar 时仍有导航
7. D45: 统计卡数字保留语义色彩（红/绿/橙），不使用 AdaptiveScore（为分数展示设计，不适合语义计数）
8. D46: Stagger 动画上限 `Math.min(index, 15) * 0.06`，防止大列表动画时间过长

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 184 | [x] Sprint 21 文件 + US-069 确认 | `docs/sprints/sprint-21.md` |
| 185 | [x] 导航系统 tier 全面适配 | `tier-sidebar.tsx` 新建 + `layout.tsx` 集成 + `bottom-nav.tsx` 桌面端条件可见 + `globals.css` padding 适配 |
| 186 | [x] 错题列表页改造 | `errors/page.tsx`: AdaptiveCard/Button/SubjectBadge + tier 布局 + stagger 动画 + wonder 简化筛选 |
| 187 | [x] 错题详情页改造 | `errors/[id]/page.tsx`: AdaptiveCard/Button/SubjectBadge + wonder 温柔配色 |
| 188 | [x] 掌握度页上半：统计卡 + 筛选器 | `mastery/page.tsx`: AdaptiveCard 包装 stats + AdaptiveButton 替换 filters |
| 189 | [x] 掌握度页下半：KP 网格 + 详情对话框 | `mastery/page.tsx`: tier 分支网格 + AdaptiveCard/Progress + stagger 动画(上限) |
| 190 | [x] ReviewDialog 改造 | `review-dialog.tsx`: AdaptiveCard/Button + wonder 温柔配色 + Celebration 掌握庆祝 |
| 191 | [x] 错题 + 掌握度 tier i18n | zh.json/en.json `tierText.wonder.errors.*` + `tierText.wonder.mastery.*` |
| 192 | [x] 全局 i18n 审计 | 所有改造页面 `useTierTranslations` 替换 + zh/en 完整覆盖检查 + base `errors` namespace 补全 |
| 193 | [x] 测试 + 构建验证 | TierSidebar 测试 + tsc + build + test 全通过 |
| 194 | [x] 自审 + 文档同步 | ROADMAP + README + Sprint 文件勾选 + commit |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
- [x] `npm test` 全量通过（77 files, 1060 passed, 30 todo, 0 failed）
- [x] TierSidebar: wonder/cosmic 桌面端无 sidebar
- [x] TierSidebar: flow/studio 桌面端有 sidebar
- [x] BottomNav: wonder/cosmic 桌面端仍可见（不被 md:hidden 隐藏）
- [x] BottomNav: flow/studio 桌面端隐藏（有 sidebar 替代）
- [x] Main 底部留白: wonder/cosmic 桌面端 pb-20
- [x] 错题列表: wonder=单列大卡, cosmic+=紧凑列表
- [x] 错题列表: wonder 隐藏日期筛选器
- [x] 错题列表: AdaptiveCard + AdaptiveSubjectBadge + AdaptiveButton
- [x] 错题列表: stagger 入场动画
- [x] 错题详情: wonder 错答 amber 非 red
- [x] 错题详情: AdaptiveCard + AdaptiveSubjectBadge + AdaptiveButton
- [x] 掌握度统计卡: AdaptiveCard 包装（保留语义色彩）
- [x] 掌握度筛选: AdaptiveButton
- [x] 掌握度网格: wonder=1col / cosmic=2col / flow+studio=3col
- [x] 掌握度 KP 卡: AdaptiveCard + AdaptiveProgress
- [x] 掌握度网格 stagger 动画（上限 15）
- [x] ReviewDialog: AdaptiveCard + AdaptiveButton + wonder 温柔配色
- [x] ReviewDialog: 掌握时触发 Celebration
- [x] useTierTranslations 全面替换
- [x] tierText.wonder.errors.* / mastery.* 友好 i18n (zh + en)
- [x] 家长/管理员始终 studio tier
- [x] 无 `any` 类型
- [x] 无 `ts-ignore` / `ts-expect-error`
- [x] 未使用声明溯源（Rule 8）— STATUS_COLORS 已删除（仅 STATUS_BADGE_STYLES 被使用）
