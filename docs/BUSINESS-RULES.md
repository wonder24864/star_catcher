# Star Catcher - 业务规则与边界条件

> 本文档定义跨模块、跨 Sprint 的业务不变量。实现时所有规则均需对应测试覆盖。

## 1. 图片处理规则

- 上传前客户端自动检测 EXIF 方向信息并自动纠正旋转
- 客户端压缩策略：Canvas API 压缩，目标 ≤ 4MB，JPEG 质量 0.85
- 压缩后宽度上限 4096px（保持高清可识别）
- 自动剥离 EXIF 中的 GPS 等隐私信息（`HomeworkImage.privacyStripped` 标记）
- 无 EXIF 信息时，OCR prompt 中加入方向纠正指令（见 ADR-001）

## 2. 得分计算规则

- 基础算法：`score = (correctCount / totalQuestions) * 100`，四舍五入取整
- 如果试卷有标注分值，按题目分值加权计算
- 多轮检查：每轮独立计分，`HomeworkSession.finalScore` 取最后一轮得分
- 求助不影响得分（不扣分也不加分）
- 待确认题目（`needsReview = true`）暂按"错"计算，用户修正后重新计分

## 3. 错题去重规则

- 录入新错题时，计算 `contentHash = SHA256(normalize(content))`
- `normalize`：去除空格、标点统一、数字格式化
- 如果 `(studentId, contentHash)` 已存在，不创建新记录，改为更新 `totalAttempts + 1`
- 手动录入的错题也走去重逻辑
- 详见 ADR-005

## 4. 并发与锁定规则

### 乐观锁实现

- 写操作使用 Prisma `update` 的 WHERE 条件加上 `updatedAt` 字段
- 流程：读取当前 `updatedAt` → `update WHERE { id, updatedAt }` → 受影响行数为 0 则冲突
- 冲突响应：i18n key `error.dataConflict`（"数据已被修改，请刷新后重试"）
- 需要锁的操作：`submitCorrection`、`batchUpdateQuestions`、`requestHelp`
- 详见 ADR-006

### 求助缓存策略

- 同一题同一 Level 只执行一次 AI 调用
- 先查 `HelpRequest WHERE { sessionQuestionId, level }`（记录仅在 AI 成功返回后写入，存在即为已完成）
- 有记录 → 返回已有 `aiResponse`；无记录 → 调用 AI Harness

### 读写并发

- 家长和学生可同时查看同一数据（读操作无锁）
- 写操作互斥通过乐观锁保证
- Phase 1 不实现实时推送（无 WebSocket），家长刷新获取最新状态

## 5. 会话与 Token 规则

- JWT Token 有效期 7 天
- Token 过期时，前端缓存未提交的改正数据到 localStorage
- 重新登录后提示 "您有未完成的检查，是否继续？"
- Remember Me：30 天有效的 Refresh Token

## 6. AI 调用限流

- 每用户每分钟最多 5 次 AI 调用（OCR + 求助合计）
- 每用户每天最多 100 次 AI 调用
- 超限返回友好提示（i18n key `error.rateLimitExceeded`）
- 管理员可在系统配置中调整限流参数
- 实现：Redis 滑动窗口（见 ARCHITECTURE.md）

## 7. 帮助等级解锁规则

- **Level 1 → Level 2**：学生在查看 Level 1 后必须提交至少一次**新**答案：
  - "新" 的定义：`trim(当前答案) !== trim(请求 Level 1 时提交的答案)`
  - 空字符串（`trim()` 后长度为 0）不算有效答案，不能解锁
- **Level 2 → Level 3**：同上规则（与请求 Level 2 时的答案比较）
- 如果学生提交的新答案经 AI 检查后正确，直接标记为已解决，跳过后续求助
- 如果家长设置 `maxHelpLevel = 1`，学生只能看到 Level 1，按钮灰显
- **校验位置**：`homework.requestHelp` tRPC procedure（业务层，不在 Harness 中）
- **Phase 1 限制**：不检测语义等价（如 "2+2" vs "2 + 2" 视为不同答案）。语义去重为 Phase 2+ 增强
- 详见 ADR-004

## 8. 图片方向自动纠正

- 上传时读取 EXIF Orientation 标签
- 自动旋转到正确方向后再发送到 AI
- 无 EXIF 信息时，AI Prompt 加入方向纠正指令
- `HomeworkImage.exifRotation` 记录纠正角度

## 9. 软删除约定

- `User`、`Family`、`ErrorQuestion` 使用 `deletedAt` 字段软删除
- 所有查询默认加 `WHERE deletedAt IS NULL`
- 使用 Prisma Client Extensions (`$extends`) 全局注入过滤

## 10. Locale 路由规则

- **首次访问 `/`** 时，按以下优先级重定向：
  1. 已登录用户：使用其账号设置的 `User.locale`
  2. 未登录用户：使用浏览器 `Accept-Language` header
  3. 都不可用：默认 `zh`
  4. 重定向到 `/[locale]/`（如 `/zh/` 或 `/en/`）
- **后续请求**：Locale 由 URL 前缀决定，不再重新检测
- **语言切换**：保持当前路径替换 locale 前缀，同时更新 `User.locale`
- 使用 next-intl middleware 处理 locale 路由

## 11. SessionQuestion 数据有效性

- 如果 `isCorrect` 不为 NULL，`studentAnswer` 必须有值
- 如果 `studentAnswer` 为 NULL，`isCorrect` 必须为 NULL
- 这些约束在应用层 Zod schema 和 tRPC procedure 中强制（Prisma 不支持条件约束）
