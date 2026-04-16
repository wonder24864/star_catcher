# Sprint 19: 动画系统基础设施 + 年级自适应组件库 (Week 24)

**Status**: COMPLETED

**目标**: 模块 C — 4 级年级自适应体系（GradeTierProvider + framer-motion 页面过渡 + Lottie 基础设施 + Three.js 星空 + 自适应组件库）。

## 用户故事

- US-063: 年级自适应动画系统 — 见 [student-experience-phase4.md](../user-stories/student-experience-phase4.md)
- US-064: 年级自适应组件库 — 见 [student-experience-phase4.md](../user-stories/student-experience-phase4.md)

## 设计决策

D24-D32 正式记录在 [ADR-012](../adr/012-grade-adaptive-ui.md)。

核心自审修正：
1. 合并 GradeTierProvider + ThemeProvider 为单一 Provider（消除重复 session 读取）
2. 使用 `template.tsx` 做页面过渡（layout.tsx 不卸载 children，AnimatePresence exit 无法触发）
3. cosmic 深色背景 + 白色半透明卡片 + backdrop-blur（星空可见 + 内容可读）
4. celebration 简化为 confetti + ripple + toast（3 种复用，非 4 套独立实现）

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 161 | [x] Sprint 19 文件 + 用户故事 + ADR-012 | `docs/sprints/sprint-19.md`；US-063/064；`docs/adr/012-grade-adaptive-ui.md` |
| 162 | [x] 安装动画依赖 | `framer-motion` + `lottie-react` + `@react-three/fiber` + `@react-three/drei` + `three` + `@types/three` |
| 163 | [x] GradeTierProvider（替代 ThemeProvider） | `grade-tier-provider.tsx`（合并版：tier context + data-theme DOM）；layout.tsx 更新；旧 ThemeProvider 弃用 |
| 164 | [x] globals.css 4 级主题变量 | wonder/cosmic/flow/studio 4 套 CSS 变量；cosmic 深色背景 + 半透明卡片；touch-target 选择器更新 |
| 165 | [x] framer-motion 页面过渡 | `template.tsx`（AnimatePresence + 4 套过渡配置：scale-fade / slide-blur / spring-slide / fast-fade） |
| 166 | [x] Lottie 基础设施 | `lottie-animation.tsx`（auto fetch + fallback）；`public/lottie/{tier}/` 目录结构 |
| 167 | [x] Three.js 星空背景 | `star-field.tsx`（守卫 + lazy）+ `star-field-canvas.tsx`（Three.js 场景）；集成到 dashboard layout |
| 168 | [x] 庆祝动画组件 | `celebration.tsx`（confetti + energy-burst + ripple + toast，framer-motion 实现） |
| 169 | [x] 自适应 BottomNav | tier 白名单（wonder=3/cosmic=4/flow+studio=全部）；图标尺寸/标签/发光效果 per tier |
| 170 | [x] 自适应卡片 + 进度条 | `adaptive-card.tsx`（4 套样式）+ `adaptive-progress.tsx`（彩虹条/星座/环形/细线） |
| 171 | [x] i18n + 测试 + 构建验证 | tier.* i18n keys；common.completed；grade-tier-provider.test.ts (20 tests)；1041 passed / 0 failures |
| 172 | [x] 自审 + 文档同步 | ROADMAP + PHASE4-LAUNCH-PLAN + README 目录树 + Sprint 文件 |

## 验证清单

- [x] `npm install` 成功，新依赖版本锁定
- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
- [x] `npm test` 全量通过 (73 files, 1041 passed, 0 failures)
- [x] GradeTierProvider 正确映射：P1-3→wonder, P4-6→cosmic, J1-3→flow, S1-3→studio, 非学生→studio
- [x] data-theme 属性切换：wonder / cosmic / flow / studio
- [x] 页面过渡 4 套配置各自生效（template.tsx AnimatePresence）
- [x] Three.js 仅 cosmic tier 加载（React.lazy 守卫）
- [x] Lottie 组件 fallback 正常（无 JSON 时降级为 null）
- [x] BottomNav: wonder=3 tab / cosmic=4 tab / flow+studio=全部
- [x] i18n 完整覆盖 zh + en（tier.* + common.completed）
- [x] 家长/管理员始终 studio tier
- [x] 无 `any` 类型
- [x] 无 `ts-ignore` / `ts-expect-error`
- [x] 未使用声明溯源（Rule 8）：ThemeProvider 功能已完整吸收进 GradeTierProvider，安全删除
- [ ] Sidebar 适配 → Sprint 21（导航全面改造）
- [ ] 真实 Lottie JSON 资源 → 后续迭代
