# ADR-009: 知识图谱存储方案

## Status
Proposed (Sprint 4b) — Sprint 4b Spike 验证后确认

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

## Decision (初始提案，待 Sprint 4b 验证)

使用 **PostgreSQL + 关系表 + recursive CTE**，原因：
- 复用现有 Prisma + PostgreSQL 技术栈，不引入新基础设施
- 关系表（KnowledgePoint + KnowledgeRelation）可用 Prisma 管理
- recursive CTE 支持前置知识点的递归查询
- KnowledgePoint 表预留 pgvector 列（embedding），用于未来语义相似搜索

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

### Sprint 4b 验证指标

- recursive CTE 查前置链 ≤ 5 层的延迟 < 100ms
- 1000 个知识点 + 5000 条关系下查询性能可接受
- pgvector 相似度查询延迟 < 50ms（如不满足，记录替代方案）

## Consequences

待 Sprint 4b 验证后补充。

初步评估：
- **Positive**: 无新依赖、Prisma 类型安全、pgvector 已有生态
- **Negative**: 深度递归查询可能慢于原生图数据库、CTE 语法较复杂
- **Risk**: 如果图查询性能不达标，可能需要引入 Neo4j（增加运维成本）
