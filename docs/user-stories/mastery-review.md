# Mastery Review 用户故事

## US-038: 间隔复习调度

**As a** 系统（自动触发）
**I want to** 使用 SM-2 间隔复习算法，为每个薄弱知识点自动计算下次复习时间
**So that** 学生能按科学的间隔规律复习，最大化记忆保持效率

**验收标准：**
- [ ] 学生改正答对后（NEW_ERROR → CORRECTED），系统自动转换为 REVIEWING 并创建首次复习调度（interval=1天）
- [ ] 已掌握知识点再次出错（MASTERED → REGRESSED）后，自动转换为 REVIEWING 并重新调度
- [ ] SM-2 算法实现为纯函数：输入 (quality, repetition, interval, easeFactor) → 输出 (newInterval, newEaseFactor, newRepetition)
- [ ] easeFactor 下限为 1.3，防止间隔过短
- [ ] scheduleReview 持久化 easeFactor 和 consecutiveCorrect（非仅 intervalDays）
- [ ] 所有自动状态转换记录在 InterventionHistory（审计链）

**边界条件：**
- 自动转换 best-effort：失败仅 warn 日志，不影响显式转换结果
- 首次复习：interval=1 天，easeFactor=2.5，consecutiveCorrect=0
- ReviewSchedule 不存在时首次 scheduleReview 自动创建（upsert 语义）
- 并发场景：乐观锁保护 MasteryState，auto-transition 每次重新 findUnique 获取最新版本

**性能要求：**
- SM-2 计算 < 1ms（纯数学运算）
- 自动转换链 < 200ms（2 次 DB roundtrip）

---

## US-039: 复习任务通知

**As a** 学生
**I want to** 在首页看到今天需要复习的知识点列表
**So that** 能及时完成复习，避免遗忘

**验收标准：**
- [ ] 学生首页新增 "Today's Reviews" widget
- [ ] 展示到期的复习知识点数量（badge）和列表（最多 5 个，含学科 + 知识点名称）
- [ ] 每个知识点有 "Start Review" 按钮，跳转到掌握地图的复习对话框
- [ ] 无到期复习时显示空状态："今天没有复习任务"
- [ ] 家长视角：显示选中子女的待复习数量
- [ ] 掌握地图页面增强：REVIEWING 状态卡片显示 nextReviewAt、到期项显示 "Overdue" 徽章
- [ ] 新增 "OVERDUE" 客户端筛选条件

**边界条件：**
- 学生无 ReviewSchedule 记录时：widget 不显示（非显示空列表）
- 同时有多个到期：按 nextReviewAt ASC 排序（最久未复习的排在前）
- 家长查看时：需验证 family 关系

**性能要求：**
- todayReviews 查询 < 500ms
- 首页加载不因 widget 阻塞

---

## US-040: 掌握度评估

**As a** 学生
**I want to** 完成复习后提交自评结果，系统根据结果重新评估掌握状态
**So that** 掌握状态能真实反映我的学习进度

**验收标准：**
- [ ] 掌握地图页面新增复习对话框（Dialog 模式）
- [ ] 对话框展示：知识点名称 + 关联错题作为复习素材
- [ ] 学生自评：是否答对（Yes/No）+ 难度评分（1-5 星）
- [ ] 自评映射为 SM-2 quality 0-5：答对+简单=5，答对+中等=4，答对+困难=3，答错=0-1
- [ ] 答对（quality ≥ 3）：SM-2 计算新 interval/EF，更新 ReviewSchedule，递增 correctAttempts/totalAttempts
- [ ] 连续答对 3 次（consecutiveCorrect ≥ 3）：REVIEWING → MASTERED
- [ ] 答错（quality < 3）：REVIEWING → REGRESSED → 自动 REVIEWING + 重新调度（interval=1）
- [ ] 提交后反馈：MASTERED=庆祝消息，REVIEWING=下次复习日期，REGRESSED=明天再复习
- [ ] 每次复习结果记录 InterventionHistory（type=REVIEW）

**边界条件：**
- submitReview 仅限 STUDENT 角色
- 非 REVIEWING 状态的知识点不允许提交复习（返回错误）
- ReviewSchedule 不存在时（异常情况）：创建默认 schedule 再处理
- 复习结果实时反映在掌握地图（tRPC invalidation）

**性能要求：**
- submitReview 响应 < 1s（含 SM-2 + DB 更新）
- 对话框素材加载 < 2s
