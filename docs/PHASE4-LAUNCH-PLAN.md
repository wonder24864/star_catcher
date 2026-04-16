# Phase 4 启动计划

> 家长仪表盘 + 体验优化。Sprint 17 ~ 22，共 6 个 Sprint。
> 每个 Sprint 的任务明细在 `docs/sprints/sprint-{N}.md`。
> Phase 3 遗留项（真实 OCR 数据集、进程级 e2e 测试）不纳入 Phase 4，延后至 Phase 5。

---

## 一、模块划分

Phase 4 围绕"家长体验升级 + 沉浸式学生体验"实现 5 个模块：

| 模块 | 职责 | 核心新增 |
|------|------|---------|
| **A. 增强家长分析** | 更深度的学习数据分析 | 纠正率分布、帮助频率明细、多孩对比 |
| **B. AI 学习建议 + 干预追踪** | 个性化建议 + 干预效果闭环 | LearningSuggestion 模型 + Skill + 周 cron + 干预效果面板 + 家长配合事项追踪 |
| **C. 动画系统基础设施** | 年级自适应组件 + 动画引擎 | GradeTierProvider + framer-motion 页面过渡 + Lottie 动画资源 + Three.js 粒子 |
| **D. 学生页面全面改造** | 所有学生页面年级自适应落地 | 任务/批改/错题本/掌握度全套改造 |
| **E. 学生画像可视化** | 学习旅程 + 掌握度仪表盘 | profileRouter + 时间线组件 + 进度图表 |

模块依赖：A 独立 → B 独立 → C 基础设施 → D 全面落地(依赖 C) → E 画像(依赖 C+D)

---

## 二、Sprint 总览

| Sprint | 周期 | 范围 | Sprint 文件 | 状态 |
|--------|------|------|-------------|------|
| 17 | Week 22 | 模块 A — 增强家长分析 | [sprint-17.md](sprints/sprint-17.md) | COMPLETED |
| 18 | Week 23 | 模块 B — AI 学习建议 + 干预追踪 | [sprint-18.md](sprints/sprint-18.md) | COMPLETED |
| 19 | Week 24 | 模块 C — 动画系统基础设施 + 年级自适应组件库 | [sprint-19.md](sprints/sprint-19.md) | COMPLETED |
| 20 | Week 25 | 模块 D(上) — 任务页 + 批改页年级自适应改造 | [sprint-20.md](sprints/sprint-20.md) | DRAFT |
| 21 | Week 26 | 模块 D(下) — 错题本 + 掌握度 + 导航全面改造 | [sprint-21.md](sprints/sprint-21.md) | DRAFT |
| 22 | Week 27 | 模块 E — 学生画像 + Phase 4 验收 | [sprint-22.md](sprints/sprint-22.md) | DRAFT |

---

## 三、新增依赖库

| 库 | 用途 | 大小(gzip) |
|----|------|-----------|
| `framer-motion` | 页面过渡、布局动画、手势交互、组件 enter/exit | ~33kB |
| `lottie-react` | 年级专属插画动画（庆祝、角色、引导） | ~10kB (runtime) |
| `@react-three/fiber` + `@react-three/drei` | 3D 粒子效果、星空背景（P4-6 宇宙主题） | ~40kB (按需加载) |

> Three.js 场景仅用于 P4-6 tier 的背景效果，通过 `React.lazy` + `Suspense` 按需加载，不影响其他 tier 的 bundle 大小。

---

## 四、4 级年级动画风格设计

### Tier 1: P1-3 — "魔法乐园" Magic Wonderland

温暖、圆润、充满惊喜。每个操作像打开礼物盒。

- 页面过渡：framer-motion scale + fade（从中心膨胀出现）
- 按钮：弹性缩放（spring physics），最小 56px 高度，圆角 16px
- 任务完成：Lottie 星星爆炸 + 彩色纸屑 + 角色跳舞
- 分数：大号弹跳计数 + 星星收集
- 进度条：彩虹渐变 + 填满时小动物 Lottie
- 错误提示：温柔摇头动画（非红色警告）
- 导航：底栏 3 tab，大图标(56px) 无文字
- 字体：基础 18px，标题 24px

### Tier 2: P4-6 — "宇宙探索者" Cosmic Explorer

酷炫、科技感、太空冒险。

- 页面过渡：framer-motion slide + blur（右侧滑入，模糊渐变）
- 背景：@react-three/fiber 星空粒子场（React.lazy 按需加载）
- 按钮：hover 发光边框 + 点击涟漪，最小 48px 高度，圆角 12px
- 任务完成：能量聚集 → 星球点亮（stagger），Lottie 火箭升空
- 分数：全息投影风格（发光 + 抖动 + 扫描线）
- 进度条：星座连线（知识点 = 星星，掌握 = 连线）
- 导航：底栏 4 tab，中等图标(44px) + 文字，微发光
- 字体：基础 16px，标题 20px

### Tier 3: 初中 — "极简流" Minimal Flow

干净、现代、高效。精心设计的效率工具。

- 页面过渡：framer-motion spring 水平滑动
- 按钮：hover 微升起(-2px) + 阴影加深，最小 44px 高度，圆角 8px
- 任务完成：圆形涟漪 + 简洁勾号（path drawing）
- 分数：数字翻转（flip animation）
- 进度条：环形渐变（gradient ring）
- 卡片：毛玻璃（backdrop-blur）+ hover 浮起
- 导航：侧栏完整 + 底栏 5 tab
- 字体：基础 15px，标题 18px

### Tier 4: 高中 — "专业工作室" Studio Pro

数据驱动、专业克制。动画服务于信息传达。

- 页面过渡：framer-motion 快速 fade（0.15s）
- 按钮：极微 hover 色变 + opacity 0.85，最小 40px 高度，圆角 6px
- 任务完成：行内 toast + 小勾号
- 分数：精确数字 + delta 指示器（↑↓趋势箭头）
- 进度条：细线 + 百分比数字
- 导航：侧栏完整 + 底栏 5 tab（紧凑）
- 字体：基础 14px，标题 16px

---

## 五、新增 Skill / BullMQ Job / Prisma 模型

### 新增 Skill（1 个）

| Skill | 触发方式 | 核心能力 | AI 操作类型 |
|-------|---------|---------|------------|
| generate-learning-suggestions | Brain 周 cron / 家长按需 | 综合薄弱分析+掌握度+干预历史，生成结构化建议 | LEARNING_SUGGESTION |

### 新增 BullMQ Job（1 个）

| Job Name | 触发 | 超时 | 队列 |
|----------|------|------|------|
| learning-suggestion | Schedule Registry 周日 cron / tRPC 按需 | 60s | ai-jobs |

### 新增 Prisma 模型

```prisma
model LearningSuggestion {
  id        String         @id @default(cuid())
  studentId String
  type      SuggestionType // WEEKLY_AUTO | ON_DEMAND
  content   Json           // {suggestions, attentionItems, parentActions}
  weekStart DateTime       @db.Date
  createdAt DateTime       @default(now()) @db.Timestamptz

  student User @relation("StudentSuggestions", fields: [studentId], references: [id])

  @@unique([studentId, weekStart, type])
  @@index([studentId, createdAt])
}

enum SuggestionType {
  WEEKLY_AUTO
  ON_DEMAND
}
```

AIOperationType 枚举增加 `LEARNING_SUGGESTION`。

### 现有模型变更

- `InterventionHistory` 新增 `preMasteryStatus MasteryStatus?`（干预创建时快照当前掌握状态，用于前后对比）
- `User` 新增 relation `learningSuggestions LearningSuggestion[]`

---

## 六、设计决策记录

| # | 决策 | 选择 | 选择原因 |
|---|------|------|---------|
| D24 | 年级自适应策略 | CSS 变量(视觉) + GradeTierProvider React Context(结构) | 4 tier 结构差异大（导航层级、动画风格、布局密度），需组件级分层 |
| D25 | 动画技术栈 | framer-motion + lottie-react + @react-three/fiber | framer-motion: 声明式 React 动画；Lottie: 复杂插画动画；Three.js: P4-6 3D 粒子背景 |
| D26 | Three.js 加载策略 | React.lazy + Suspense 按需加载 | 仅 P4-6 tier 使用 3D 背景，其他 tier 不加载 Three.js bundle |
| D27 | 学习建议数据模型 | 独立 LearningSuggestion 模型 | 建议有独立生命周期，不应塞入 WeaknessProfile.data |
| D28 | 多孩对比架构 | 服务端聚合，单次 tRPC 调用 | 避免 N+1 客户端请求，保证数据一致性快照 |
| D29 | 年级分层粒度 | 4 tier 结构 + 4 套动画风格 | 每个年龄段有独特审美和使用模式 |
| D30 | Lottie 资源管理 | JSON 动画文件放 `public/lottie/{tier}/` | 按 tier 组织，浏览器缓存友好，不打入 JS bundle |
| D31 | Lottie 资源来源 | LottieFiles 免费库 + 自定义调色 | 优先使用开源免费动画，调整颜色匹配各 tier 色板；复杂角色动画可占位后迭代 |
| D32 | InterventionHistory 快照 | 新增 preMasteryStatus 字段 | MasteryState 单行覆盖无历史，需在干预创建时快照当前状态，用于前后对比 |

> D24-D32 将在 Sprint 19 开始时正式写入 `docs/adr/012-grade-adaptive-ui.md`。

---

## 七、Phase 4 验收标准

### 功能验收

1. **增强分析**：家长看到纠正率分布、帮助频率明细，数据准确
2. **多孩对比**：2+ 孩子的家长看到并列对比视图，支持时间段切换
3. **AI 学习建议 + 干预追踪**：周 cron 生成建议；家长可查看和按需刷新；干预效果前后对比准确；家长配合事项清晰可操作
4. **魔法乐园 (P1-3)**：简化导航(3 tab + 56px 图标)、弹性按钮、Lottie 庆祝动画、彩虹进度条、温柔错误提示
5. **宇宙探索者 (P4-6)**：Three.js 星空背景、发光按钮、全息分数、星座进度、火箭庆祝
6. **极简流 (初中)**：毛玻璃卡片、涟漪完成动画、翻转计数器、渐变环形进度
7. **专业工作室 (高中)**：克制动画、行内通知、趋势箭头、数据密度优先
8. **学生画像**：学习旅程时间线、掌握度仪表盘、历史进度图表
9. **家长/管理员不受影响**：家长和管理员界面始终 Pro 主题

### 技术验收

10. **测试**：所有新文件有测试；`npm test` 0 failures；`tsc --noEmit` 0 errors；`npm run build` 成功
11. **i18n**：所有新字符串在 zh.json 和 en.json 中；组件无硬编码中英文；低年级友好文案
12. **Rule 1 (Harness)**：LEARNING_SUGGESTION 遵循三件套模式
13. **Rule 6 (Skill)**：generate-learning-suggestions 在 IPC 沙箱执行，仅用 callAI/readMemory
14. **Rule 10 (Registry)**：learning-suggestion job 通过 handler-registry + schedule-registry 注册
15. **Rule 11 (Eval)**：learning-suggestion.json 数据集存在且有效；DATASET_FILE_MAP 穷举
16. **架构测试**：Skill bundle 无 Prisma import
17. **性能**：Three.js 场景仅 P4-6 加载（React.lazy）；Lottie JSON 从 public/ 加载；页面过渡 < 300ms
