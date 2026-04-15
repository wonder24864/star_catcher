# 家长学习控制用户故事

## US-054: 家长控制每日任务与学习时段

**As a** 家长
**I want to** 为绑定子女设置每日任务上限和学习时段
**So that** 可以根据孩子的精力和家庭作息节奏，控制 AI 每日推送任务的强度与时点

**验收标准：**
- [ ] 路径 `/parent/settings/learning`（`src/app/[locale]/(dashboard)/parent/settings/learning/page.tsx`）：家长登录后可访问
- [ ] 子女选择器：列出 family 中所有 STUDENT 绑定（复用 `trpc.parent.getStudentConfigs`，返回体扩展 maxDailyTasks + learningTimeStart/End）
- [ ] maxDailyTasks：range slider（0-20），当前值数字显示；0 等同于"家长禁用任务生成"（intervention-planning handler 已有 skip 路径）
- [ ] learningTimeStart / learningTimeEnd：time input（HH:MM），两端可空（null 视为"全时段允许"）
- [ ] 保存：调 `trpc.parent.setLearningControl` → upsert ParentStudentConfig → 成功 toast + 回填失效
- [ ] 操作日志折叠区：显示最近 10 条本人设置变更（`trpc.parent.recentSettingLogs`，RBAC 锁定到当前 parent + studentId）
- [ ] Brain 当日即生效：`intervention-planning` handler 读取 ParentStudentConfig 时拿到最新值
- [ ] 学习时段约束：若 `learningTimeStart && learningTimeEnd` 都非 null，handler 在时段外 skip 任务生成（新增 `isWithinLearningHours` 纯函数，支持跨午夜区间）

**边界条件：**
- 非 PARENT 角色访问 mutation：tRPC FORBIDDEN
- 家长尝试设置非绑定学生：`verifyParentStudentAccess` FORBIDDEN
- HH:MM 非法格式（如 "25:00"）：tRPC zod regex 拒绝
- 两端只设一端（只有 start 无 end，或反之）：视为"未完整设置"，handler 不 skip
- 跨午夜区间（start=22:00, end=07:00）：`now >= start || now <= end`
- `maxDailyTasks = 0`：handler 沿用现有 skip 逻辑（已实现）
- `maxDailyTasks = 20`：UI 上限 clamp，tRPC zod `.max(20)`

**性能要求：**
- mutation 响应 < 500ms（一次 upsert + AdminLog）
- `recentSettingLogs` 查询 < 300ms（adminId + target 已有组合索引）

---

### tRPC 契约

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| parent.getLearningControl | `{ studentId }` | `{ maxDailyTasks, learningTimeStart, learningTimeEnd }` | PARENT + family |
| parent.setLearningControl | `{ studentId, maxDailyTasks:0-20, learningTimeStart/End: "HH:MM"\|null }` | updated row | PARENT + family |
| parent.recentSettingLogs | `{ studentId, limit?:10 }` | `AdminLog[]` | PARENT + family（仅本人设置） |

### AdminLog 契约

| 字段 | 值 |
|-----|------|
| adminId | parentId（当前登录家长） |
| action | "parent-setting" |
| target | studentId |
| details | `{ maxDailyTasks, learningTimeStart, learningTimeEnd }` |

### UI 组件选型

- 不引入新依赖（避免 bundle 膨胀）
- Slider → 原生 `<input type="range">` + Tailwind
- Time picker → 原生 `<input type="time">`（浏览器自带 HH:MM 校验）
- 布局 → 沿用现有 Card + Label + Input 组合（参考 `src/app/[locale]/(dashboard)/settings/page.tsx`）
