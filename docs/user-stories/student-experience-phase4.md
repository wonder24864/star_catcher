# Phase 4 学生体验用户故事

## US-063: 年级自适应动画系统

**As a** 学生
**I want to** 看到符合我年龄段审美风格的界面和动画
**So that** 学习工具让我感到亲切和有趣，愿意主动使用

**验收标准：**

- [ ] GradeTierProvider 根据学生年级输出 4 级 tier（wonder/cosmic/flow/studio）
- [ ] 页面过渡动画因 tier 而异：
  - wonder (P1-3): scale + fade 从中心膨胀
  - cosmic (P4-6): slide + blur 右侧滑入
  - flow (初中): spring 水平滑动
  - studio (高中): 快速 fade 0.15s
- [ ] Lottie 庆祝动画按 tier 加载不同资源（`public/lottie/{tier}/`）
- [ ] Three.js 星空背景仅 cosmic tier 按需加载（React.lazy + Suspense）
- [ ] 非学生用户（家长/管理员）始终使用 studio tier
- [ ] i18n：zh + en 双语

**性能要求：**
- 页面过渡 < 300ms
- Three.js bundle 仅 cosmic tier 加载（React.lazy）
- Lottie JSON 从 `public/` 加载，不打入 JS bundle

---

## US-064: 年级自适应组件库

**As a** 学生
**I want to** 使用适合我年龄段的按钮大小、导航方式和视觉密度
**So that** 界面既好看又好用，不会因为按钮太小或信息太密而困扰

**验收标准：**

- [ ] 4 套 CSS 变量主题（wonder / cosmic / flow / studio）覆盖颜色、圆角、字号、按钮尺寸
- [ ] BottomNav 因 tier 而异：
  - wonder: 3 tab，大图标 56px，无文字
  - cosmic: 4 tab，中图标 44px + 文字，微发光
  - flow/studio: 5 tab（完整），标准
- [ ] 卡片样式因 tier 而异：
  - wonder: 圆角 16px，大阴影
  - cosmic: 发光边框 hover 效果
  - flow: 毛玻璃 backdrop-blur
  - studio: 极简，细线边框
- [ ] 进度条组件因 tier 而异：
  - wonder: 彩虹渐变
  - cosmic: 星座连线风格
  - flow: 环形渐变
  - studio: 细线 + 百分比
- [ ] i18n：zh + en 双语
