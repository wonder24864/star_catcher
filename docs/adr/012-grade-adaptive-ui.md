# ADR-012: 年级自适应 UI 架构

**状态**: ACCEPTED
**日期**: 2026-04-16
**决策者**: Solo Dev

## 背景

Phase 1-3 使用 3 级主题系统（Candy / Fresh / Pro），通过 `data-theme` CSS 变量切换颜色和圆角。Phase 4 需要升级为 4 级动画系统，差异扩展到：页面过渡、动画风格、导航结构、布局密度、组件交互方式。

## 决策

### D24: 年级自适应策略 — CSS 变量(视觉) + GradeTierProvider(结构)

4 tier 之间的差异不仅是颜色和圆角（CSS 可解决），还包括导航层级（3 tab vs 5 tab）、动画类型（弹性 vs 模糊 vs 快速 fade）、布局密度等结构差异。需要 React Context 提供 tier 信息，组件根据 tier 做条件渲染。

**Tier 映射**:
| Tier | 年级 | 主题 slug | 风格名称 |
|------|------|----------|---------|
| 1 | PRIMARY_1~3 | wonder | 魔法乐园 Magic Wonderland |
| 2 | PRIMARY_4~6 | cosmic | 宇宙探索者 Cosmic Explorer |
| 3 | JUNIOR_1~3 | flow | 极简流 Minimal Flow |
| 4 | SENIOR_1~3 | studio | 专业工作室 Studio Pro |

非学生用户（PARENT / ADMIN）始终使用 studio。

### D25: 动画技术栈 — framer-motion + lottie-react + @react-three/fiber

- `framer-motion`: 声明式 React 动画，覆盖页面过渡、布局动画、手势交互
- `lottie-react`: 复杂插画动画（庆祝、角色、引导），JSON 资源放 `public/lottie/{tier}/`
- `@react-three/fiber` + `@react-three/drei`: 3D 粒子效果，仅 cosmic tier 使用

### D26: Three.js 加载策略 — React.lazy + Suspense

仅 cosmic tier (P4-6) 使用 3D 星空背景。通过 `React.lazy` + `Suspense` 按需加载，其他 tier 不加载 Three.js bundle（~40kB gzip）。

### D29: 年级分层粒度 — 4 tier

Phase 1-3 的 3 级（Candy=小学全部 / Fresh=初中 / Pro=高中）在小学阶段区分不够：P1-3 需要更圆润更大的触控目标，P4-6 可以接受更复杂的视觉。拆分为 4 tier。

### D30: Lottie 资源管理 — public/lottie/{tier}/

按 tier 组织 Lottie JSON 文件，浏览器缓存友好，不打入 JS bundle。初始版本使用 CSS 动画占位，后续替换为 LottieFiles 资源。

### D31: Lottie 资源来源 — CSS 动画占位 + 渐进替换

首次交付使用 framer-motion + CSS 实现核心动画效果（弹性按钮、纸屑、涟漪等），Lottie 组件基础设施就绪但使用占位 fallback。真实 Lottie JSON 资源在后续迭代中从 LottieFiles 选取并调色。

## 实现

### GradeTierProvider

```typescript
type GradeTier = "wonder" | "cosmic" | "flow" | "studio";

interface TierConfig {
  tier: GradeTier;
  tierIndex: 1 | 2 | 3 | 4;
  transition: { type: string; duration: number };
  nav: { tabs: number; iconSize: number; showLabel: boolean };
  typography: { base: number; heading: number };
  button: { minHeight: number; borderRadius: number };
}
```

### 文件结构

```
src/components/
  providers/
    grade-tier-provider.tsx   # React Context + gradeToTier()
    theme-provider.tsx        # 更新: 4 tier → data-theme
  animation/
    page-transition.tsx       # framer-motion AnimatePresence 包装
    lottie-animation.tsx      # Lottie 基础设施组件
    star-field.tsx            # Three.js 星空（React.lazy）
    celebration.tsx           # 完成庆祝动画（per-tier）
  adaptive/
    adaptive-card.tsx         # 自适应卡片
    adaptive-progress.tsx     # 自适应进度条
    adaptive-nav.tsx          # 自适应底部导航
public/
  lottie/
    wonder/                   # P1-3 动画资源
    cosmic/                   # P4-6 动画资源
```

## 后果

- 正面：每个年龄段获得定制体验，提高使用意愿
- 正面：基础设施就绪后，Sprint 20-22 只需使用组件库改造页面
- 负面：新增 3 个依赖（framer-motion ~33kB, lottie-react ~10kB, three.js ~40kB 按需）
- 负面：4 套主题变量维护成本（通过 DESIGN-SYSTEM.md 和架构测试控制）

## Sprint 22 追加决策 (D47-D52)

| # | 决策 | 选择 | 原因 |
|---|------|------|------|
| D47 | Profile 导航位置 | Sidebar 加入; BottomNav 不改 wonder/cosmic 白名单; mastery 页加上下文入口 | 尊重 D44 tab 限制 + 上下文相关入口比强塞导航更优雅 |
| D48 | 进度图共享 + tier 配色 | 提取 `historical-progress-chart.tsx`; wonder 粉橙/cosmic 青紫/flow 绿灰/studio 蓝灰 | profile 页和 mastery 页复用；配色匹配各 tier 视觉语言 |
| D49 | 旅程数据源 | ErrorQuestion + MasteryState.masteredAt + InterventionHistory + HomeworkSession 四源并行 + JS 合并 | MasteryState 是状态快照不是事件日志，masteredAt 仅取里程碑 |
| D50 | 仪表盘查询 | `$queryRaw` GROUP BY + CASE WHEN 单次 DB 往返 | 匹配 mastery.stats 已有模式 |
| D51 | 进度图数据 | 基线查询 + 期间增量 → TS 累计曲线 | 比 correlated subquery 或 generate_series 高效且可测试 |
| D52 | 空状态 | 每段独立空状态 + tier 友好文案 | wonder"还没有记录哦～"比"No data"更温暖 |
