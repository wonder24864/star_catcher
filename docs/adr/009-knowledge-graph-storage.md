# ADR-009: 知识图谱存储方案

## Status
Accepted (Sprint 4b) — Spike 验证通过，PostgreSQL + CTE 方案确认

## Context

Phase 2 需要知识图谱系统，支持：
- 层级：学段 → 年级 → 学科 → 章节 → 知识点 → 子知识点
- 关系：前置依赖（PREREQUISITE）、平行关系（PARALLEL）、包含关系（CONTAINS）
- 属性：难度、重要性、考频
- 查询：递归查前置知识点链、查找学生薄弱知识子图、语义相似知识点搜索

候选方案：
1. PostgreSQL + 关系表 + recursive CTE
2. 独立图数据库（Neo4j）
3. PostgreSQL JSONB 邻接列表

## Decision

使用 **PostgreSQL + 关系表 + recursive CTE**，Sprint 4b Spike 验证通过。原因：
- 复用现有 Prisma + PostgreSQL 技术栈，不引入新基础设施
- 关系表（KnowledgePoint + KnowledgeRelation）可用 Prisma 管理
- recursive CTE 支持前置知识点的递归查询，性能远超指标（见下方数据）
- KnowledgePoint 表预留 pgvector 列（embedding），用于未来语义相似搜索（Task 50 评估）

### Schema 设计方向

```
KnowledgePoint:
  - id, externalId（教材版本标识）
  - subject, grade, schoolLevel
  - name, description
  - parentId（自引用，树形层级）
  - difficulty (1-5), importance (1-5), examFrequency (1-5)
  - embedding（pgvector，Phase 2 后期启用）
  - metadata (JSONB)（灵活扩展属性）
  - createdAt, updatedAt, deletedAt

KnowledgeRelation:
  - id
  - fromPointId (FK → KnowledgePoint)
  - toPointId (FK → KnowledgePoint)
  - type: PREREQUISITE | PARALLEL | CONTAINS
  - strength (Float, 0-1)
  - createdAt

QuestionKnowledgeMapping:
  - id
  - questionId (FK → ErrorQuestion)
  - knowledgePointId (FK → KnowledgePoint)
  - mappingSource: AI_DETECTED | ADMIN_VERIFIED
  - confidence (Float, 0-1)
  - createdAt
```

### Sprint 4b 验证指标与结果

测试环境：PostgreSQL 16 (Docker)，1000 KnowledgePoint + 5000 KnowledgeRelation（随机 PREREQUISITE/PARALLEL 混合图），warm cache。

| 查询 | 结果节点 | 延迟 | 目标 | 状态 |
|------|---------|------|------|------|
| 前置链 CTE ≤ 5 层 | 560 | 5.45ms | < 100ms | PASS |
| 反向前置查询 ≤ 5 层 | 696 | 6.41ms | < 100ms | PASS |
| parent-child 子树 CTE | 219 | 3.23ms | < 100ms | PASS |
| groupBy 聚合 | 1 | 6.91ms | < 50ms | PASS |

关键发现：
- CTE 必须包含**环检测**（`ARRAY[] AS visited + NOT id = ANY(visited)`），否则随机图上的多路径爆炸导致指数膨胀
- 冷查询（首次连接 + 计划缓存为空）约 150-160ms，warm cache 下 < 10ms
- pgvector 相似度查询待 Task 50 单独评估

## Consequences

- **Positive**: 无新依赖、Prisma 类型安全、CTE 性能远超指标（< 10ms vs 100ms 目标）
- **Positive**: 环检测模式已验证，可直接用于生产查询
- **Negative**: CTE 语法较复杂，需封装为可复用的查询函数
- **Negative**: Prisma 不原生支持 CTE，需使用 `$queryRaw`
- **已消除风险**: Neo4j 不需要，PostgreSQL CTE 方案性能充足
