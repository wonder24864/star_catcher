# 开发路线图

## Phase 1: 基础错题本 (MVP)

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 1 | Week 1-2 | 基础架构 + 用户系统 + 家庭组 (US-001~007) | 已完成 |
| Sprint 2 | Week 3-4 | 作业录入 + AI Harness + AI 识别 + 多轮检查 (US-008~019) | 已完成 |
| Sprint 3 | Week 5-6 | 家长视图 + 错题管理 + PWA + 部署 (US-020~030) | 已完成 |

### Sprint 3 验收摘要 (2026-04-10)

- 测试: 23 文件, 350 passed, 0 failed
- 构建: `next build` 成功，28 路由
- AI 识别: 13.55s / 30s 限制 (PASS)
- 页面加载: 0.2s / 3s 限制 (PASS)
- 验收中发现并修复 4 个 Bug (middleware 冲突、recharts 类型、textarea 缺失、Azure API 参数)

### Phase 1 交付物

- 用户注册/登录/家庭组管理
- 拍照上传 → AI 识别 → 判分 → 多轮改正 → 渐进式求助
- 错题自动入本 + 去重 + 家长备注
- 家长概览/统计/策略设置
- 管理员用户管理/系统配置
- PWA + 中英双语 + Docker 部署

## Phase 2: AI 理解 + 知识图谱

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 4a | Week 7 | Skill 插件基础设施（IPC 沙箱 + 打包 + 注册表）| 已完成 |
| Sprint 4b | Week 8 | Agent Runner + Memory + KG schema + Harness 新组件 | 未开始 |
| Sprint 5 | Week 9 | Knowledge Graph + Question Understanding Agent | 未开始 |
| Sprint 6 | Week 10 | Diagnosis Agent + Student Memory | 未开始 |
| Sprint 7 | Week 11 | Mastery Tracking + 间隔复习 | 未开始 |
| Sprint 8 | Week 12 | Parent Reports v1 + Agent Trace 可视化 + Phase 2 收尾 | 未开始 |

### Phase 2 目标交付物

- Skill 插件系统（IPC 沙箱隔离，管理员可上传/启用/禁用 Skill）
- Knowledge Graph schema + 知识点数据导入
- Question Understanding Agent（题目 → 知识点映射）
- Diagnosis Agent（错题模式分析 + 薄弱环节诊断）
- Student Memory 层（掌握状态机 + 复习调度 + 干预历史）
- Mastery Tracking（SM-2 间隔复习算法）
- 4 个新 Harness 组件（CircuitBreaker, SemanticCache, CostTracker, AgentStepLimiter）
- Agent Trace 可视化（管理员完整 trace + 家长/学生简化版）
- Parent Reports v1（周报/月报，知识点维度）

### Phase 2 待完成事项

> 以下事项需在各 Sprint 开始时完成，此处记录以防遗漏：
> - [ ] Sprint 5 开始时：写 US-031~034 完整用户故事
> - [ ] Sprint 6 开始时：写 US-035~037 完整用户故事
> - [ ] Sprint 7 开始时：写 US-038~040 完整用户故事
> - [ ] Sprint 8 开始时：写 US-041~043 完整用户故事

## Phase 3: 学习闭环 + 干预（Learning Brain 全局编排）

> **重要**：Phase 3 在 Phase 2 基础设施上实现完整学习闭环。
> 核心新增：**Learning Brain**（事件驱动全局编排器），见 ADR-011。

| 方向 | 内容 |
|------|------|
| Learning Brain | 事件驱动全局编排器：新错题/复习到期/掌握下降 → 自动选择 Agent |
| 事件系统 | DB 变更事件触发 Brain 循环 |
| 干预规划 Agent | 长期学习规划 + 干预策略选择 |
| 今日任务包 | 类似题推荐 + 练习卡 + 讲解卡 |
| 掌握评估 Agent | 复习后重新评估掌握状态 |
| 完整闭环 | 错题 → 诊断 → 推荐 → 练习 → 评估 → 掌握/回退 |

## Phase 4: 家长仪表盘 + 体验优化

完整家长仪表盘、详细分析报告、AI 学习建议、干预追踪、儿童友好 UI 优化

## Phase 5: 持续优化

Learning Brain 全局编排、本地模型部署(Ollama/vLLM)、Android APK、多教材版本支持、安全增强
