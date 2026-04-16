# Phase 4 儿童友好 UI 用户故事

## US-063: 年级自适应动画系统基础设施

**As a** 学生
**I want to** 看到匹配我年龄段的界面风格和动画效果
**So that** 使用系统时感觉愉悦、现代，不会觉得幼稚或无趣

**验收标准：**
- [ ] 安装依赖：framer-motion, lottie-react, @react-three/fiber, @react-three/drei, three
- [ ] `GradeTierProvider` context + `useGradeTier()` hook，4 tier 映射: lower-primary(P1-3) / upper-primary(P4-6) / junior / senior
- [ ] `AnimationProvider`：framer-motion `AnimatePresence` + 每个 tier 不同页面过渡配置
- [ ] 页面过渡集成到 dashboard layout.tsx

**4 Tier 页面过渡：**
- P1-3: scale + fade（从中心膨胀）
- P4-6: slide + blur（右侧滑入，模糊渐变）
- 初中: spring 水平滑动
- 高中: 快速 fade（0.15s）

**Lottie 资源（public/lottie/）：**
- `magic/star-burst.json`, `magic/confetti.json`, `magic/character-dance.json`
- `cosmic/rocket-launch.json`, `cosmic/energy-burst.json`, `cosmic/shield-break.json`

---

## US-064: Tier 1 "魔法乐园" 组件

**As a** 小学 1-3 年级学生
**I want to** 看到温暖、圆润、充满惊喜的界面
**So that** 学习像打开礼物盒一样有趣

**验收标准：**
- [ ] `MagicButton`：弹性缩放（spring physics, stiffness: 300），最小 56px 高度，圆角 16px
- [ ] `CelebrationOverlay`：Lottie 星星爆炸 + 纸屑动画，全屏覆盖
- [ ] `BounceCounter`：数字从 0 弹跳计数到目标值 + 星星收集
- [ ] `RainbowProgress`：彩虹渐变填充 + 填满时小动物 Lottie
- [ ] 错误提示：温柔摇头动画替代红色警告

---

## US-065: Tier 2 "宇宙探索者" 组件

**As a** 小学 4-6 年级学生
**I want to** 看到酷炫、科技感的太空主题界面
**So that** 觉得学习是一场太空冒险

**验收标准：**
- [ ] `CosmicBackground`：@react-three/fiber 星空粒子场（React.lazy 按需加载，60fps）
- [ ] `GlowButton`：hover 发光边框 + 点击涟漪扩散，最小 48px 高度，圆角 12px
- [ ] `HologramScore`：全息投影风格数字（发光 + 轻微抖动 + 扫描线）
- [ ] `ConstellationProgress`：星座连线动画（知识点 = 星星，掌握 = 连线）
- [ ] Lottie 火箭升空庆祝 + 能量护盾破碎解锁

---

## US-066: Tier 3 "极简流" + Tier 4 "专业工作室" 组件

**As a** 初中/高中学生
**I want to** 使用干净现代的效率工具界面
**So that** 专注于学习内容而非花哨装饰

**验收标准：**
- [ ] Tier 3 `FlowCard`：毛玻璃效果（backdrop-blur）+ hover 微浮起
- [ ] Tier 3 `RippleEffect`：圆形涟漪扩散完成动画（framer-motion path drawing）
- [ ] Tier 3 `FlipCounter`：数字翻转动画 + 渐变色标注
- [ ] Tier 3 `GradientRing`：环形渐变进度 + 完成脉冲
- [ ] Tier 4 `ProToast`：行内通知 + 微勾号
- [ ] Tier 4 `DeltaIndicator`：趋势箭头指示器（↑↓）
- [ ] Tier 4 `SlimProgress`：细线进度条 + 百分比数字

---

## US-067: 通用自适应组件

**As a** 开发者
**I want to** 使用统一接口的自适应组件
**So that** 页面代码不需要关心当前是哪个 tier，组件自动切换

**验收标准：**
- [ ] `<GradeButton>` → 根据 tier 渲染 MagicButton / GlowButton / 标准 / Pro
- [ ] `<GradeProgress>` → 根据 tier 渲染 RainbowProgress / ConstellationProgress / GradientRing / SlimProgress
- [ ] `<GradeScore>` → 根据 tier 渲染 BounceCounter / HologramScore / FlipCounter / 精确数字
- [ ] `<GradeCelebration>` → 根据 tier 渲染 CelebrationOverlay / 火箭 / 涟漪 / ProToast
- [ ] `<GradeCard>` → 根据 tier 渲染对应卡片样式
- [ ] 家长/管理员角色始终使用 Pro/默认样式

---

## US-068: 任务页 + 批改页年级自适应改造

**As a** 学生
**I want to** 在做任务和批改时看到适合我年级的界面
**So that** 操作更顺畅，反馈更有成就感

**验收标准：**
- [ ] TaskCard 使用 GradeCard + GradeButton 重构
- [ ] 任务完成触发 GradeCelebration
- [ ] 任务列表布局：P1-3 单列大卡片 / P4-6 双列 / 初中+ 紧凑列表
- [ ] GradeProgress 替代原进度条
- [ ] 批改分数用 GradeScore 展示
- [ ] 批改提交过渡动画（framer-motion → 结果页）
- [ ] 帮助请求按钮 GradeButton 适配
- [ ] P1-3 更大输入框 + 更大字体
- [ ] SubjectBadge 年级自适应颜色变体
- [ ] 低年级友好 i18n（"我懂了！""帮帮我"等）

---

## US-069: 错题本 + 掌握度 + 导航年级自适应改造

**As a** 学生
**I want to** 在错题本、掌握度和导航中看到适合我的界面风格
**So that** 整个系统体验统一、连贯

**验收标准：**
- [ ] 错题列表：P1-3 大卡片单列 + 图标科目标记 / P4-6+ 标准列表
- [ ] P1-3 错误提示用温柔摇头 Lottie 替代红色警告
- [ ] 掌握度网格：P1-3 大图标+颜色块 / P4-6 星座连线地图 / 初中+ 数据表格
- [ ] `BottomNav`：P1-3 三 tab(56px 图标无文字) / P4-6 四 tab(发光) / 初中+ 五 tab
- [ ] `Sidebar`：P1-3 icon-only / P4-6 紧凑+发光 / 初中+ 完整
- [ ] AnimatePresence 集成 dashboard layout 页面过渡
- [ ] Subject 颜色 4 tier 变体
- [ ] 全局 i18n 审计完成

---

## US-070: 学生画像可视化

**As a** 学生/家长
**I want to** 查看学习旅程、掌握度仪表盘和历史进度
**So that** 直观了解整体学习状况和成长轨迹

**验收标准：**
- [ ] 新增 `profileRouter`: learningJourney + masteryDashboard + historicalProgress
- [ ] `student/profile` 页面：学习旅程时间线（framer-motion stagger 入场）
- [ ] 掌握度仪表盘（按科目分组 + GradeProgress 环形进度）
- [ ] 历史进度折线图（Recharts + framer-motion 入场动画）
- [ ] 增强 `/mastery` 页面（添加进度折线图）
- [ ] Profile 页面 4 tier 全面自适应
- [ ] i18n：zh + en 双语

**tRPC 契约：**

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| profile.learningJourney | `{ studentId }` | `{ events: Array<{type, kpName, subject, timestamp, detail}> }` | STUDENT(self) + PARENT(family) |
| profile.masteryDashboard | `{ studentId }` | `{ bySubject: Record<Subject, {total, mastered, inProgress, newError}> }` | STUDENT(self) + PARENT(family) |
| profile.historicalProgress | `{ studentId, period: "30d"\|"90d" }` | `{ dailyCounts: Array<{date, mastered, total}> }` | STUDENT(self) + PARENT(family) |
