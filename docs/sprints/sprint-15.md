# Sprint 15: 管理员 UI (D7 + D8) + Brain 监控 (Week 20)

**Status**: COMPLETED

**目标**: D8 低置信度映射管理确认 + D7 KG 拖拽层级调整 + Brain 管理监控。

> **用户授权扩展**（超出原 sprint 文本）：`QuestionKnowledgeMapping.verifiedBy/At`、`KnowledgePoint.sortOrder` + `reorderSiblings`、`AgentTrace.otelTraceId`、顺手修跨父拖拽的 depth 级联 bug、US-057 新增。详见 plan file `stateful-sparking-origami.md`。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 128 | Sprint 15 用户故事 + Sprint 文件 | [US-055 低置信度映射审核](../user-stories/admin-phase3.md) / [US-056 KG 拖拽层级](../user-stories/admin-phase3.md) / [US-057 Brain 监控](../user-stories/admin-phase3.md) |
| 129 | 低置信度映射管理后端 + schema | schema 加 verifiedBy/verifiedAt；router 扩展 `listLowConfidenceMappings` / `batchVerifyMappings` / `updateMapping` / `deleteMapping`，ADMIN only |
| 130 | 低置信度映射管理页面 | `src/app/[locale]/(dashboard)/admin/knowledge-graph/mappings/page.tsx`：筛选 + 批量确认/修正/删除 |
| 131 | KG 拖拽调整层级 + 排序 | 安装 `@dnd-kit/core + @dnd-kit/sortable`；KP 加 `sortOrder` 字段；`update` 修子树 depth 级联 bug；新增 `reorderSiblings`；KG 页新 Tab「层级编辑」。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D23 |
| 132 | Learning Brain 监控页面 | `AgentTrace.otelTraceId` + telemetry helper；`brain.ts` router (listRuns/studentStatus/stats)；`src/app/[locale]/(dashboard)/admin/brain/page.tsx`：执行历史 + 学生状态 + 统计 + Jaeger 链接（后端构造） |
| 133 | Sprint 15 集成验证 | Prisma migrate + 端到端手动验证 + npm test + tsc --noEmit |

## 验证清单

- [x] 低置信度映射筛选 + 批量确认端到端（含 verifiedBy/At 写入 + AdminLog）
- [x] KG 拖拽：同父排序（sortOrder 持久化，reorderSiblings 事务写入）
- [x] KG 拖拽：跨父移动 + 自身及子孙 depth 级联正确（修复 update 的已有 bug）
- [x] Brain 监控页：执行历史 + 学生状态 + 统计 + Jaeger 链接（启用/未启用态）
- [x] RBAC：所有新 procedure（mapping 4 + brain 3 + reorderSiblings = 8 个）ADMIN only
- [x] Prisma migration 本地 apply 干净 + generate 更新
- [x] npm test 全量通过（947 tests，新增 41 项）
- [x] tsc --noEmit 无错误
- [x] i18n 新增 key 覆盖 zh + en（i18n-coverage 架构测试通过）
- [x] PHASE3-LAUNCH-PLAN 状态更新（Sprint 14/15 标 COMPLETED）
- [x] 无 `any` / `@ts-ignore`、无宽泛 catch、未使用声明溯源完成（Rule 8）
