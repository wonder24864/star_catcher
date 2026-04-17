# Phase 5 启动计划

> Learning Brain 优化 + 家长/管理端 UI 现代化。Sprint 23 ~ 26，共 4 个 Sprint。
> 每个 Sprint 的任务明细在 `docs/sprints/sprint-{N}.md`。
> Phase 3 核心编排已完成，Phase 5 聚焦补全 + 优化 + 视觉升级。

---

## 一、模块划分

Phase 5 围绕"Brain 补全 + 体验升级"实现 3 个模块：

| 模块 | 职责 | 核心新增 |
|------|------|---------|
| **A. Learning Brain 优化** | 补全状态审计 + 冷却优化 + 运维能力 | MasteryStateHistory 表、CORRECTED 事件激活、渐进冷却 D55、管理员手动触发/冷却覆盖 D56 |
| **B. Pro 组件库** | 家长/管理端共用的现代化 UI 基础设施 | GlassCard（毛玻璃）、CountUp（数字动画）、GaugeChart（环形仪表）、StatusPulse（脉冲指示）、GradientMesh（渐变背景）、InteractiveChart（交互图表）、CommandPalette（Cmd+K）、Skeleton（加载占位） |
| **C. 家长 + 管理端 UI 改造** | 全面视觉升级 | 家长 overview/stats/reports 毛玻璃改造；管理员仪表盘首页、Brain 实时监控（tRPC subscription）、2D 力导向知识图谱（d3-force + SVG） |

模块依赖：A 独立（Sprint 23 已完成） → B 独立 → C 依赖 B 组件

---

## 二、Sprint 总览

| Sprint | 周期 | 范围 | Sprint 文件 | 状态 |
|--------|------|------|-------------|------|
| 23 | Week 28 | 模块 A — MasteryStateHistory + CORRECTED 事件 + 渐进冷却 + 管理员触发 | [sprint-23.md](sprints/sprint-23.md) | COMPLETED |
| 24 | Week 29 | 模块 B — Pro 组件库 + Dashboard Layout 升级 | [sprint-24.md](sprints/sprint-24.md) | |
| 25 | Week 30 | 模块 C(上) — 家长端 UI 改造 | [sprint-25.md](sprints/sprint-25.md) | COMPLETED |
| 26 | Week 31 | 模块 C(下) — 管理端 UI 改造 + Phase 5 验收 | [sprint-26.md](sprints/sprint-26.md) | |

---

## 三、新增依赖库

| 库 | 用途 | 大小(gzip) |
|----|------|-----------|
| `cmdk` | Command Palette（Radix 生态一致） | ~5kB |
| `d3-force` | 知识图谱 2D 力导向布局 | ~12kB |

> 已有 framer-motion、Three.js、Lottie、recharts 无需新增。

---

## 四、设计决策

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| D53 | MasteryStateHistory 独立表 | 不复用 InterventionHistory | 语义不同（审计 vs 干预），独立表查询效率高 |
| D54 | CORRECTED 瞬态处理 | profile router 只查 toStatus=CORRECTED | auto→REVIEWING 是噪音，不展示 |
| D55 | 渐进冷却 | tier 1=6h / 2=12h / 3=24h，Redis JSON `{tier,setAt}` | 替代固定 24h，首次干预后更快反馈 |
| D56 | 管理员触发 + 冷却覆盖 | triggerBrain + overrideCooldown mutation | AdminLog 审计，运维必要能力 |
| D57 | Brain 批次缓存 | 不需要 | 分析后确认 fan-out 独立 job 无冗余查询 |
| D35 | 毛玻璃仅 Pro 主题 | 家长+管理员 | 学生 4 tier 有各自设计语言 |
| D36 | KG 力导向图 | d3-force + SVG 2D | Three.js 3D 力模拟复杂且收益不对等 |
| D37 | Command Palette | cmdk | Radix 生态一致（shadcn/ui） |
| D38 | Brain 实时监控 | tRPC subscription | 项目已有 httpSubscriptionLink |
| D39 | 详情展开 | AnimatePresence 内联 | 比独立 SplitPane 更简洁 |

---

## 五、验收标准

1. **Brain 优化**（Sprint 23 ✅）：MasteryStateHistory 审计、CORRECTED 时间线事件、渐进冷却、手动触发/覆盖
2. **Pro 组件库**（Sprint 24）：所有组件 light/dark 双模式、`prefers-reduced-motion` 尊重、Storybook 级可复用
3. **家长端**（Sprint 25）：overview/stats/reports 毛玻璃改造、GaugeChart 掌握率、交互式图表 drill-down
4. **管理端**（Sprint 26）：仪表盘首页替代 redirect、Cmd+K 全局搜索、Brain 实时监控、KG 力导向图
5. **回归**：`npm test` 0 failed + `tsc --noEmit` 0 errors + `npm run build` 成功
