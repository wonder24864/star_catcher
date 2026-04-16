# Phase 4 家长分析用户故事

## US-059: 增强家长学习统计

**As a** 家长
**I want to** 看到更详细的纠正率分布和帮助频率分析
**So that** 更精确地了解孩子在各知识点上的薄弱程度和自主学习能力

**验收标准：**
- [ ] `parent/stats` 页面新增纠正率分布直方图（Recharts Bar：1 次纠正 / 2 次 / 3+ 次，按科目分组）
- [ ] 帮助频率明细图（Recharts：按科目 × 帮助等级 L1/L2/L3 热力/分组柱状图）
- [ ] `SUBJECT_COLORS` 提取到 `src/lib/constants/subject-colors.ts` 共享常量
- [ ] 7d / 30d 时间段切换适用于所有新增图表
- [ ] i18n：zh + en 双语

**性能要求：**
- 所有新增 tRPC procedures 响应 < 500ms

**tRPC 契约：**

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| parent.correctionRateDistribution | `{ studentId, period: "7d"\|"30d" }` | `{ bySubject: Record<Subject, {oneAttempt, twoAttempts, threeOrMore}> }` | PARENT + family |
| parent.helpFrequencyDetail | `{ studentId, period: "7d"\|"30d" }` | `{ bySubject: Record<Subject, {L1, L2, L3}> }` | PARENT + family |

> 注：HelpRequest 没有 subject 字段，需通过 SessionQuestion → ErrorQuestion → subject 或 SessionQuestion → HomeworkSession 路径 join。

---

## US-060: 多孩对比视图

**As a** 有多个孩子的家长
**I want to** 在一个页面上对比所有孩子的学习情况
**So that** 快速发现哪个孩子需要更多关注

**验收标准：**
- [ ] 新建 `parent/comparison` 页面（`src/app/[locale]/(dashboard)/parent/comparison/page.tsx`）
- [ ] 雷达图或分组柱状图：每个孩子的错题数、纠正率、帮助频率、掌握度等指标
- [ ] 仅当家长绑定 2+ 学生时显示导航入口；1 个孩子时隐藏
- [ ] 支持 7d / 30d 时间段切换
- [ ] i18n：zh + en 双语

**边界条件：**
- 0 个绑定学生：返回空数组，前端不渲染图表
- 1 个学生：导航入口隐藏，直接访问返回单学生数据（无对比意义但不报错）

**性能要求：**
- `multiStudentComparison` 响应 < 500ms（服务端一次聚合，不 N+1）

**tRPC 契约：**

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| parent.multiStudentComparison | `{ period: "7d"\|"30d" }` | `{ students: Array<{id, name, grade, errorCount, correctionRate, helpFrequency, masteryRate}> }` | PARENT |

---

## US-061: AI 学习建议

**As a** 家长
**I want to** 收到 AI 根据孩子学习数据生成的个性化建议
**So that** 知道如何在家辅导孩子、关注哪些薄弱环节

**验收标准：**
- [ ] Prisma: `LearningSuggestion` 模型 + `SuggestionType` 枚举 + `LEARNING_SUGGESTION` AIOperationType
- [ ] Harness 三件套：`schemas/learning-suggestion.ts` + `prompts/learning-suggestion.ts` + `operations/learning-suggestion.ts`
- [ ] Skill: `generate-learning-suggestions`（schema.json + execute.ts），读取 WeaknessProfile + MasteryState + InterventionHistory
- [ ] Eval 数据集：`tests/eval/datasets/learning-suggestion.json`（3-5 cases）
- [ ] BullMQ handler: `learning-suggestion`，注册到 handler-registry + schedule-registry（周日 cron）
- [ ] tRPC: `parent.getLearningSuggestions`（查询最新建议）+ `parent.requestLearningSuggestions`（按需触发）
- [ ] 建议输出包含三区：`suggestions`（学习建议列表）、`attentionItems`（需关注事项）、`parentActions`（家长行动建议）
- [ ] i18n：zh + en 双语

**AI 输出 Schema：**
```typescript
{
  suggestions: Array<{
    category: "review_priority" | "practice_focus" | "learning_strategy";
    title: string;
    description: string;
    relatedKnowledgePoints: string[];
    priority: "high" | "medium" | "low";
  }>;
  attentionItems: Array<{
    type: "regression_risk" | "foundational_gap" | "overload_warning";
    description: string;
    actionRequired: boolean;
  }>;
  parentActions: Array<{
    action: string;
    reason: string;
    frequency: "daily" | "weekly" | "as_needed";
  }>;
}
```

**tRPC 契约：**

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| parent.getLearningSuggestions | `{ studentId, limit?: 5 }` | `LearningSuggestion[]` | PARENT + family |
| parent.requestLearningSuggestions | `{ studentId }` | `{ jobId: string }` | PARENT + family |

---

## US-062: 干预效果追踪

**As a** 家长
**I want to** 看到每次学习干预前后的掌握度变化
**So that** 了解 AI 推荐的练习和讲解是否真正帮助孩子进步

**验收标准：**
- [ ] Prisma: InterventionHistory 新增 `preMasteryStatus MasteryStatus?` 字段（记录干预创建时的掌握状态快照）
- [ ] 回填逻辑：现有 intervention-planning handler 创建 InterventionHistory 时同步写入当前 MasteryState.status
- [ ] 干预效果对比卡片：每个知识点显示干预前掌握度 → 当前掌握度 + delta
- [ ] 干预历史时间线：类型（PRACTICE/REVIEW/EXPLANATION）、时间、效果一目了然
- [ ] 趋势折线图：选定时间段内掌握度变化轨迹
- [ ] 前端集成在 `parent/suggestions` 页面的干预效果区
- [ ] i18n：zh + en 双语

**数据模型说明：**
> MasteryState 是单行覆盖更新（无历史版本），无法直接获取"干预前"掌握度。
> 方案：在 InterventionHistory 上新增 `preMasteryStatus` 字段，干预创建时快照当前状态。
> 当前 MasteryState.status 作为"干预后"状态，两者相减得出 delta。

**tRPC 契约：**

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| parent.interventionEffect | `{ studentId, period: "7d"\|"30d" }` | `{ effects: Array<{kpId, kpName, preMastery, postMastery, delta, interventionType}> }` | PARENT + family |
| parent.interventionTimeline | `{ studentId, limit?: 20 }` | `{ events: Array<{id, type, kpName, timestamp, preMastery, currentMastery, status}> }` | PARENT + family |
