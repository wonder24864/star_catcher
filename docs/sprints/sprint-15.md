# Sprint 15: 管理员 UI (D7 + D8) + Brain 监控 (Week 20)

**Status**: DRAFT

**目标**: D8 低置信度映射管理确认 + D7 KG 拖拽层级调整 + Brain 管理监控。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 128 | Sprint 15 用户故事 + Sprint 文件 | US-055 (低置信度映射管理确认)、US-056 (KG 拖拽调整) |
| 129 | 低置信度映射管理页面 | `src/app/[locale]/(dashboard)/admin/knowledge-graph/mappings/page.tsx`：筛选 confidence < 0.7 -> 列表（题目+KP+置信度）-> 批量确认/修正/删除 |
| 130 | knowledge-graph router 扩展 | `listLowConfidenceMappings`, `batchVerifyMappings`, `updateMapping` procedures, ADMIN only |
| 131 | KG 拖拽调整层级 | 安装 @dnd-kit/core + @dnd-kit/sortable；KG 管理页面添加拖拽排序和层级调整功能；调用已有 `update(parentId)` 后端 API。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D23 |
| 132 | Learning Brain 监控页面 | `src/app/[locale]/(dashboard)/admin/brain/page.tsx`：Brain 执行历史、学生级状态、Agent 调度统计、Jaeger trace 链接 |
| 133 | Sprint 15 集成验证 | 低置信度筛选+批量确认端到端；KG 拖拽层级变更端到端；Brain 监控页数据展示。npm test + tsc --noEmit |

## 验证清单

- [ ] 低置信度映射筛选 + 批量确认端到端
- [ ] KG 拖拽层级变更 + parentId 更新
- [ ] Brain 监控页：执行历史 + 学生状态 + Jaeger 链接
- [ ] RBAC：映射管理 ADMIN only
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] i18n 新增 key 覆盖 zh + en
