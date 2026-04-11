# Sprint 6: Diagnosis Agent + Student Memory (Week 10)

## 目标

基于 Sprint 5 交付的 Question Understanding Agent 和知识图谱映射，实现学习闭环的核心诊断环节：Diagnosis Agent 自动分析错题模式并定位薄弱知识点，Student Memory 自动追踪掌握度状态机流转，学生可查看知识点掌握地图。

## 用户故事范围

- US-035: Diagnosis Agent — 基于错题历史 + 知识图谱，自动诊断薄弱知识点
- US-036: 薄弱知识点报告 — 学生查看知识点掌握地图（已掌握/薄弱/新错）
- US-037: 学生学习状态追踪 — 系统自动追踪知识点掌握度状态机流转

## 任务清单

### Week 10

- [x] 58. US-035~037 用户故事 + DIAGNOSE_ERROR Harness 三件套
  - 用户故事文档 `docs/user-stories/diagnosis-mastery.md`
  - Zod schema（harness/schemas/diagnose-error.ts）：输出含 errorPattern + weakKnowledgePoints + recommendation
  - Prompt template（prompts/diagnose-error.ts）：英文 prompt + {{locale}} 输出语言控制
  - Operation（operations/diagnose-error.ts）：注册 DIAGNOSE_ERROR
  - Prisma migration：AIOperationType enum 新增 DIAGNOSE_ERROR
  - 产出：用户故事 + 三件套代码 + 单元测试

- [x] 59. 完善 diagnose-error Skill
  - 增强 schema.json 参数：knowledgePointIds, grade, errorHistory
  - 重写 execute.ts：callAI → readMemory → writeMemory 完整流程
  - 版本升至 1.1.0，重新打包 bundle
  - 产出：Skill bundle + 单元测试

- [x] 60. Diagnosis Agent 定义 + BullMQ Handler
  - Agent 定义（definitions/diagnosis.ts）：allowedSkills, maxSteps=6, maxTokens=12000
  - BullMQ handler（handlers/diagnosis.ts）：幂等检查 → KP 映射检查 → 30 天历史查询 → AgentTrace → AgentRunner → MasteryState 创建 → SSE
  - 队列类型和入队函数
  - 产出：Agent 定义 + handler + 队列集成 + 单元测试

- [x] 61. Mastery State 自动追踪集成
  - StudentMemoryImpl.ensureMasteryState()：upsert 语义（不存在→NEW_ERROR, MASTERED→REGRESSED, 其余递增）
  - QUA handler 成功路径末尾追加 enqueueDiagnosis() 链式触发
  - submitCorrections 答对路径：NEW_ERROR → CORRECTED 转换（null check 保护）
  - 产出：集成代码 + 单元测试

- [x] 62. Student Mastery tRPC Router
  - mastery.list / mastery.detail / mastery.weakPoints / mastery.stats
  - STUDENT 只看自己，PARENT 需 family 验证
  - 产出：router 代码 + 单元测试

- [x] 63. 掌握地图页面
  - 页面 /mastery：学科 Tab + 状态筛选 + 知识点卡片网格 + 详情 Sheet
  - 色标：NEW_ERROR=红 CORRECTED=橙 REVIEWING=蓝 MASTERED=绿 REGRESSED=紫
  - i18n mastery namespace 中英双语
  - 产出：页面 + 组件 + i18n + 导航入口

- [x] 64. Sprint 6 验证 + 自审
  - 执行验证清单
  - npm test + tsc --noEmit
  - 更新 ROADMAP.md
  - 产出：验证报告

## 验证清单

- [x] DIAGNOSE_ERROR 操作经过完整 Harness 管道
- [x] diagnose-error Skill 在 IPC 沙箱中运行，bundle 不含 Prisma import
- [x] Diagnosis Agent 由 QUA 完成事件链式触发
- [x] 同一 ErrorQuestion 不重复诊断（幂等检查）
- [x] KP 映射为空时 Diagnosis Agent 优雅跳过
- [x] 新错题自动创建 MasteryState（status = NEW_ERROR）
- [x] 已 MASTERED 的知识点再次出错 → REGRESSED 转换
- [x] 改正答对时 NEW_ERROR → CORRECTED 转换生效
- [x] CORRECTED 转换在 MasteryState 不存在时优雅跳过
- [x] MasteryState 并发更新受乐观锁保护
- [x] Mastery Router 权限：STUDENT 只看自己，PARENT 需 family 验证
- [x] 掌握地图页面五种状态色标正确显示
- [x] Agent maxSteps=6 / Token 预算=12000 限制生效
- [x] AgentTrace + AgentTraceStep 完整记录诊断过程
- [x] 所有用户可见字符串使用 i18n key
- [x] npm test 通过 + tsc --noEmit 无错误

## 关键设计决策

| # | 决策 | 方案 | 原因 |
|---|------|------|------|
| D1 | 触发方式 | QUA handler 成功末尾 enqueueDiagnosis 链式触发 | Phase 3 事件驱动前置方案，比 cron 轮询更及时 |
| D2 | MasteryState 创建时机 | Diagnosis Agent handler 中（非 completeSession） | completeSession 时 KP 映射尚不存在 |
| D3 | CORRECTED 触发点 | submitCorrections 答对路径 | 最自然的时机，同步路径立即生效 |
| D4 | 分析窗口 | 最近 30 天 Real-time 层 | Sprint 6 仅 Real-time；Periodic/Global 留 Sprint 7+ |
| D5 | ensureMasteryState 语义 | Upsert 幂等（create/regress/increment） | 多题同 KP 幂等安全，MASTERED 回退是 ADR-010 核心 |
| D6 | 掌握地图 UI | 卡片网格 + 色标（非树形图） | 移动端友好，K-12 学生易理解 |
| D7 | CORRECTED 空保护 | MasteryState 不存在时跳过 | QUA/Diagnosis 异步未完成时不报错 |

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过
- `npm test` 通过（含新增测试）
- `tsc --noEmit` 无错误
- i18n 中英双语覆盖
- ROADMAP.md Sprint 6 状态更新
