# Sprint 4a: Skill 插件基础设施 (Week 7)

## 目标

构建 Skill 插件系统的核心基础设施：IPC 沙箱运行时、bundle 打包格式、Schema Adapter、动态注册表。不交付用户功能。

## 用户故事范围

无用户故事。本 Sprint 是基础设施 Sprint。

## 任务清单

### Week 7

- [ ] 38. IPC 协议设计 + 沙箱运行时原型
  - 定义 SkillRequest / SkillResponse 消息格式
  - worker_threads 沙箱：加载 bundle → 执行 → IPC 代理
  - 实现 SkillContext（callAI / readMemory / writeMemory）
  - 安全约束：超时 + 内存限制 + 禁止非 IPC 外部访问
  - 产出：SkillRuntime + IPC 代理 + 安全测试

- [ ] 39. Skill bundle 打包格式 + 脚手架 CLI + Schema Adapter
  - 定义 bundle 结构（manifest.json + schema.json[Canonical JSON Schema] + compiled JS）
  - Schema Adapter：Canonical JSON Schema → Provider 特定格式（OpenAI/Anthropic/Ollama）
  - Skill 脚手架 CLI（交互式创建：名称→描述→参数→生成模板文件）
  - Skill 打包 CLI（验证 manifest + 编译 TS + 打包 ZIP → 上传 MinIO）
  - 产出：打包规范 + 脚手架 CLI + 打包 CLI + Schema Adapter + 1 个示例 bundle

- [ ] 40. SkillDefinition DB schema + 动态注册表
  - Prisma model: SkillDefinition
  - SkillRegistry：从 DB 加载 ACTIVE Skill → 缓存 → 提供给 Agent Runner
  - 管理 API：注册/启用/禁用/查询（tRPC procedures）
  - 产出：schema + migration + 注册表代码

- [ ] 41. 示例 Skill 端到端验证
  - 创建 echo_skill（简单的 echo Skill，测试 IPC 完整流程）
  - 创建 harness_call_skill（调用 AI 的 Skill，验证 IPC → Harness 链路）
  - 打包 → 上传 → 注册 → 通过 IPC 调用 → 验证结果
  - 产出：2 个示例 Skill + 端到端测试

- [ ] 42. Skill 沙箱安全测试
  - 测试：Skill 尝试 require('fs') → 应被拦截
  - 测试：Skill 超时 → Worker 被终止
  - 测试：Skill 内存超限 → Worker 被终止
  - 测试：Skill 尝试访问 process.env → 应被拦截
  - 产出：安全边界测试套件

## 验证清单

- [ ] IPC 沙箱能安全执行 Skill 代码（隔离环境、超时终止、内存限制）
- [ ] Skill bundle 打包 → 上传 → 注册 → 执行端到端流程通过
- [ ] Skill 通过 IPC 调用 Harness 管道成功
- [ ] Skill 通过 IPC 读写 Memory 层成功
- [ ] 安全测试全部通过（文件系统/网络/env 访问被拦截）
- [ ] SkillDefinition 表 CRUD 正常
- [ ] SkillRegistry 正确过滤 ACTIVE Skill
- [ ] Schema Adapter 正确将 Canonical JSON Schema 转为 OpenAI/Anthropic/Ollama 格式

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过
- `npm test` 通过（含新增测试）
- `npm run lint` 通过
