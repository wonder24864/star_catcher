# Skill 管理用户故事

## US-034: Skill 管理界面

**As a** 管理员
**I want to** 上传、启用/禁用 Skill bundle，查看 Skill 调用统计
**So that** 可以灵活管理 Agent 可用的能力集

**验收标准：**
- [ ] Skill 列表页：展示所有已注册 Skill（名称、版本、状态、调用次数、平均耗时）
- [ ] 状态切换：Toggle 开关切换 ACTIVE / DISABLED（立即生效，不影响正在执行的 Agent）
- [ ] 上传 Skill：上传 .zip bundle → 后端校验（manifest.json + schema.json + execute.js）→ 注册
- [ ] 上传校验失败时返回具体错误（缺少文件 / schema 不合法 / 版本冲突）
- [ ] Skill 详情页：查看 functionSchema、配置参数、版本历史
- [ ] 编辑 Skill 配置参数（timeout、cache TTL 等 config JSON 字段）
- [ ] Skill 调用日志：最近 50 条调用记录（时间、Agent 来源、耗时、成功/失败）

**边界条件：**
- 禁用有依赖的 Skill 时：警告管理员"以下 Agent 依赖此 Skill"（不强制阻止）
- Bundle 上传大小限制：5MB
- 同名 Skill 新版本上传：旧版本自动标记 DEPRECATED，新版本 DRAFT 待启用
- 删除 Skill：软删除（deletedAt），已有调用日志保留

**性能要求：**
- 列表加载：< 1s
- Bundle 上传 + 校验：< 5s
- 状态切换生效：< 500ms
