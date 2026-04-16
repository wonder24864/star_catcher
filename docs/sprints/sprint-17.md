# Sprint 17: 增强家长分析 (Week 22)

**Status**: COMPLETED

**目标**: 模块 A — 增强家长学习统计，新增纠正率分布、帮助频率明细、多孩对比视图。

## 用户故事

- US-059: 增强家长学习统计 — 见 [parent-analytics-phase4.md](../user-stories/parent-analytics-phase4.md)
- US-060: 多孩对比视图 — 见 [parent-analytics-phase4.md](../user-stories/parent-analytics-phase4.md)

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 141 | [x] Sprint 17 用户故事 + Sprint 文件 | US-059, US-060 — 见 [parent-analytics-phase4.md](../user-stories/parent-analytics-phase4.md) |
| 142 | [x] 提取 SUBJECT_COLORS 共享常量 | `src/lib/constants/subject-colors.ts`；重构 `parent/stats/page.tsx`、`errors/page.tsx`、`errors/[id]/page.tsx` 三处引用 |
| 143 | [x] tRPC: correctionRateDistribution | `parent.correctionRateDistribution` — 查询 ErrorQuestion 按科目 × 尝试次数桶分布（1次/2次/3+次） |
| 144 | [x] tRPC: helpFrequencyDetail | `parent.helpFrequencyDetail` — 查询 HelpRequest 按科目 × 帮助等级(L1/L2/L3)分组统计 |
| 145 | [x] tRPC: multiStudentComparison | `parent.multiStudentComparison` — 家长下所有学生聚合指标(错题数/纠正率/帮助频率/掌握率)，服务端聚合 |
| 146 | [x] 前端：增强 parent/stats 页面 | 纠正率分布直方图（Recharts Bar）+ 帮助频率分组柱状图，7d/30d 切换 |
| 147 | [x] 前端：新建 parent/comparison 页面 | 多孩雷达图或分组柱状图，仅 2+ 学生时显示导航入口 |
| 148 | [x] 导航 + i18n | 侧栏 + 底部导航新增入口；zh.json + en.json `parent.comparison.*`, `parent.stats.correctionRate.*`, `parent.stats.helpDetail.*` |
| 149 | [x] 测试 | 新增 tRPC procedures 单测（correctionRateDistribution, helpFrequencyDetail, multiStudentComparison）+ 组件渲染测试 |

## 验证清单

- [x] `parent.correctionRateDistribution` 返回按科目分组的尝试次数分布，数据正确
- [x] `parent.helpFrequencyDetail` 返回按科目 × 帮助等级分组，数据正确
- [x] `parent.multiStudentComparison` 返回所有绑定学生的聚合指标
- [ ] 纠正率直方图在 `parent/stats` 页面正确渲染 ← 待你手动验证
- [ ] 帮助频率图在 `parent/stats` 页面正确渲染 ← 待你手动验证
- [ ] 多孩对比页面仅 2+ 学生时可见，图表正确 ← 待你手动验证
- [ ] 7d / 30d 时间段切换对所有新图表生效 ← 待你手动验证
- [x] SUBJECT_COLORS 共享常量替换全部 3 处重复定义
- [x] i18n 完整覆盖 zh + en
- [x] `npm test` 全量通过 (1006 passed, 0 failures)
- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
