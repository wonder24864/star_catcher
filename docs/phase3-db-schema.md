# Phase 3 DB 模型设计（Sprint 10a 迁移）

> 从 PHASE3-LAUNCH-PLAN.md §八独立出来，供 Sprint 10a Task 90 使用。

## 新增模型

```prisma
// 今日任务包
enum DailyTaskPackStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model DailyTaskPack {
  id             String              @id @default(cuid())
  studentId      String
  date           DateTime            @db.Date
  status         DailyTaskPackStatus @default(PENDING)
  totalTasks     Int                 @default(0)
  completedTasks Int                 @default(0)
  createdAt      DateTime            @default(now()) @db.Timestamptz
  updatedAt      DateTime            @updatedAt @db.Timestamptz

  student User        @relation("StudentDailyPacks", fields: [studentId], references: [id])
  tasks   DailyTask[]

  @@unique([studentId, date])
  @@index([studentId, status])
}

// 单个任务项
enum DailyTaskType {
  REVIEW
  PRACTICE
  EXPLANATION
}

enum DailyTaskStatus {
  PENDING
  COMPLETED
}

model DailyTask {
  id               String          @id @default(cuid())
  packId           String
  type             DailyTaskType
  knowledgePointId String
  questionId       String?         // 关联的错题（REVIEW/PRACTICE 时）
  content          Json?           // 任务详情
  status           DailyTaskStatus @default(PENDING)
  completedAt      DateTime?       @db.Timestamptz
  sortOrder        Int             @default(0)
  createdAt        DateTime        @default(now()) @db.Timestamptz

  pack           DailyTaskPack  @relation(fields: [packId], references: [id], onDelete: Cascade)
  knowledgePoint KnowledgePoint @relation(fields: [knowledgePointId], references: [id])
  question       ErrorQuestion? @relation(fields: [questionId], references: [id])

  @@index([packId, sortOrder])
  @@index([knowledgePointId])
}

// 薄弱分析快照
enum WeaknessTier {
  REALTIME   // 实时（30天）- Phase 2 已有逻辑，此处存储快照
  PERIODIC   // 定期（学期内）
  GLOBAL     // 全局（全历史）
}

model WeaknessProfile {
  id         String       @id @default(cuid())
  studentId  String
  tier       WeaknessTier
  data       Json         // { weakPoints: [{kpId, severity, trend, errorCount}], summary }
  generatedAt DateTime    @db.Timestamptz
  validUntil  DateTime?   @db.Timestamptz
  createdAt  DateTime     @default(now()) @db.Timestamptz

  student User @relation("StudentWeakness", fields: [studentId], references: [id])

  @@index([studentId, tier, generatedAt])
}
```

## 现有模型字段扩展

```prisma
// ParentStudentConfig 新增字段
model ParentStudentConfig {
  // ... existing fields ...
  maxDailyTasks     Int      @default(10)    // 每日最大任务数
  learningTimeStart String?  @db.VarChar(5)  // HH:MM 格式
  learningTimeEnd   String?  @db.VarChar(5)  // HH:MM 格式
}

// MasteryState 新增字段
model MasteryState {
  // ... existing fields ...
  archived Boolean @default(false) // 年级过渡归档
  // 新增索引
  @@index([studentId, archived, status])
}

// ErrorQuestion 新增字段（Sprint 13）
model ErrorQuestion {
  // ... existing fields ...
  embedding Unsupported("vector(1536)")? // pgvector embedding for similarity search
}

// AIOperationType 新增枚举值
enum AIOperationType {
  // ... existing values ...
  WEAKNESS_PROFILE
  INTERVENTION_PLAN
  MASTERY_EVALUATE
  FIND_SIMILAR
  GENERATE_EXPLANATION
  EVAL_JUDGE           // Sprint 16: AI 评判输出质量
}

// InterventionType 新增枚举值
enum InterventionType {
  // ... existing values ...
  PRACTICE       // Brain 编排决策记录
  BRAIN_DECISION // Brain 编排决策记录
}
```
