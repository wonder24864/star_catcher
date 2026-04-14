# 薄弱分析与年级过渡 用户故事

## US-047: 三层薄弱分析

**As a** 系统（定期 + 手动触发）
**I want to** 定期聚合学生的 MasteryState 数据，生成 PERIODIC（学期内）和 GLOBAL（全历史）两层薄弱分析报告，存入 WeaknessProfile
**So that** Learning Brain 和后续 Intervention Planning Agent 能基于结构化的薄弱趋势数据做出更精准的干预决策

**验收标准：**
- [ ] weakness-profile Skill 注册为 ACTIVE，manifest + schema 完整
- [ ] Skill 是纯数据聚合（不调用 AI），通过 `ctx.readMemory()` 读取 MasteryState + InterventionHistory
- [ ] PERIODIC 分析：聚合当前学期 MasteryState（按学期开始日期过滤）
- [ ] GLOBAL 分析：聚合全历史 MasteryState（不限时间窗口）
- [ ] 每个弱点 KP 输出：`severity`（HIGH/MEDIUM/LOW）+ `trend`（IMPROVING/STABLE/WORSENING）+ `errorCount`
- [ ] Severity 分级规则：errorCount ≥ 5 或 correctRate < 0.3 → HIGH；errorCount ≥ 3 → MEDIUM；其余 LOW
- [ ] Trend 计算：对比分析窗口前后半段的错误密度，后半段更密 → WORSENING
- [ ] BullMQ 定期分析：Schedule Registry 注册 `weakness-profile-weekly`（已有，Sunday 03:00 UTC）
- [ ] BullMQ handler fan-out 模式：`__all__` → 逐学生分发
- [ ] WeaknessProfile 写入 DB：tier、data（JSON）、generatedAt、validUntil（PERIODIC 7天有效期）
- [ ] Admin 可手动触发 GLOBAL 分析（tRPC mutation `triggerWeaknessProfile`）
- [ ] AdminLog 记录 action=`weakness-profile`

**边界条件：**
- 学生无 MasteryState 记录：生成空 profile（weakPoints = []）
- 学生全部 KP 已 MASTERED：severity 全为 LOW，trend 为 STABLE 或 IMPROVING
- InterventionHistory 无记录：trend 默认 STABLE
- PERIODIC 分析窗口无数据（新学期刚开始）：生成空 profile
- 已归档 MasteryState 不参与分析

**性能要求：**
- 单学生 profile 生成：< 5s
- 全量 fan-out：并发由 BullMQ worker 控制

---

### Skill 设计要点

weakness-profile Skill **不调用 AI**，是纯数据聚合。PHASE3-LAUNCH-PLAN 的 5 个新 Skill 均有明确 AI 操作类型，weakness-profile 不在其中。

**两个入口**：
| 入口 | 运行环境 | 写 DB | 说明 |
|------|---------|-------|------|
| Skill execute.ts | IPC 沙箱（worker_threads） | 否，只返回数据 | 被 intervention-planning Agent 调用 |
| BullMQ handler | 主进程 | 是，写 WeaknessProfile 表 | 定期 cron 或手动触发 |

Skill 沙箱内不能 import 主进程模块，severity/trend 计算逻辑需内联在 execute.ts 中。

**WeaknessProfile 三层**：
| Tier | 数据范围 | 触发方式 | 有效期 |
|------|---------|---------|--------|
| REALTIME | 实时弱点（getWeakPoints） | 已有，直接查 MasteryState | 无（实时） |
| PERIODIC | 当前学期 | Weekly cron | 7 天 |
| GLOBAL | 全历史（跨学期） | 手动触发（学期末） | 无过期 |

---

## US-048: 年级过渡策略

**As a** 系统（管理员触发）
**I want to** 在学生升入新学段时，批量归档旧学段的 MasteryState 记录，并在新错题回溯旧学段 KP 时标记为基础薄弱
**So that** 旧学段数据不干扰当前学习调度，同时能识别跨学段的基础知识缺陷

**验收标准：**
- [ ] `archiveMasteryBySchoolLevel(studentId, schoolLevel)` 批量设置 `archived: true`
- [ ] 已归档 MasteryState 不参与 `getWeakPoints()` 查询
- [ ] 已归档 MasteryState 对应的 ReviewSchedule 不参与 `getOverdueReviews()` 查询
- [ ] `getActiveStudentIds()` 排除只有 archived MasteryState 的学生
- [ ] `checkFoundationalWeakness(studentId, kpId, currentSchoolLevel)` 检测 KP 是否属于更低学段
- [ ] InterventionHistory 新增 `foundationalWeakness` 字段（Boolean, default false）
- [ ] `logIntervention()` 支持 `options.foundationalWeakness` 标记
- [ ] 共享工具函数 `gradeToSchoolLevel(grade)` + `isLowerSchoolLevel(a, b)`

**边界条件：**
- 学生无旧学段 MasteryState：archiveMasteryBySchoolLevel 返回 `{ archivedCount: 0 }`
- 已归档的 KP 再次 archive：幂等（updateMany where archived: false）
- KP 无 schoolLevel 记录：`checkFoundationalWeakness` 返回 false
- 同学段 KP：不算基础薄弱（isLowerSchoolLevel 需严格小于）

**设计决策**：
- D20：年级过渡不删数据，用 `archived` 标记。旧数据可追溯（GLOBAL 分析仍可读取）
- 归档是按学段批量操作，不是逐 KP 操作

---

### Brain 集成（Sprint 11 新增）

Brain 决策逻辑在现有弱点 + 过期复习基础上，新增 WeaknessProfile 趋势检查：

**扩展决策流程**：
1. 读弱点（已有）
2. 读过期复习（已有）
3. **读 PERIODIC WeaknessProfile → 提取 trend=WORSENING 的 KP IDs** ← 新增
4. **合并 interventionKPIds = dedupe(weakPointKPIds + worseningKPIds)** ← 重构
5. 有 KP + 无 cooldown → 排 intervention-planning（使用合并后的 IDs）
6. 每个过期复习 → 排 mastery-evaluation（不变）

Brain 仍是确定性代码（读 DB，不调 AI），符合 CLAUDE.md Rule 8。
