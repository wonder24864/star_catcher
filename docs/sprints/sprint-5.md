# Sprint 5: Knowledge Graph + Question Understanding Agent (Week 9)

## 目标

基于 Sprint 4a/4b 的基础设施，交付 Phase 2 第一批用户功能：知识图谱管理��题目知识点映射 Agent、Skill 管理界面。

## 用户故事范围

- US-031: Knowledge Graph 数据导入
- US-032: Knowledge Graph 管理界面
- US-033: Question Understanding Agent
- US-034: Skill 管理界面

## 任务清单

### Week 9

- [x] 51. Knowledge Graph CRUD tRPC Router
  - 知识点树增删改查 API（adminProcedure）
  - 关系管理（添加/删除 + PREREQUISITE 环检测��
  - 批量审核（pending_review → approved/rejected）
  - 产出：router 代码 + 单元测试

- [x] 52. 教材目录提取 Skill (extract-knowledge-points)
  - 第一个生产 Skill bundle（manifest + schema + execute）
  - AI 从教材目录结构提取知识点层级树
  - 对应 Harness 三件套（schema + prompt + operation）
  - 产出：Skill bundle + Operation + 测试

- [x] 53. KG 数据导入 Job + 管理页面
  - BullMQ Job: PDF → 目录提取 → Skill 调用 → 入库
  - 管理页面三 Tab：知识点树 / 导入管理 / 待审核
  - MinIO presigned URL 上传
  - 产出：Worker handler + 管理页面 + i18n

- [x] 54. search-knowledge-points Skill
  - 纯 DB 查询 Skill（不调 AI）
  - 扩展 SkillRuntime IPC 协议：新增 `query` 方法（白名单查询）
  - 产出：Skill bundle + IPC 扩展 + 测试

- [x] 55. classify-question-knowledge Skill
  - AI 分类 Skill：判断题目与候选知识点的关联置信度
  - 对应 Harness 三件套
  - 产出：Skill bundle + Operation + 测试

- [x] 56. Question Understanding Agent
  - AgentDefinition + BullMQ Job handler
  - 触发：CheckSession COMPLETED 时自动入队
  - 幂等 + KG 为空时优雅跳过
  - 写入 QuestionKnowledgeMapping（多对多，一题多知识点）
  - 产出：Agent 定义 + handler + 集成测试（fixture 预录响应）

- [x] 57. Skill 管理页面
  - 管理员 Skill 列表 + 状态切换 + 上传 + 详情
  - 复用已有 skill router
  - 产出：管理页面 + i18n

## 验证清单

- [ ] KnowledgePoint CRUD 全部 adminProcedure 保护
- [ ] 添加 PREREQUISITE 关系时环检测生效（CTE 验证）
- [ ] PDF 上传 → 目录提取 → AI 解析 → 入库 全链路
- [ ] extract-knowledge-points Skill 在 IPC 沙箱中运行
- [ ] Question Understanding Agent ≥ 2 步循环完成知识点映射
- [ ] 一题映射多知识点（QuestionKnowledgeMapping 多条记录��
- [ ] Agent 超步数/超 Token 时正确终���
- [ ] 幂等���同一题目不重复分析
- [ ] KG 为空时 Agent 优雅跳过
- [ ] Skill 状态切换立即生效（Registry invalidate）
- [ ] 所有用户可见字符串使用 i18n key
- [ ] `npm test` 通过
- [ ] `tsc --noEmit` 无错误

## 关键设计决策

| # | ���策 | 方案 | 原因 |
|---|------|------|------|
| D1 | Skill DB 查询 | 扩展 IPC `query` 方法 + host 白名单 | ADR-008 禁止 Skill 直接 Prisma |
| D2 | KP 审核状态 | metadata.importStatus 字段 | ���免 enum migration 风险 |
| D3 | 知识点数据源 | 教材目录结构提取（非全文） | 成本低(3-5K tokens/本)，准确率高 |
| D4 | 一题多知识点 | QuestionKnowledgeMapping 多对多 + confidence | 期末综合题跨章节考点 |

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过
- `npm test` 通过（含新增测试）
- `tsc --noEmit` 无错误
- i18n 中英双语覆盖
