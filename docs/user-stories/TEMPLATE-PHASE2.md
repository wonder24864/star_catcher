# Phase 2 用户故事模板

> Phase 2 用户故事在 Phase 1 格式基础上扩展 Agent 专属字段。
> 仅涉及 Agent 的用户故事需填写 Agent 专属字段部分。

---

## US-NNN: [标题]

**As a** [角色]
**I want to** [行为]
**So that** [价值]

**验收标准：**
- [ ] ...

**边界条件：**
- ...

**性能要求：**
- ...

---

### Agent 专属字段（仅 Agent 相关故事需填写）

**Skill 依赖**:
| Skill | 用途 |
|-------|------|
| skill_name | 说明 |

**Agent 循环终止条件**:
- 最大步数: N
- 决策停止条件: [Agent 自主判断停止的条件描述]
- Token 预算: N tokens

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| skill_name 失败 | [策略] |
| 全部 Skill 不可用 | [兜底行为] |

**成本约束**:
- 单次 Agent 会话 Token 上限: N
- 每日用户 Agent 调用上限: N
