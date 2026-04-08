# Star Catcher - Phase 1 PRD

> **需求文档**：[docs/REQUIREMENTS.md](./REQUIREMENTS.md)
> **方法论**：RALPH (Rapid Alignment Plan Hub)
> **开发者**：独立开发者
> **目标周期**：~6周

---

## 1. Phase 1 概述

### 1.1 目标
构建可用的基础错题本系统，实现从"拍照上传→AI识别→判分→多轮改正"的核心检查流程，支持学生和家长两个角色的基本使用场景。

### 1.2 Phase 1 范围

**包含：**
- 用户认证系统（注册/登录/角色）
- 家庭组管理（创建/邀请/绑定）
- 作业录入（拍照/上传/手动/PDF）
- AI识别与判分（Azure OpenAI GPT-5.4）
- 多轮作业检查流程（检查→得分→改正→再检查）
- 错题管理与浏览
- 家长每日作业检查记录
- PWA 支持
- 中英双语
- Docker Compose 部署

**不包含（后续Phase）：**
- 知识图谱构建
- 深度薄弱分析
- 干预规划与今日任务包
- 类似题检索/生成
- 讲解卡/练习卡
- 遗忘曲线排程
- 家长详细分析仪表盘

### 1.3 RALPH 迭代规划

| Sprint | 周期 | 交付物 |
|--------|------|--------|
| Sprint 1 | Week 1-2 | 基础架构 + 用户系统 + 家庭组 |
| Sprint 2 | Week 3-4 | 作业录入 + AI识别 + 多轮检查流程 |
| Sprint 3 | Week 5-6 | 家长视图 + 错题管理 + PWA + 部署 |

---

## 2. 用户故事与功能规格

### 2.1 用户认证模块

#### US-001: 用户注册
**As a** 新用户
**I want to** 用用户名和密码注册账号
**So that** 我可以开始使用错题本系统

**验收标准：**
- [ ] 用户可输入用户名、密码、确认密码、昵称进行注册
- [ ] 用户名唯一校验，4-32字符，支持字母数字下划线
- [ ] 密码最少8位，必须包含字母和数字
- [ ] 注册时选择角色：学生 或 家长
- [ ] 学生注册需额外填写：年级（小学1-6/初中1-3/高中1-3）
- [ ] 注册成功后自动登录并跳转首页
- [ ] 注册失败显示具体错误原因
- [ ] 支持中/英文界面

**功能规格：**

| 字段 | 类型 | 必填 | 规则 |
|------|------|------|------|
| username | string | 是 | 4-32字符，`^[a-zA-Z0-9_]+$`，唯一 |
| password | string | 是 | 8-128字符，至少含1字母1数字 |
| confirmPassword | string | 是 | 必须与password一致 |
| nickname | string | 是 | 1-32字符 |
| role | enum | 是 | STUDENT / PARENT |
| grade | enum | 学生必填 | PRIMARY_1 ~ PRIMARY_6 / JUNIOR_1 ~ JUNIOR_3 / SENIOR_1 ~ SENIOR_3 |
| locale | enum | 否 | zh / en，默认zh |

**边界条件：**
- 用户名已存在 → 提示"用户名已被使用"
- 密码不符合规则 → 实时提示密码要求
- 网络错误 → 提示"网络异常，请重试"

---

#### US-002: 用户登录
**As a** 已注册用户
**I want to** 用用户名和密码登录
**So that** 我可以访问我的错题本

**验收标准：**
- [ ] 用户名+密码登录
- [ ] 登录成功后根据角色跳转不同首页（学生→作业检查页，家长→每日概览页）
- [ ] 登录失败提示"用户名或密码错误"（不区分具体原因）
- [ ] JWT Token 有效期7天，支持自动续期
- [ ] 30天内记住登录状态（Remember Me）
- [ ] 连续5次登录失败锁定账号15分钟

**边界条件：**
- Token过期 → 自动跳转登录页
- 账号被锁定 → 提示剩余锁定时间

---

#### US-003: 修改个人信息
**As a** 登录用户
**I want to** 修改我的昵称、密码、年级（学生）和语言偏好
**So that** 我的信息保持最新

**验收标准：**
- [ ] 可修改昵称
- [ ] 修改密码需验证旧密码
- [ ] 学生可修改年级（升年级场景）
- [ ] 可切换界面语言（中/英）
- [ ] 修改成功即时生效

---

### 2.2 家庭组模块

#### US-004: 创建家庭组
**As a** 家长
**I want to** 创建一个家庭组
**So that** 我可以管理孩子的学习数据

**验收标准：**
- [ ] 家长可创建家庭组，输入家庭组名称
- [ ] 创建后自动成为组主（OWNER）
- [ ] 生成唯一邀请码（6位字母数字，24小时有效）
- [ ] 可重新生成邀请码
- [ ] 一个家长可创建多个家庭组
- [ ] 家庭组名称 1-32 字符

---

#### US-005: 邀请成员加入家庭组
**As a** 家庭组主
**I want to** 邀请其他家长或学生加入我的家庭组
**So that** 我们可以共同管理孩子的学习

**验收标准：**
- [ ] 通过分享邀请码邀请
- [ ] 被邀请人输入邀请码后看到家庭组名称，确认加入
- [ ] 家长加入后成为组成员（MEMBER），可查看组内所有学生数据
- [ ] 学生加入后绑定到该家庭组
- [ ] 邀请码过期后提示"邀请码已失效"
- [ ] 同一用户不能重复加入同一家庭组

**边界条件：**
- 邀请码不存在 → "邀请码无效"
- 邀请码过期 → "邀请码已过期，请联系家长重新生成"
- 已在组内 → "您已经是该家庭组的成员"

---

#### US-006: 管理家庭组成员
**As a** 家庭组主
**I want to** 查看和管理家庭组成员
**So that** 我可以控制谁能访问我孩子的数据

**验收标准：**
- [ ] 查看成员列表（角色、昵称、加入时间）
- [ ] 组主可移除成员（除自己外）
- [ ] 移除确认弹窗
- [ ] 成员自己可退出家庭组
- [ ] 组主退出时需先转让组主或解散家庭组

---

#### US-007: 家长切换查看不同学生
**As a** 家长
**I want to** 在多个孩子之间切换查看
**So that** 我可以分别了解每个孩子的情况

**验收标准：**
- [ ] 家长顶部显示当前查看的学生，可下拉切换
- [ ] 切换后所有数据视图更新为该学生的数据
- [ ] 如果家庭组内无学生，提示邀请学生加入
- [ ] 记住上次查看的学生（下次登录默认显示）

---

### 2.3 作业录入模块

#### US-008: 拍照上传作业（单张）
**As a** 学生或家长
**I want to** 拍一张照片上传作业
**So that** 系统可以识别并检查作业内容

**验收标准：**
- [ ] 点击拍照按钮调用设备摄像头（PWA模式 + 普通浏览器）
- [ ] 拍照后预览图片，可重拍或确认上传
- [ ] 也支持从相册/文件选择已有图片上传
- [ ] 上传时显示进度条
- [ ] 上传后进入AI识别流程（显示"正在识别..."加载状态）
- [ ] 支持的图片格式：JPG/PNG/HEIC/WebP
- [ ] 单张图片最大 20MB
- [ ] 图片上传后存储到 MinIO

**功能规格：**
- 摄像头调用：`navigator.mediaDevices.getUserMedia` + `<input type="file" accept="image/*" capture="environment">`
- 图片压缩：上传前客户端压缩到 ≤4MB（保持清晰度）
- 上传接口：`POST /api/upload/image` → 返回 imageId

---

#### US-009: 多张拍照拼接
**As a** 学生或家长
**I want to** 拍多张照片组成一份完整试卷
**So that** 一张照不下的长试卷也能完整录入

**验收标准：**
- [ ] 支持连续拍多张照片（最多10张/次）
- [ ] 每张拍完后显示缩略图列表，可添加更多或删除
- [ ] 点击"完成"后将多张图片关联为同一份作业
- [ ] AI按照片顺序识别并合并结果
- [ ] 可调整照片顺序（拖拽排序）

---

#### US-010: 手动录入错题
**As a** 学生或家长
**I want to** 手动输入一道错题
**So that** 不方便拍照时也能记录错题

**验收标准：**
- [ ] 输入题目内容（富文本，支持数学公式输入）
- [ ] 输入学生的错误答案（可选）
- [ ] 输入正确答案（可选）
- [ ] **系统自动识别学科**（不需要手动选择），用户可修正
- [ ] 系统自动识别内容类型（试卷题/生字抄写/课文默写/口算等）
- [ ] 支持数学公式输入（LaTeX 或可视化公式编辑器）
- [ ] 保存成功后进入错题列表

**功能规格：**
- 公式编辑器：使用 MathQuill 或类似的可视化数学输入组件
- 学科自动识别：调用 AI 分析输入内容判断学科
- 内容类型识别：试卷题/生字抄写/课文默写/口算/英语听写等

---

#### US-011: PDF上传识别
**As a** 学生或家长
**I want to** 上传试卷的PDF文件
**So that** 电子版试卷可以直接导入系统

**验收标准：**
- [ ] 支持 PDF 文件上传（最大 50MB）
- [ ] PDF转图片后走 OCR 识别流程
- [ ] 多页PDF自动识别为同一份试卷
- [ ] 上传进度显示
- [ ] 不合格的PDF（加密/扫描质量太差）给出明确提示

---

#### US-012: 截图上传
**As a** 学生或家长
**I want to** 从剪贴板粘贴截图上传
**So that** 从其他App截图可以快速录入

**验收标准：**
- [ ] 支持 Ctrl+V / Cmd+V 粘贴截图
- [ ] 支持从文件选择器选择截图
- [ ] 截图走标准 OCR 识别流程

---

### 2.4 AI识别与判分模块

#### US-013: AI识别试卷内容
**As a** 系统
**I want to** 用AI识别上传的作业图片内容
**So that** 自动提取每道题的题目、学生答案

**验收标准：**
- [ ] 调用 Azure OpenAI GPT-5.4 Vision 能力识别图片
- [ ] 自动切割识别每道题目
- [ ] 提取每题：题号、题目内容、学生答案
- [ ] 自动识别学科（数学/语文/英语/物理/化学/生物/政治/历史/地理）
- [ ] 自动识别内容类型（试卷/作业/抄写/默写/口算等）
- [ ] 自动识别年级（如果可以判断）
- [ ] 支持手写体识别
- [ ] 支持中英双语内容
- [ ] 支持数学公式、化学方程式
- [ ] 识别结果以结构化JSON返回
- [ ] 识别失败给出明确提示

**功能规格：**

AI Prompt 策略：
```
系统角色：你是一个专业的试卷/作业识别助手。
输入：作业/试卷的图片
输出要求：
1. 识别每道题目的题号、题目内容、学生的答案
2. 判断学科和内容类型
3. 如果能判断出年级，给出年级信息
4. 对于每道题，根据你的知识判断学生答案是否正确
5. 输出为结构化JSON格式
```

输出格式：
```json
{
  "subject": "MATH",
  "contentType": "EXAM",
  "grade": "PRIMARY_3",
  "totalQuestions": 15,
  "questions": [
    {
      "number": 1,
      "type": "FILL_BLANK",
      "content": "25 + 38 = ___",
      "studentAnswer": "53",
      "correctAnswer": "63",
      "isCorrect": false,
      "confidence": 0.95
    }
  ]
}
```

**性能要求：**
- 单张图片识别 ≤ 30秒
- 识别准确率目标 ≥ 85%（文字识别）
- 判分准确率目标 ≥ 80%（随用户修正提升）

---

#### US-014: AI判分与得分计算
**As a** 系统
**I want to** 对识别出的每道题判断对错并计算得分
**So that** 学生和家长能立即看到成绩

**验收标准：**
- [ ] AI基于课本知识判断每道题对错
- [ ] 根据对错计算总分（简单算法：正确题数/总题数 × 100）
- [ ] 如果试卷有标注每题分值，按分值计算
- [ ] 判分结果与识别结果一起返回
- [ ] 对低置信度的判断（confidence < 0.7）标记为"待确认"

---

#### US-015: 用户修正识别结果
**As a** 学生或家长
**I want to** 修正AI的识别和判分结果
**So that** 确保录入数据的准确性

**验收标准：**
- [ ] 识别完成后显示逐题结果列表
- [ ] 每道题旁边显示原图对应区域（高亮裁切）
- [ ] 可修改：题目内容、学生答案、正确答案、对/错判断
- [ ] 可修改学科和年级
- [ ] 可删除识别错误的题目
- [ ] 可添加AI漏识别的题目
- [ ] 修改操作简单直观：
  - 对/错切换用大按钮（✓ / ✗），适合小学生家长操作
  - 修改文本内容用内联编辑
- [ ] 确认后保存为最终结果
- [ ] 修正数据记录到系统（用于未来改进AI准确率）

**原型描述：**
```
┌─────────────────────────────────────────┐
│ 📷 数学作业  2026-04-07                    │
│ 识别结果: 15题 | 对12题 | 错3题 | 得分80   │
│─────────────────────────────────────────│
│ [原图缩略图] │ 第1题: 25+38=___            │
│              │ 学生答案: 53                 │
│              │ 正确答案: 63                 │
│              │ [  ✗ 错  ] [  ✓ 对  ]       │
│─────────────────────────────────────────│
│ [原图缩略图] │ 第2题: 44-17=___            │
│              │ 学生答案: 27                 │
│              │ 正确答案: 27                 │
│              │ [  ✗ 错  ] [✓ 对 ✓]         │
│─────────────────────────────────────────│
│         [确认结果] [全部重新识别]            │
└─────────────────────────────────────────┘
```

---

### 2.5 多轮作业检查流程

#### US-016: 第一轮检查（核心流程）
**As a** 学生
**I want to** 上传作业后看到哪些题做错了和得分
**So that** 我知道需要改正哪些题

**验收标准：**
- [ ] 上传并确认识别结果后，创建一条"作业检查记录"（HomeworkSession）
- [ ] 显示第一轮结果：每题对/错标记 + 总得分
- [ ] **不显示正确答案、不给提示、不给解析**
- [ ] 错题用红色标记，对题用绿色标记
- [ ] 显示总体得分："15题中对12题，得分 80 分"
- [ ] 页面底部显示操作按钮："我改好了，再检查一次" 和 "结束检查"

**状态流转：**
```
CREATED → RECOGNIZING → RECOGNIZED → CHECKING ⟷ (多轮循环) → COMPLETED
                ↓
          RECOGNITION_FAILED (识别失败，可重试)
```
- CREATED：刚上传图片
- RECOGNIZING：AI正在识别（异步任务，通过轮询获取结果）
- RECOGNIZED：识别完成，等待用户确认/修正
- RECOGNITION_FAILED：识别失败，用户可选择重试或手动录入
- CHECKING：确认后进入检查循环（多轮对/错判定+改正）
- COMPLETED：用户结束检查

---

#### US-017: 改正后重新检查
**As a** 学生
**I want to** 改正错题后重新提交检查
**So that** 系统可以验证我的改正是否正确

**验收标准：**
- [ ] 点击"我改好了"后，可以重新拍照（只拍改正过的部分即可）
- [ ] 也可以手动标记某题为"已改正"并输入新答案
- [ ] AI重新判断改正后的答案是否正确
- [ ] 显示新一轮的结果（仍然只标对/错 + 新得分）
- [ ] 可以看到得分变化趋势（第1轮 80分 → 第2轮 93分）
- [ ] 可反复迭代，直到满分或学生选择"结束检查"
- [ ] 每轮检查结果都保留（不覆盖历史轮次）

**原型描述：**
```
┌──────────────────────────────────────┐
│ 📷 数学作业检查  第2轮                  │
│ 第1轮: 80分 → 第2轮: 93分 ↑13         │
│──────────────────────────────────────│
│ ✓ 第1题: 25+38=63 (第1轮改正✓)        │
│ ✓ 第2题: 44-17=27                     │
│ ✗ 第7题: 仍然有误                      │
│ ✓ 第11题: 56÷8=7 (第2轮改正✓)         │
│──────────────────────────────────────│
│ 还有1题未改正                          │
│ [我改好了，再检查] [求助] [结束检查]     │
└──────────────────────────────────────┘
```

---

#### US-018: 求助功能（渐进式揭示）
**As a** 学生
**I want to** 对确实不会的题目求助
**So that** 我可以得到适当的提示帮助我理解

**验收标准：**
- [ ] 每道错题旁边有"求助"按钮
- [ ] 点击后显示 Level 1 提示（思路方向：考查什么知识点、解题方向）
- [ ] 学生尝试后仍不对，可请求 Level 2 提示（关键步骤）
- [ ] 仍不对可请求 Level 3（完整解析 + 正确答案）
- [ ] 每个Level之间需要学生至少提交一次新答案才能解锁下一级
- [ ] 求助次数和Level记录在HomeworkSession中（家长可见）
- [ ] 家长可设置每个学生的最大求助Level（默认按年级段）：
  - 小学：默认最高Level 2（可调为1或3）
  - 初中：默认最高Level 3
  - 高中：默认最高Level 3

**AI提示生成规格：**

Level 1 (思路提示) Prompt：
```
基于以下题目，给出思路提示。只告诉学生这道题考查什么知识点、
应该从什么方向思考，不要给出任何计算过程和答案。
用鼓励性的语气，适合{grade}学生。
```

Level 2 (关键步骤) Prompt：
```
基于以下题目，给出关键解题步骤。
写出解题的关键步骤框架，但不要给出最终计算结果。
用引导性的语气，适合{grade}学生。
```

Level 3 (完整解析) Prompt：
```
基于以下题目，给出完整的解题过程和正确答案。
包括每一步的计算和解释，适合{grade}学生理解。
```

---

#### US-019: 结束检查
**As a** 学生
**I want to** 结束本次作业检查
**So that** 这次检查的结果被保存

**验收标准：**
- [ ] 点击"结束检查"后，HomeworkSession状态变为COMPLETED
- [ ] 保存最终得分和所有轮次的历史记录
- [ ] 仍然有错题未改正的给出提示确认
- [ ] 错题自动录入错题库（去重：`contentHash` 匹配已有记录时更新 `totalAttempts` 而非新建）
- [ ] 跳转到检查结果摘要页

---

### 2.6 错题管理模块

#### US-020: 浏览错题列表
**As a** 学生
**I want to** 浏览我的所有错题
**So that** 我可以回顾和复习

**验收标准：**
- [ ] 按时间倒序显示所有错题
- [ ] 支持按学科筛选
- [ ] 支持按日期范围筛选
- [ ] 支持按内容类型筛选（试卷/抄写/默写/口算等）
- [ ] 每条错题显示：日期、学科、题目预览、错误次数、是否已掌握
- [ ] 点击进入错题详情
- [ ] 分页加载（每页20条）
- [ ] 支持搜索（按题目内容关键词）

---

#### US-021: 查看错题详情
**As a** 学生
**I want to** 查看某道错题的详细信息
**So that** 我可以复习这道题

**验收标准：**
- [ ] 显示原题图片（如有）
- [ ] 显示题目结构化内容
- [ ] 显示我的错误答案
- [ ] 显示正确答案（如果已通过求助获得或已掌握）
- [ ] 显示检查历史：哪次作业检查中出现、改了几轮才对
- [ ] 显示AI标注的学科和知识点（基础标注，Phase 1不需要完整图谱）
- [ ] 家长备注（如有）

---

#### US-022: 家长添加备注
**As a** 家长
**I want to** 给孩子的错题添加备注
**So that** 我可以补充说明或提醒

**验收标准：**
- [ ] 家长可在任意错题详情页添加备注
- [ ] 备注支持纯文本（最长500字）
- [ ] 可编辑和删除已有备注
- [ ] 学生可以看到家长的备注
- [ ] 备注显示添加时间和作者

---

### 2.7 家长视图模块

#### US-023: 家长每日作业概览
**As a** 家长
**I want to** 查看孩子今天的作业检查情况
**So that** 我知道孩子今天的作业是否都检查完了

**验收标准：**
- [ ] 家长登录后首页显示"今日概览"
- [ ] 显示今日所有HomeworkSession列表：
  - 作业名称/学科（自动识别）
  - 上传时间
  - 检查状态（进行中/已完成）
  - 最终得分（已完成的）
  - 检查轮数（改了几次）
  - 求助次数和求助题目数
- [ ] 如果今天没有任何检查记录，显示"今天还没有检查作业哦"
- [ ] 可查看历史日期的检查记录（日期选择器）
- [ ] 本周概览：每天是否有检查记录的日历视图（类似打卡）

**原型描述：**
```
┌─────────────────────────────────────────┐
│ 👧 小明的作业  2026-04-07 (周二)          │
│                                          │
│ 📊 今日概览: 3份作业已检查                  │
│                                          │
│ ┌─ 数学作业 ────────────────────────┐    │
│ │ 15:30上传 | ✅已完成 | 93分         │    │
│ │ 检查3轮 | 求助1题(Level 1)         │    │
│ └────────────────────────────────────┘    │
│ ┌─ 英语听写 ────────────────────────┐    │
│ │ 16:45上传 | ✅已完成 | 100分        │    │
│ │ 检查2轮 | 无求助                    │    │
│ └────────────────────────────────────┘    │
│ ┌─ 语文默写 ────────────────────────┐    │
│ │ 17:20上传 | 🔄进行中 | 当前85分     │    │
│ │ 检查1轮 | 3题待改正                 │    │
│ └────────────────────────────────────┘    │
│                                          │
│ 📅 本周打卡: [一✓] [二✓] [三] [四] [五]   │
└─────────────────────────────────────────┘
```

---

#### US-024: 家长查看作业检查详情
**As a** 家长
**I want to** 查看某次作业检查的完整时间线
**So that** 我可以了解孩子的检查改正过程

**验收标准：**
- [ ] 显示完整的检查时间线：
  - 第1轮：几点检查、得分、哪些题错了
  - 第2轮：几点改正、改对了哪些、得分提升
  - ...
  - 最终轮：最终得分
- [ ] 显示求助记录：哪道题、求助到Level几、AI给了什么提示
- [ ] 显示仍然未改正的题目
- [ ] 可点击每道错题进入错题详情

---

#### US-025: 家长基础统计
**As a** 家长
**I want to** 查看孩子近期的基础学习统计
**So that** 我可以了解整体学习趋势

**验收标准：**
- [ ] 近7天/30天错题数量趋势图（按学科分色）
- [ ] 各学科错题占比饼图
- [ ] 平均得分趋势（按学科）
- [ ] 每日检查次数统计
- [ ] 求助频率统计（哪个学科求助最多）

---

#### US-026: 家长设置答案揭示策略
**As a** 家长
**I want to** 设置孩子的求助Level上限
**So that** 我可以控制孩子获取答案的难易程度

**验收标准：**
- [ ] 可为每个孩子单独设置
- [ ] 可设置最大求助Level（1/2/3）
- [ ] 默认值按年级段自动设置
- [ ] 设置即时生效

---

### 2.8 管理员模块（Phase 1 精简版）

#### US-027: 管理员用户管理
**As a** 管理员
**I want to** 管理系统中的用户
**So that** 我可以维护用户数据

**验收标准：**
- [ ] 查看所有用户列表（支持搜索、分页）
- [ ] 查看用户详情（角色、家庭组、错题统计）
- [ ] 禁用/启用用户账号
- [ ] 重置用户密码
- [ ] 不能删除用户（只能禁用）

---

#### US-028: 管理员系统配置
**As a** 管理员
**I want to** 配置系统基础参数
**So that** 系统行为可以调整

**验收标准：**
- [ ] 配置AI识别参数（模型选择、温度等）
- [ ] 配置文件上传限制（大小、格式）
- [ ] 配置默认的求助Level策略
- [ ] 查看系统运行统计（用户数、错题数、AI调用次数）

---

### 2.9 PWA支持

#### US-029: PWA安装
**As a** 用户
**I want to** 把网站安装到手机主屏
**So that** 像使用App一样方便

**验收标准：**
- [ ] 浏览器显示"添加到主屏幕"提示
- [ ] 安装后以独立窗口（standalone）打开，无浏览器地址栏
- [ ] 应用图标和启动画面使用Star Catcher品牌设计
- [ ] 支持离线访问已缓存的错题列表（只读）
- [ ] Service Worker 缓存策略：
  - 静态资源：Cache First
  - API请求：Network First，离线时返回缓存
  - 图片：Cache First，后台更新

---

### 2.10 国际化

#### US-030: 中英文切换
**As a** 用户
**I want to** 切换界面语言为中文或英文
**So that** 我可以用熟悉的语言使用系统

**验收标准：**
- [ ] 设置页面可切换语言
- [ ] 所有静态文本支持中/英
- [ ] AI生成的内容根据当前语言设置生成对应语言
- [ ] 英语学科题目保持英文原文
- [ ] 数学公式使用KaTeX渲染（语言无关）
- [ ] URL带locale前缀（`/zh/...`, `/en/...`）
- [ ] 用户语言偏好保存到账号设置

---

## 3. 数据库设计（Prisma Schema）

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== 用户与认证 ====================

model User {
  id        String    @id @default(cuid())
  username  String    @unique @db.VarChar(32)
  password  String    @db.VarChar(128) // bcrypt hashed
  nickname  String    @db.VarChar(32)
  role      UserRole
  grade     Grade?    // 学生必填
  locale    Locale    @default(zh)
  isActive  Boolean   @default(true)
  deletedAt DateTime? @db.Timestamptz // 软删除
  loginFailCount Int  @default(0) // 连续登录失败次数
  lockedUntil DateTime? @db.Timestamptz // 账号锁定截止时间
  createdAt DateTime  @default(now()) @db.Timestamptz
  updatedAt DateTime  @updatedAt @db.Timestamptz

  // 关联
  familyMemberships FamilyMember[]
  homeworkSessions  HomeworkSession[] // 学生的作业检查记录
  errorQuestions    ErrorQuestion[]   // 学生的错题
  parentNotes       ParentNote[]      // 家长写的备注
  adminLogs         AdminLog[]

  @@index([username])
  @@index([role])
}

enum UserRole {
  STUDENT
  PARENT
  ADMIN
}

enum Grade {
  PRIMARY_1
  PRIMARY_2
  PRIMARY_3
  PRIMARY_4
  PRIMARY_5
  PRIMARY_6
  JUNIOR_1
  JUNIOR_2
  JUNIOR_3
  SENIOR_1
  SENIOR_2
  SENIOR_3
}

enum Locale {
  zh
  en
}

// ==================== 家庭组 ====================

model Family {
  id         String    @id @default(cuid())
  name       String    @db.VarChar(32)
  inviteCode String?   @unique @db.VarChar(8)
  inviteCodeExpiresAt DateTime? @db.Timestamptz
  deletedAt  DateTime? @db.Timestamptz
  createdAt  DateTime  @default(now()) @db.Timestamptz
  updatedAt  DateTime  @updatedAt @db.Timestamptz

  members FamilyMember[]

  @@index([inviteCode])
}

model FamilyMember {
  id       String           @id @default(cuid())
  userId   String
  familyId String
  role     FamilyMemberRole
  joinedAt DateTime         @default(now())

  user   User   @relation(fields: [userId], references: [id])
  family Family @relation(fields: [familyId], references: [id])

  @@unique([userId, familyId])
  @@index([familyId])
  @@index([userId])
}

enum FamilyMemberRole {
  OWNER
  MEMBER
}

// ==================== 作业检查 ====================

model HomeworkSession {
  id          String              @id @default(cuid())
  studentId   String
  createdBy   String              // 操作者ID（可能是家长代操作）
  subject     Subject?            // AI自动识别，用户可修正
  contentType ContentType?        // AI自动识别
  grade       Grade?              // AI自动识别
  title       String?             @db.VarChar(128) // 自动生成或用户输入
  status      HomeworkStatus      @default(CREATED)
  finalScore  Float?              // 最终得分（完成后写入）
  totalRounds Int                 @default(0) // 总检查轮数
  createdAt   DateTime            @default(now()) @db.Timestamptz
  updatedAt   DateTime            @updatedAt @db.Timestamptz

  student       User              @relation(fields: [studentId], references: [id])
  images        HomeworkImage[]
  checkRounds   CheckRound[]
  questions     SessionQuestion[]
  helpRequests  HelpRequest[]

  @@index([studentId, createdAt])
  @@index([studentId, status])
  @@index([status, createdAt])   // 管理员统计查询
}

enum Subject {
  MATH        // 数学
  CHINESE     // 语文
  ENGLISH     // 英语
  PHYSICS     // 物理
  CHEMISTRY   // 化学
  BIOLOGY     // 生物
  POLITICS    // 政治
  HISTORY     // 历史
  GEOGRAPHY   // 地理
  OTHER       // 其他
}

enum ContentType {
  EXAM            // 试卷
  HOMEWORK        // 作业
  DICTATION       // 听写/默写
  COPYWRITING     // 抄写
  ORAL_CALC       // 口算
  COMPOSITION     // 作文
  OTHER           // 其他
}

enum HomeworkStatus {
  CREATED              // 刚创建
  RECOGNIZING          // AI识别中（异步）
  RECOGNIZED           // 识别完成，待确认
  RECOGNITION_FAILED   // 识别失败
  CHECKING             // 检查中（多轮循环）
  COMPLETED            // 检查完成
}

// 作业关联的图片
model HomeworkImage {
  id               String          @id @default(cuid())
  homeworkSessionId String
  imageUrl         String          // MinIO中的URL
  originalFilename String?
  sortOrder        Int             @default(0)
  exifRotation     Int             @default(0)  // EXIF方向纠正角度（0/90/180/270）
  privacyStripped  Boolean         @default(false) // GPS等隐私信息是否已剥离
  createdAt        DateTime        @default(now())

  homeworkSession HomeworkSession @relation(fields: [homeworkSessionId], references: [id], onDelete: Cascade)

  @@index([homeworkSessionId])
}

// 作业中的每道题
model SessionQuestion {
  id                String          @id @default(cuid())
  homeworkSessionId String
  questionNumber    Int             // 题号
  questionType      QuestionType?   // 题型
  content           String          @db.Text // 题目内容
  studentAnswer     String?         @db.Text // 学生答案
  correctAnswer     String?         @db.Text // 正确答案
  isCorrect         Boolean?        // 最新状态是否正确
  confidence        Float?          // AI识别置信度 0.0-1.0
  needsReview       Boolean         @default(false) // confidence < 0.7 时标记
  imageRegion       Json?           // 相对坐标 {x%, y%, w%, h%} (0-100)
  aiKnowledgePoint  String?         @db.VarChar(256) // AI基础标注的知识点
  createdAt         DateTime        @default(now()) @db.Timestamptz
  updatedAt         DateTime        @updatedAt @db.Timestamptz

  homeworkSession   HomeworkSession @relation(fields: [homeworkSessionId], references: [id], onDelete: Cascade)
  roundResults      RoundQuestionResult[]
  helpRequests      HelpRequest[]
  errorQuestion     ErrorQuestion?  // 如果是错题，关联到错题库

  @@index([homeworkSessionId])
}

enum QuestionType {
  CHOICE          // 选择题
  FILL_BLANK      // 填空题
  TRUE_FALSE      // 判断题
  SHORT_ANSWER    // 简答题
  CALCULATION     // 计算题
  ESSAY           // 作文/论述
  DICTATION_ITEM  // 听写/默写条目
  COPY_ITEM       // 抄写条目
  OTHER           // 其他
}

// 每轮检查
model CheckRound {
  id                String          @id @default(cuid())
  homeworkSessionId String
  roundNumber       Int             // 第几轮
  score             Float?          // 本轮得分
  totalQuestions    Int?            // 总题数
  correctCount      Int?            // 正确数
  createdAt         DateTime        @default(now())

  homeworkSession HomeworkSession       @relation(fields: [homeworkSessionId], references: [id], onDelete: Cascade)
  results         RoundQuestionResult[]

  @@unique([homeworkSessionId, roundNumber])
  @@index([homeworkSessionId])
}

// 每轮中每道题的结果
model RoundQuestionResult {
  id                String          @id @default(cuid())
  checkRoundId      String
  sessionQuestionId String
  studentAnswer     String?         // 本轮学生答案
  isCorrect         Boolean
  correctedFromPrev Boolean         @default(false) // 是否从上轮改正

  checkRound      CheckRound      @relation(fields: [checkRoundId], references: [id], onDelete: Cascade)
  sessionQuestion SessionQuestion @relation(fields: [sessionQuestionId], references: [id], onDelete: Cascade)

  @@index([checkRoundId])
  @@index([sessionQuestionId])
}

// 求助记录
model HelpRequest {
  id                String          @id @default(cuid())
  homeworkSessionId String
  sessionQuestionId String
  level             Int             // 1, 2, 3
  aiResponse        String          // AI生成的提示内容
  createdAt         DateTime        @default(now())

  homeworkSession HomeworkSession @relation(fields: [homeworkSessionId], references: [id], onDelete: Cascade)
  sessionQuestion SessionQuestion @relation(fields: [sessionQuestionId], references: [id], onDelete: Cascade)

  @@index([homeworkSessionId])
  @@index([sessionQuestionId])
}

// ==================== 错题库 ====================

model ErrorQuestion {
  id                String          @id @default(cuid())
  studentId         String
  sessionQuestionId String?         @unique // 关联到作业检查中的题目
  subject           Subject
  contentType       ContentType?
  grade             Grade?
  questionType      QuestionType?
  content           String          @db.Text // 题目内容
  contentHash       String?         @db.VarChar(64) // 用于去重的内容哈希
  studentAnswer     String?         @db.Text // 学生错误答案
  correctAnswer     String?         @db.Text // 正确答案
  errorAnalysis     String?         @db.Text // AI分析的错误原因
  aiKnowledgePoint  String?         @db.VarChar(256) // AI标注的知识点
  imageUrl          String?         // 原题图片URL
  totalAttempts     Int             @default(1) // 总尝试次数
  correctAttempts   Int             @default(0) // 正确次数
  isMastered        Boolean         @default(false) // 是否已掌握
  deletedAt         DateTime?       @db.Timestamptz // 软删除
  createdAt         DateTime        @default(now()) @db.Timestamptz
  updatedAt         DateTime        @updatedAt @db.Timestamptz

  student         User              @relation(fields: [studentId], references: [id])
  sessionQuestion SessionQuestion?  @relation(fields: [sessionQuestionId], references: [id])
  parentNotes     ParentNote[]

  @@unique([studentId, contentHash]) // 防止同一学生录入重复错题
  @@index([studentId, subject])
  @@index([studentId, createdAt])
  @@index([studentId, isMastered])
}

// 家长备注
model ParentNote {
  id              String        @id @default(cuid())
  parentId        String
  errorQuestionId String
  content         String        @db.VarChar(500)
  createdAt       DateTime      @default(now()) @db.Timestamptz
  updatedAt       DateTime      @updatedAt @db.Timestamptz

  parent        User          @relation(fields: [parentId], references: [id])
  errorQuestion ErrorQuestion @relation(fields: [errorQuestionId], references: [id], onDelete: Cascade)

  @@index([errorQuestionId])
}

// ==================== 家长设置 ====================

model ParentStudentConfig {
  id            String @id @default(cuid())
  parentId      String
  studentId     String
  parent        User   @relation("ParentConfigs", fields: [parentId], references: [id])
  student       User   @relation("StudentConfigs", fields: [studentId], references: [id])
  maxHelpLevel  Int    @default(2)  // 最大求助Level，默认2
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([parentId, studentId])
}

// ==================== 系统管理 ====================

model AdminLog {
  id        String   @id @default(cuid())
  adminId   String
  action    String
  target    String?  // 操作对象
  details   Json?    // 操作详情
  createdAt DateTime @default(now())

  admin User @relation(fields: [adminId], references: [id])

  @@index([adminId, createdAt])
}

model SystemConfig {
  id    String @id @default(cuid())
  key   String @unique
  value Json
  updatedAt DateTime @updatedAt

  @@index([key])
}

// ==================== AI 调用记录 ====================

enum AIOperationType {
  OCR_RECOGNIZE
  SUBJECT_DETECT
  HELP_GENERATE
}

model AICallLog {
  id            String          @id @default(cuid())
  userId        String?         // 触发者
  operationType AIOperationType // 与 Harness AIOperation 类型对齐
  provider      String          @db.VarChar(16) // azure / local
  model         String          @db.VarChar(32) // gpt-5.4
  correlationId String?         @db.VarChar(64) // 关联 BullMQ jobId 或 tRPC requestId
  inputTokens   Int             @default(0)
  outputTokens  Int             @default(0)
  durationMs    Int             @default(0)     // 耗时毫秒
  success       Boolean
  errorMessage  String?         @db.Text
  createdAt     DateTime        @default(now()) @db.Timestamptz

  @@index([createdAt])
  @@index([operationType])
  @@index([userId, createdAt])
}
```

**软删除查询约定**：`User`、`Family`、`ErrorQuestion` 模型含 `deletedAt` 字段。所有查询默认加 `WHERE deletedAt IS NULL` 过滤。实现时使用 Prisma Client Extensions (`$extends`) 全局注入软删除过滤，避免每个查询手动添加。

---

## 4. API 接口设计

> 使用 tRPC，路由按模块组织。以下列出所有 Phase 1 的 API 端点。

### 4.1 认证模块 (`auth`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `auth.register` | mutation | 用户注册 | `{username, password, nickname, role, grade?, locale?}` | `{user, token}` |
| `auth.login` | mutation | 用户登录 | `{username, password}` | `{user, token}` |
| `auth.me` | query | 获取当前用户信息 | - | `{user}` |
| `auth.updateProfile` | mutation | 更新个人信息 | `{nickname?, grade?, locale?}` | `{user}` |
| `auth.changePassword` | mutation | 修改密码 | `{oldPassword, newPassword}` | `{success}` |

### 4.2 家庭组模块 (`family`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `family.create` | mutation | 创建家庭组 | `{name}` | `{family, inviteCode}` |
| `family.list` | query | 我的家庭组列表 | - | `{families[]}` |
| `family.getMembers` | query | 获取家庭组成员 | `{familyId}` | `{members[]}` |
| `family.regenerateInviteCode` | mutation | 重新生成邀请码 | `{familyId}` | `{inviteCode}` |
| `family.join` | mutation | 通过邀请码加入 | `{inviteCode}` | `{family}` |
| `family.removeMember` | mutation | 移除成员 | `{familyId, userId}` | `{success}` |
| `family.leave` | mutation | 离开家庭组 | `{familyId}` | `{success}` |
| `family.getStudents` | query | 获取组内学生列表 | `{familyId}` | `{students[]}` |

### 4.3 文件上传模块 (`upload`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `upload.getPresignedUrl` | mutation | 获取MinIO预签名URL | `{filename, contentType}` | `{uploadUrl, imageId, imageUrl}` |
| `upload.confirmUpload` | mutation | 确认上传完成 | `{imageId}` | `{success}` |

### 4.4 作业检查模块 (`homework`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `homework.create` | mutation | 创建作业检查 | `{imageIds[], inputType}` | `{session}` |
| `homework.recognize` | mutation | 触发AI识别 | `{sessionId}` | `{recognitionResult}` |
| `homework.confirmRecognition` | mutation | 确认/修正识别结果 | `{sessionId, questions[]}` | `{session}` |
| `homework.submitCorrection` | mutation | 提交改正 | `{sessionId, corrections[{questionId, newAnswer, newImageId?}]}` | `{checkRound}` |
| `homework.requestHelp` | mutation | 求助 | `{sessionId, questionId, level}` | `{helpResponse}` |
| `homework.complete` | mutation | 结束检查 | `{sessionId}` | `{session}` |
| `homework.getSession` | query | 获取检查详情 | `{sessionId}` | `{session, rounds[], questions[]}` |
| `homework.listSessions` | query | 获取检查列表 | `{studentId?, date?, status?, page, limit}` | `{sessions[], total}` |
| `homework.getTodaySummary` | query | 今日概览（家长用） | `{studentId, date?}` | `{sessions[], stats}` |
| `homework.getWeeklyCalendar` | query | 本周打卡日历 | `{studentId}` | `{days[{date, hasRecord, sessionCount}]}` |
| `homework.getSessionRound` | query | 获取某轮检查详情 | `{sessionId, roundNumber}` | `{round, results[]}` |
| `homework.getCompletionSummary` | query | 完成摘要 | `{sessionId}` | `{finalScore, rounds[], improvements, unresolvedCount}` |
| `homework.retryRecognition` | mutation | 重试AI识别 | `{sessionId}` | `{session}` |
| `homework.batchUpdateQuestions` | mutation | 批量修正识别结果 | `{sessionId, questions[{id, content?, studentAnswer?, correctAnswer?, isCorrect?}]}` | `{session}` |

### 4.5 手动录入模块 (`manualInput`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `manualInput.create` | mutation | 手动录入错题（去重：若 `(studentId, contentHash)` 已存在则更新 `totalAttempts + 1`） | `{content, studentAnswer?, correctAnswer?, imageId?}` | `{errorQuestion, deduplicated: boolean}` |
| `manualInput.detectSubject` | mutation | AI识别学科（经 Harness 管道） | `{content}` | `{subject, contentType, confidence}` |

### 4.6 错题管理模块 (`errorQuestion`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `errorQuestion.list` | query | 错题列表 | `{studentId?, subject?, contentType?, dateFrom?, dateTo?, isMastered?, page, limit, search?}` | `{questions[], total}` |
| `errorQuestion.getDetail` | query | 错题详情 | `{id}` | `{question, checkHistory[], notes[]}` |
| `errorQuestion.addNote` | mutation | 添加备注 | `{errorQuestionId, content}` | `{note}` |
| `errorQuestion.updateNote` | mutation | 更新备注 | `{noteId, content}` | `{note}` |
| `errorQuestion.deleteNote` | mutation | 删除备注 | `{noteId}` | `{success}` |
| `errorQuestion.search` | query | 全文搜索错题 | `{studentId, keyword, page, limit}` | `{questions[], total}` |
| `errorQuestion.getCheckHistory` | query | 错题出现的检查记录 | `{id}` | `{sessions[{id, date, round, wasCorrect}]}` |

### 4.7 家长设置模块 (`parentConfig`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `parentConfig.getConfig` | query | 获取对某学生的配置 | `{studentId}` | `{config}` |
| `parentConfig.updateConfig` | mutation | 更新配置 | `{studentId, maxHelpLevel}` | `{config}` |

### 4.8 家长统计模块 (`parentStats`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `parentStats.errorTrend` | query | 错题数量趋势 | `{studentId, days}` | `{data[{date, subject, count}]}` |
| `parentStats.subjectDistribution` | query | 学科错题分布 | `{studentId, days}` | `{data[{subject, count, percentage}]}` |
| `parentStats.scoreTrend` | query | 平均得分趋势 | `{studentId, days}` | `{data[{date, subject, avgScore}]}` |
| `parentStats.helpFrequency` | query | 求助频率统计 | `{studentId, days}` | `{data[{subject, helpCount, topQuestions[]}]}` |

### 4.9 管理员模块 (`admin`)

| 端点 | 方法 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| `admin.listUsers` | query | 用户列表 | `{search?, role?, page, limit}` | `{users[], total}` |
| `admin.getUserDetail` | query | 用户详情 | `{userId}` | `{user, stats}` |
| `admin.toggleUserActive` | mutation | 启用/禁用用户 | `{userId, isActive}` | `{success}` |
| `admin.resetPassword` | mutation | 重置密码 | `{userId, newPassword}` | `{success}` |
| `admin.getSystemStats` | query | 系统统计 | - | `{userCount, questionCount, sessionCount, aiCallCount}` |
| `admin.getConfig` | query | 获取系统配置 | `{key}` | `{value}` |
| `admin.updateConfig` | mutation | 更新系统配置 | `{key, value}` | `{success}` |

---

## 5. AI 层设计：Provider + Harness

### 5.1 设计理念：AI Harness Engineering

AI 层采用 **Harness（线束）架构**：业务代码不直接调用 AI Provider，而是通过 Harness 管道。Harness 在 AI 调用前后注入控制逻辑（输入净化、输出校验、安全过滤、限流、降级、日志），使跨切面关注点与业务逻辑分离。

**架构分层**：

```
业务代码 (tRPC procedures / BullMQ workers)
        │
        ▼
  Operations 层 (recognize-homework / detect-subject / generate-help)
        │
        ▼
  AI Harness 管道
   ┌─ Pre-call ──────────────────────────────┐
   │  RateLimiter → PromptInjectionGuard     │
   │  → PromptManager                        │
   └─────────────────────────────────────────┘
        │
   AIProvider.chat() / .vision()
        │
   ┌─ Post-call ─────────────────────────────┐
   │  OutputValidator → ContentGuardrail     │
   │  → CallLogger                           │
   └─────────────────────────────────────────┘
        │
   ┌─ Error path ────────────────────────────┐
   │  FallbackHandler → CallLogger           │
   └─────────────────────────────────────────┘
```

**Phase 1 必须的 Harness 组件**：

| 组件 | 职责 | 必要性理由 |
|------|------|-----------|
| OutputValidator | Zod schema 校验 AI JSON 输出 | OCR 畸形输出会污染学生数据，最高风险 |
| PromptManager | 模板注册 + 变量注入 | 3种操作 × 多语言 × 年级适配，散落的 prompt 不可维护 |
| ContentGuardrail | K-12 内容安全过滤 | 给儿童用的 AI 产品，不当内容必须拦截 |
| PromptInjectionGuard | 用户输入净化 | 学生文字嵌入 prompt，需防止注入 |
| FallbackHandler | AI 不可用时降级 | 系统应优雅退化而非崩溃 |
| RateLimiter | Redis 滑动窗口限流 | 落实 5次/分 100次/天的规则 |
| CallLogger | AICallLog 持久化 | 落实 AICallLog 模型的写入逻辑 |

**Phase 2+ 延后**：熔断器（Circuit Breaker）、语义缓存、预算上限、深度可观测性（OpenTelemetry）。

### 5.2 文件结构

```
src/lib/ai/
├── types.ts                          # AIProvider 接口 + Response 类型
├── provider-factory.ts               # createAIProvider() 工厂
├── singleton.ts                      # 全局 AIHarness 实例
│
├── providers/
│   └── azure-openai.ts               # AzureOpenAIProvider
│
├── harness/
│   ├── index.ts                      # createAIHarness() 组装管道
│   ├── types.ts                      # AIOperation, AICallContext, AIHarnessResult<T>
│   ├── prompt-manager.ts             # 模板注册 + 变量注入
│   ├── prompt-injection-guard.ts     # 输入净化（中英双语模式检测）
│   ├── output-validator.ts           # Zod 校验 + 鲁棒 JSON 解析
│   ├── content-guardrail.ts          # K-12 内容安全过滤
│   ├── rate-limiter.ts               # Redis 滑动窗口
│   ├── fallback-handler.ts           # 降级策略
│   ├── call-logger.ts                # AICallLog 持久化（fire-and-forget）
│   └── schemas/                      # 每种 AI 操作的输出 Zod Schema
│       ├── ocr-recognition.ts
│       ├── subject-detection.ts
│       └── help-generation.ts
│
├── prompts/                          # Prompt 模板（TypeScript 常量，版本化）
│   ├── ocr-recognition.ts
│   ├── subject-detection.ts
│   └── help-generation.ts            # L1/L2/L3 三级 prompt
│
└── operations/                       # 业务层调用入口
    ├── recognize-homework.ts         # OCR 识别编排
    ├── detect-subject.ts             # 学科检测编排
    └── generate-help.ts              # 求助生成编排
```

### 5.3 AI Provider 接口

```typescript
// src/lib/ai/types.ts

interface AIProvider {
  /** 文本对话 */
  chat(params: ChatParams): Promise<ChatResponse>
  /** 视觉识别（图片理解） */
  vision(params: VisionParams): Promise<VisionResponse>
}

interface ChatParams {
  messages: Array<{role: 'system' | 'user' | 'assistant', content: string}>
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
}

interface VisionParams {
  images: Array<{url: string} | {base64: string}>
  prompt: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
}

interface ChatResponse {
  content: string
  usage?: { inputTokens: number; outputTokens: number }
}

interface VisionResponse {
  content: string
  usage?: { inputTokens: number; outputTokens: number }
}

// src/lib/ai/providers/azure-openai.ts
class AzureOpenAIProvider implements AIProvider {
  // 使用 Azure OpenAI GPT-5.4
  // 必须从响应中提取 usage 信息返回
}

// src/lib/ai/provider-factory.ts
function createAIProvider(): AIProvider {
  switch (process.env.AI_PROVIDER) {
    case 'azure': return new AzureOpenAIProvider()
    case 'local': return new LocalModelProvider() // 未来扩展
    default: return new AzureOpenAIProvider()
  }
}
```

### 5.4 Harness 核心类型

```typescript
// src/lib/ai/harness/types.ts

/** Phase 1 的三种 AI 操作 */
type AIOperation = 'ocr-recognize' | 'subject-detect' | 'help-generate'

/** 贯穿 Harness 管道的上下文 */
interface AICallContext {
  userId: string
  operation: AIOperation
  correlationId: string          // 关联 BullMQ jobId 或 tRPC requestId
  locale: 'zh' | 'en'
  grade?: string
  metadata?: Record<string, unknown>  // 操作特定数据（如 helpLevel）
}

/** Harness 统一返回类型 */
interface AIHarnessResult<T> {
  success: boolean
  data?: T                       // 经 Zod 校验的输出
  rawResponse?: string           // 原始 AI 文本（调试用）
  fallback?: boolean             // 是否为降级结果
  error?: {
    code: string                 // 机器可读错误码
    message: string              // i18n key
    retryable: boolean
  }
  usage?: {
    inputTokens: number
    outputTokens: number
    durationMs: number
  }
}
```

### 5.5 Harness 入口接口

```typescript
// src/lib/ai/harness/index.ts

interface AIHarness {
  execute<T>(
    operation: AIOperation,
    input: AIOperationInput,
    context: AICallContext
  ): Promise<AIHarnessResult<T>>
}

type AIOperationInput =
  | OCRRecognitionInput
  | SubjectDetectionInput
  | HelpGenerationInput

function createAIHarness(deps: {
  provider: AIProvider
  prisma: PrismaClient
  redis: Redis
}): AIHarness

// src/lib/ai/singleton.ts
const provider = createAIProvider()
export const aiHarness = createAIHarness({ provider, prisma, redis })
```

### 5.6 输出验证（OutputValidator）

**最关键的 Harness 组件**。每种 AI 操作定义一个 Zod schema，AI 返回的 JSON 必须通过校验才能进入业务流程。

**鲁棒 JSON 解析**：LLM 可能返回 markdown 代码围栏包裹的 JSON 或有尾逗号/单引号等语法瑕疵。解析器按以下顺序处理：
1. 去除 markdown 代码围栏（```json ... ```）
2. 标准 `JSON.parse`
3. 失败则修复尾逗号、单引号后重试

**OCR 识别输出 Schema**：

```typescript
// src/lib/ai/harness/schemas/ocr-recognition.ts
import { z } from 'zod'

const OCRQuestionSchema = z.object({
  number: z.number().int().positive(),
  type: z.enum([
    'CHOICE', 'FILL_BLANK', 'TRUE_FALSE', 'SHORT_ANSWER',
    'CALCULATION', 'ESSAY', 'DICTATION_ITEM', 'COPY_ITEM', 'OTHER'
  ]).optional(),
  content: z.string().min(1).max(5000),
  studentAnswer: z.string().max(5000).nullable(),
  correctAnswer: z.string().max(5000).nullable(),
  isCorrect: z.boolean().nullable(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
})

const OCRRecognitionOutputSchema = z.object({
  subject: z.enum([
    'MATH', 'CHINESE', 'ENGLISH', 'PHYSICS', 'CHEMISTRY',
    'BIOLOGY', 'POLITICS', 'HISTORY', 'GEOGRAPHY', 'OTHER'
  ]),
  contentType: z.enum([
    'EXAM', 'HOMEWORK', 'DICTATION', 'COPYWRITING',
    'ORAL_CALC', 'COMPOSITION', 'OTHER'
  ]),
  grade: z.string().nullable().optional(),
  totalQuestions: z.number().int().nonnegative(),
  questions: z.array(OCRQuestionSchema).min(0),
})
```

**学科检测输出 Schema**：

```typescript
// src/lib/ai/harness/schemas/subject-detection.ts
const SubjectDetectionOutputSchema = z.object({
  subject: z.enum([/* 同上 Subject 枚举 */]),
  contentType: z.enum([/* 同上 ContentType 枚举 */]),
  confidence: z.number().min(0).max(1),
})
```

**求助生成输出 Schema**：

```typescript
// src/lib/ai/harness/schemas/help-generation.ts
const HelpGenerationOutputSchema = z.object({
  helpText: z.string().min(1).max(5000),      // markdown 格式
  knowledgePoint: z.string().max(256).optional(),
})
```

### 5.7 Prompt 管理（PromptManager）

Prompt 模板以 TypeScript 常量存储（Phase 1 不用数据库），每个模板包含。

**i18n 策略**：所有 Prompt 模板的 systemMessage 和 userMessageTemplate 使用英文编写。通过 `{{locale}}` 变量注入，在 prompt 末尾添加语言输出指令（如 `"Respond in Chinese."` 或 `"Respond in English."`），让 AI 输出对应语言的内容。不为每种语言维护独立的 prompt 模板文件。

> **关于本文档中的中文用户提示**：PRD 中出现的用户提示文案（如 "邀请码无效"、"识别超时，请重试"）均为说明用途。实现时所有用户可见文案通过 next-intl 的 i18n key 管理（如 `t('error.inviteCodeInvalid')`），中英文翻译存放在 `messages/zh.json` 和 `messages/en.json` 中。

**模板结构**：

```typescript
interface PromptTemplate {
  id: string              // 'ocr-recognition-v1'
  version: number
  systemMessage: string   // system role 内容
  userMessageTemplate: string  // 含 {{variable}} 占位符
  responseFormat: 'json' | 'text'
  temperature: number
  maxTokens: number
}
```

**变量注入规则**：
- `{{locale}}` → 'zh' | 'en'，控制 AI 输出语言
- `{{grade}}` → 学生年级，用于调整解释深度
- `{{subject}}` → 学科，用于求助生成
- `{{questionContent}}` → 题目内容（经注入防御净化后）
- `{{studentAnswer}}` → 学生答案
- `{{helpLevel}}` → 1 | 2 | 3

**Prompt 设计原则**：
- System message 中明确声明 `<student_content>` 标签内的内容为数据，不可解释为指令
- 要求 JSON 格式输出时在 system message 中指定 schema
- OCR 使用低 temperature（0.1），求助使用中等 temperature（0.3-0.5）
- OCR prompt 的 systemMessage 中必须包含图片方向处理指令："If the image appears rotated or upside down, mentally correct the orientation before recognizing content."（对应 Section 12.8 无 EXIF 信息场景）

### 5.8 Prompt 注入防御（PromptInjectionGuard）

学生输入（手动录入文字、改正答案）嵌入 prompt 前必须净化：

```typescript
interface PromptInjectionGuard {
  sanitize(input: string): {
    sanitized: string
    riskScore: number      // 0.0 (安全) ~ 1.0 (高危)
    flagged: boolean
  }
}
```

**防御策略**：
1. **分隔符隔离**：用户内容包裹在 `<student_content>...</student_content>` 标签中，system message 声明该标签内容为纯数据
2. **模式检测**：正则检测常见注入模式（中英双语）：
   - "ignore previous instructions" / "忽略之前的指令"
   - "you are now" / "你现在是"
   - "system:" / "assistant:" 角色标记
   - 尝试关闭分隔符标签
3. **长度限制**：学生答案截断至合理上限（单题答案 ≤ 2000 字符）
4. **风险评分**：
   - `riskScore > 0.6`：正常传入但日志记录，prompt 中追加强化指令
   - `riskScore > 0.9`：拦截，返回用户友好错误提示

### 5.9 K-12 内容安全护栏（ContentGuardrail）

AI 生成的内容展示给学生前必须过滤：

```typescript
interface ContentGuardrail {
  check(content: string, context: { grade: string; operation: AIOperation }): {
    safe: boolean
    content: string      // 原始或脱敏后的内容
    flags: string[]      // 如 ['profanity', 'violence', 'off-topic']
  }
}
```

**过滤规则**：
1. **关键词黑名单**：中英文不当内容词表（脏话、暴力、色情等），静态列表
2. **主题偏离检测**：求助回复必须包含题目相关关键词（简单词汇重叠检查），完全无关时标记为 off-topic
3. **长度异常检测**：
   - Level 1 提示应 ≤ 500 字
   - Level 2 应 ≤ 1000 字
   - Level 3 应 ≤ 2000 字
   - 超出范围截断并标记
4. **Azure OpenAI 自带 content filter 作为第一道防线**，ContentGuardrail 作为第二道防线

### 5.10 降级服务策略（FallbackHandler）

当 AI 调用在所有重试后仍然失败时的降级方案：

| 操作 | 降级方案 | 用户体验 |
|------|---------|---------|
| `ocr-recognize` | 返回 `RECOGNITION_FAILED` | 引导用户手动录入，不伪造数据 |
| `subject-detect` | 返回 `{ subject: 'OTHER', confidence: 0 }` | 用户可手选学科（UI 已支持修正） |
| `help-generate` | 返回静态通用提示（按 locale 本地化） | "试着重新审题，想想这道题考查的是什么知识点？" |

降级结果通过 `AIHarnessResult.fallback = true` 标记，业务层可据此调整 UI 提示。

### 5.11 Operations 层（业务调用入口）

BullMQ workers 和 tRPC procedures 通过 Operations 层调用 AI，不直接接触 Harness 内部：

```typescript
// src/lib/ai/operations/recognize-homework.ts
async function recognizeHomework(params: {
  images: Array<{ url: string } | { base64: string }>
  userId: string
  locale: 'zh' | 'en'
  sessionId: string
}): Promise<AIHarnessResult<OCRRecognitionOutput>>

// src/lib/ai/operations/detect-subject.ts
async function detectSubject(params: {
  content: string
  userId: string
  locale: 'zh' | 'en'
}): Promise<AIHarnessResult<SubjectDetectionOutput>>

// src/lib/ai/operations/generate-help.ts
async function generateHelp(params: {
  level: 1 | 2 | 3
  question: { content: string; studentAnswer: string; correctAnswer?: string }
  grade: string
  subject: string
  userId: string
  locale: 'zh' | 'en'
}): Promise<AIHarnessResult<HelpGenerationOutput>>
```

**调用示例（BullMQ worker）**：

```typescript
// 在 ocr-recognize worker 中
import { recognizeHomework } from '@/lib/ai/operations/recognize-homework'

const result = await recognizeHomework({
  images: job.data.images,
  userId: job.data.userId,
  locale: job.data.locale,
  sessionId: job.data.sessionId,
})

if (result.success) {
  // 更新 HomeworkSession 状态为 RECOGNIZED，持久化 questions
} else if (result.error?.retryable) {
  throw new Error(result.error.message) // BullMQ 会重试
} else {
  // 更新 HomeworkSession 状态为 RECOGNITION_FAILED
}
```

---

## 6. 页面路由设计

```
/[locale]/                          → 根据角色重定向
/[locale]/login                     → 登录页
/[locale]/register                  → 注册页

// 学生端
/[locale]/student/                  → 学生首页（快速拍照入口）
/[locale]/student/check             → 作业检查页（拍照上传+识别）
/[locale]/student/check/[sessionId] → 检查流程页（多轮检查）
/[locale]/student/errors            → 错题列表
/[locale]/student/errors/[id]       → 错题详情
/[locale]/student/manual-input      → 手动录入
/[locale]/student/settings          → 个人设置

// 家长端
/[locale]/parent/                   → 家长首页（今日概览）
/[locale]/parent/student/[id]       → 某学生的详细视图
/[locale]/parent/student/[id]/session/[sid] → 作业检查详情
/[locale]/parent/student/[id]/errors → 该学生错题列表
/[locale]/parent/student/[id]/stats  → 该学生统计
/[locale]/parent/family              → 家庭组管理
/[locale]/parent/settings            → 设置（含答案策略配置）

// 管理员
/[locale]/admin/                    → 管理后台首页
/[locale]/admin/users               → 用户管理
/[locale]/admin/system              → 系统配置
```

**Locale 路由规则**：
- 访问 `/` 时：检测已登录用户的语言偏好 → 浏览器 `Accept-Language` → 默认 `zh`，重定向到 `/zh/` 或 `/en/`
- 语言切换：保持当前路径，替换 locale 前缀（`/zh/student/errors` ↔ `/en/student/errors`）
- 使用 next-intl 的 middleware 自动处理 locale 路由匹配和重定向
- 所有 `<Link>` 组件通过 next-intl 的 `usePathname` + `useRouter` 自动注入当前 locale 前缀

---

## 7. UI/UX 设计系统

### 7.1 设计理念

采用**分年龄段主题**策略：小学用活泼卡通风、初中过渡、高中用简洁专业风。通过 CSS 变量和 Tailwind 主题切换实现，根据当前学生的年级自动应用对应主题。家长端和管理端始终使用专业主题。

### 7.2 主题定义

#### 主题一：Candy（小学 1-6 年级）
```
色调：温暖明快
主色：#FF6B6B (Coral Red) - 用于品牌和主按钮
辅色：#4ECDC4 (Teal) - 用于成功/正确状态
强调色：#FFE66D (Sunny Yellow) - 用于提示和高亮
背景色：#FFF9F0 (Warm Cream)
卡片色：#FFFFFF
错误色：#FF6B6B
成功色：#4ECDC4
文字色：#2D3436 (主文字), #636E72 (次要文字)

圆角：16px (卡片), 12px (按钮), 24px (输入框)
字体：系统字体，基础字号 18px，标题 24-32px
按钮高度：最小 52px, 宽度 ≥ 120px
间距倍数：8px
阴影：柔和 box-shadow: 0 4px 12px rgba(0,0,0,0.08)
动画：弹性 ease-out, 时长 300ms, 操作反馈有微弹效果
图标：圆润线条风格 (Lucide icons rounded variant)
```

#### 主题二：Fresh（初中 1-3 年级）
```
色调：清新过渡
主色：#6C5CE7 (Soft Purple) - 品牌色
辅色：#00B894 (Mint Green) - 成功状态
强调色：#FDCB6E (Amber) - 提示高亮
背景色：#F8F9FA (Cool Gray)
卡片色：#FFFFFF
错误色：#E17055
成功色：#00B894
文字色：#2D3436 (主文字), #636E72 (次要文字)

圆角：12px (卡片), 8px (按钮), 8px (输入框)
字体：系统字体，基础字号 16px，标题 20-28px
按钮高度：最小 44px
间距倍数：8px
阴影：标准 box-shadow: 0 2px 8px rgba(0,0,0,0.06)
动画：标准 ease, 时长 200ms
图标：标准线条风格 (Lucide icons default)
```

#### 主题三：Pro（高中 1-3 年级 / 家长端 / 管理端）
```
色调：简洁专业
主色：#3B82F6 (Blue) - 品牌色
辅色：#10B981 (Emerald) - 成功状态
强调色：#F59E0B (Amber) - 提示高亮
背景色：#F9FAFB (Neutral Gray)
卡片色：#FFFFFF
错误色：#EF4444
成功色：#10B981
文字色：#111827 (主文字), #6B7280 (次要文字)

圆角：8px (卡片), 6px (按钮), 6px (输入框)
字体：系统字体，基础字号 14px，标题 18-24px
按钮高度：最小 40px
间距倍数：4px
阴影：轻量 box-shadow: 0 1px 3px rgba(0,0,0,0.1)
动画：快速 ease, 时长 150ms
图标：标准线条风格 (Lucide icons default)
```

### 7.3 主题切换逻辑

```typescript
function getTheme(grade: Grade, role: UserRole): 'candy' | 'fresh' | 'pro' {
  if (role === 'PARENT' || role === 'ADMIN') return 'pro'
  if (grade.startsWith('PRIMARY')) return 'candy'
  if (grade.startsWith('JUNIOR')) return 'fresh'
  return 'pro' // SENIOR
}
```

- 主题通过 CSS 变量 + Tailwind `data-theme` 属性实现
- 切换时无需重新加载页面
- 学生升年级后主题自动更新
- 家长查看学生数据时，仪表盘保持 Pro 主题（不跟随学生主题）

### 7.4 响应式断点

| 断点 | 宽度 | 场景 |
|------|------|------|
| `xs` | < 375px | 小屏手机 |
| `sm` | ≥ 375px | 标准手机（竖屏） |
| `md` | ≥ 768px | 平板（竖屏）/ 大屏手机（横屏） |
| `lg` | ≥ 1024px | 平板（横屏）/ 小屏笔记本 |
| `xl` | ≥ 1280px | 桌面显示器 |

**Mobile-first 原则**：所有页面从手机竖屏开始设计，向上适配。

### 7.5 核心组件规范

#### 对/错标记按钮（最关键的交互组件）
```
Candy主题：
  ✓ 对：绿色圆形按钮, 64x64px, 带弹性动画
  ✗ 错：红色圆形按钮, 64x64px, 带摇晃动画

Fresh/Pro主题：
  ✓ 对：绿色圆角按钮, 48x48px
  ✗ 错：红色圆角按钮, 48x48px

所有主题：选中态有明确的填充色变化 + 勾选图标
```

#### 得分展示
```
Candy主题：大字号(48px)居中展示, 带星星动画
Fresh主题：中字号(32px), 带进度环
Pro主题：标准字号(24px), 简洁数字+进度条
```

#### 求助按钮
```
所有主题：区别于普通按钮的样式
Candy：带"小手举起来"图标, 蓝色圆角按钮
Fresh/Pro：带问号图标的次要按钮
```

#### 导航布局
```
手机端：底部Tab导航 (学生: 检查/错题/设置, 家长: 概览/学生/家庭/设置)
平板/桌面：左侧Sidebar导航
```

### 7.6 拍照界面设计

```
全屏相机预览
底部居中：圆形拍照按钮 (80x80px)
左下：相册入口图标
右下：已拍照片缩略图计数 (如 "2/10")
顶部：返回按钮 + 当前学科标签 (如果已识别)
相机辅助线：四角对齐框，帮助用户对准试卷
```

### 7.7 无障碍设计
- 所有可交互元素有 `aria-label`
- 色彩对比度符合 WCAG 2.1 AA 标准（最低4.5:1）
- 支持键盘Tab导航
- 屏幕阅读器友好的语义化HTML

---

## 8. Docker Compose 部署设计

```yaml
# docker-compose.yml
version: '3.8'

services:
  star-catcher-app:
    build: .
    container_name: star-catcher-app
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://star_catcher:${DB_PASSWORD}@star-catcher-db:5432/star_catcher
      - REDIS_URL=redis://star-catcher-redis:6379
      - MINIO_ENDPOINT=star-catcher-minio
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - MINIO_BUCKET=${MINIO_BUCKET:-star-catcher}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT}
      - AZURE_OPENAI_API_VERSION=${AZURE_OPENAI_API_VERSION:-2024-12-01-preview}
      - AI_PROVIDER=azure
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://localhost:3000
      - NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME:-Star Catcher}
      - NEXT_PUBLIC_DEFAULT_LOCALE=${NEXT_PUBLIC_DEFAULT_LOCALE:-zh}
      - ADMIN_DEFAULT_PASSWORD=${ADMIN_DEFAULT_PASSWORD}
    depends_on:
      - star-catcher-db
      - star-catcher-redis
      - star-catcher-minio
    restart: unless-stopped

  star-catcher-db:
    image: postgres:16-alpine
    container_name: star-catcher-db
    environment:
      - POSTGRES_USER=star_catcher
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=star_catcher
    volumes:
      - star-catcher-pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  star-catcher-redis:
    image: redis:7-alpine
    container_name: star-catcher-redis
    volumes:
      - star-catcher-redisdata:/data
    ports:
      - "6379:6379"
    restart: unless-stopped

  star-catcher-minio:
    image: minio/minio
    container_name: star-catcher-minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - star-catcher-miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    restart: unless-stopped

volumes:
  star-catcher-pgdata:
  star-catcher-redisdata:
  star-catcher-miniodata:
```

---

## 9. 环境变量清单

```env
# .env.example

# 数据库
DATABASE_URL=postgresql://star_catcher:your_password@localhost:5432/star_catcher
DB_PASSWORD=your_password

# Redis
REDIS_URL=redis://localhost:6379

# MinIO (文件存储)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=star-catcher

# Azure OpenAI
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-5.4
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# NextAuth
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000

# App
NEXT_PUBLIC_APP_NAME=Star Catcher
NEXT_PUBLIC_DEFAULT_LOCALE=zh

# Admin
ADMIN_DEFAULT_PASSWORD=change_me_on_first_login
```

**首次启动初始化步骤**：
1. `docker compose up -d` 启动所有服务
2. MinIO bucket 创建：应用启动时自动检测并创建 `MINIO_BUCKET`（在 `src/lib/minio.ts` 初始化逻辑中实现 `bucketExists` + `makeBucket`）
3. 数据库迁移：`docker compose exec star-catcher-app npx prisma migrate deploy`
4. 管理员种子：`docker compose exec star-catcher-app npx prisma db seed`

---

## 10. 异步任务与错误处理设计

### 10.1 异步任务（BullMQ）

AI识别是耗时操作（可达30秒），必须异步处理：

| 任务类型 | 触发时机 | 超时 | 重试 |
|----------|----------|------|------|
| `ocr-recognize` | 用户上传图片后 | 60s | 最多2次 |
| `subject-detect` | 手动录入题目后 | 15s | 最多1次 |
| `help-generate` | 学生点击求助后 | 30s | 最多1次 |

**轮询机制**：
- 前端通过 `homework.getSession` 轮询状态（间隔2秒）
- 当状态从 RECOGNIZING → RECOGNIZED/RECOGNITION_FAILED 时停止轮询
- 前端显示识别进度动画和预计等待时间

### 10.2 错误处理策略

| 场景 | 处理方式 | 用户提示 |
|------|----------|----------|
| AI识别超时 | 标记为 RECOGNITION_FAILED | "识别超时，请重试或手动录入" |
| AI识别结果为空 | 标记为 RECOGNITION_FAILED | "未能识别出题目，请确认图片清晰度后重试" |
| AI JSON输出畸形 | OutputValidator 拦截，触发重试 | "系统繁忙，正在重试..." |
| AI输出含不当内容 | ContentGuardrail 拦截，返回降级结果 | 显示通用安全提示替代 |
| AI API调用失败 | 记录错误日志，触发重试 | "系统繁忙，正在重试..." |
| AI API额度用完 | 记录告警，通知管理员 | "系统暂时不可用，请稍后再试" |
| AI所有重试失败 | FallbackHandler 降级（详见5.10） | 按操作类型显示降级体验 |
| 用户输入疑似注入 | PromptInjectionGuard 评分，高危拦截 | "输入内容异常，请修改后重试" |
| 图片上传失败 | 前端重试3次 | "上传失败，请检查网络后重试" |
| 图片格式不支持 | 前端拦截 | "不支持的文件格式，请使用JPG/PNG/HEIC/WebP" |
| 图片过大 | 前端压缩或拦截 | "图片过大，正在压缩..." 或 "图片超过20MB" |

**Harness 管道中的错误传播规则**：
- Pre-call 阶段（RateLimiter、PromptInjectionGuard）失败 → 不调用 AI，直接返回错误
- AI 调用失败 → BullMQ 重试；重试耗尽后 → FallbackHandler 降级
- Post-call 阶段（OutputValidator）失败 → 视为 AI 调用失败，触发重试
- Post-call 阶段（ContentGuardrail）标记不安全 → 使用降级结果替代
- 所有错误路径均经过 CallLogger 记录

### 10.3 管理员初始账号

通过 Prisma seed 脚本创建：
```bash
npx prisma db seed
```
在 `prisma/seed.ts` 中创建默认管理员：
- username: `admin`
- password: 由环境变量 `ADMIN_DEFAULT_PASSWORD` 指定
- 首次登录强制修改密码

---

## 11. Sprint 详细拆分

### Sprint 1: 基础架构 + 用户系统 + 家庭组 (Week 1-2)

**Week 1:**
1. 项目初始化：Next.js + TypeScript + Tailwind + shadcn/ui
2. Docker Compose 环境搭建（PG + Redis + MinIO）
3. Prisma Schema 定义 + 数据库迁移
4. tRPC 基础配置
5. NextAuth.js 集成（用户名密码认证）
6. next-intl 国际化配置
7. 注册/登录页面 + API

**Week 2:**
8. 用户个人信息页
9. 家庭组 CRUD（创建、邀请、加入、管理成员）
10. 家长-学生关系视图（切换查看不同学生）
11. 基础布局（学生端/家长端/管理员端导航）
12. RBAC 中间件（路由守卫）

### Sprint 2: 作业录入 + AI Harness + AI识别 + 多轮检查 (Week 3-4)

**Week 3:**
13. 文件上传：MinIO集成 + 预签名URL + 客户端图片压缩
14. 拍照组件：摄像头调用 + 相册选择 + 多张管理
15. AI Provider 抽象层 + Azure OpenAI 实现（含 usage 信息提取）
16. AI Harness 基础设施：
    - PromptManager + OCR Prompt 模板
    - OutputValidator + OCR Zod Schema
    - CallLogger（AICallLog 写入）
    - PromptInjectionGuard（输入净化）
    - RateLimiter（Redis 滑动窗口）
17. OCR Operation：recognizeHomework 编排（经 Harness 管道）
18. 识别结果确认/修正页面

**Week 4:**
19. 多轮检查流程：状态机实现
20. 第一轮检查结果展示（对/错 + 得分）
21. 改正提交 + 重新检查
22. AI Harness 补充：
    - ContentGuardrail（K-12 内容安全）
    - FallbackHandler（降级策略）
    - help-generate / subject-detect Prompt 模板 + Zod Schema
23. 求助功能（渐进式揭示，经 Harness 管道）
24. 手动录入页面 + 学科自动识别（经 Harness 管道）
25. 错题自动录入错题库

### Sprint 3: 家长视图 + 错题管理 + PWA + 部署 (Week 5-6)

**Week 5:**
26. 家长今日概览页面
27. 作业检查详情时间线
28. 家长基础统计（趋势图、分布图）
29. 家长设置（答案揭示策略）
30. 错题列表页（筛选、搜索、分页）
31. 错题详情页 + 家长备注

**Week 6:**
32. 管理员后台（用户管理、系统配置）
33. PWA 配置（manifest、Service Worker、离线支持）
34. 儿童友好UI适配（大字体大按钮主题）
35. 响应式适配（PC + 手机）
36. Docker镜像构建 + 部署测试
37. 端到端测试 + Bug修复

---

## 12. 边界条件与全局规则

### 12.1 图片处理规则
- 上传前客户端自动检测EXIF方向信息并自动纠正旋转
- 客户端压缩策略：使用 Canvas API 压缩，目标 ≤ 4MB，JPEG质量 0.85
- 压缩后宽度上限 4096px（保持高清可识别）
- 自动剥离 EXIF 中的 GPS 等隐私信息

### 12.2 得分计算规则
- 基础算法：`score = (correctCount / totalQuestions) * 100`，四舍五入取整
- 如果试卷有标注分值，按题目分值加权计算
- 多轮检查：每轮独立计分，`HomeworkSession.finalScore` 取最后一轮得分
- 求助不影响得分（不扣分也不加分）
- 待确认题目（`needsReview = true`）暂按"错"计算，用户修正后重新计分

### 12.3 重复错题去重规则
- 录入新错题时，计算 `contentHash = SHA256(normalize(content))`
- `normalize`：去除空格、标点统一、数字格式化
- 如果 `(studentId, contentHash)` 已存在，不创建新记录，改为更新 `totalAttempts` +1
- 手动录入的错题也走去重逻辑

### 12.4 并发与锁定规则

**乐观锁实现**：
- 写操作（`homework.submitCorrection`、`homework.batchUpdateQuestions`）使用 Prisma `update` 的 `WHERE` 条件加上 `updatedAt` 字段
- 流程：读取当前 `updatedAt` → 执行 `update WHERE { id, updatedAt }` → 如果受影响行数为 0 则抛出冲突错误
- 冲突响应：返回 i18n key `error.dataConflict`（"数据已被修改，请刷新后重试"）
- 需要锁的操作：`submitCorrection`、`batchUpdateQuestions`、`requestHelp`

**求助缓存策略**：
- 求助请求同一题同一Level只执行一次 AI 调用
- 缓存位置：`HelpRequest` 表本身即为缓存——在 `homework.requestHelp` tRPC procedure 中先查询 `HelpRequest WHERE { sessionQuestionId, level, status: 'COMPLETED' }`，有记录则直接返回已有 `aiResponse`，无记录才调用 AI Harness
- 不使用 Redis 缓存（避免 DB/Redis 不一致）

**读写并发**：
- 家长和学生可以同时查看同一数据（读操作无锁）
- 写操作互斥通过上述乐观锁保证
- 不实现实时推送（Phase 1 不需要 WebSocket），家长刷新页面获取最新状态

### 12.5 会话与Token规则
- JWT Token 有效期 7 天
- Token 过期时，如果用户在多轮检查中间，前端缓存未提交的改正数据到 localStorage
- 重新登录后提示"您有未完成的检查，是否继续？"
- Remember Me：30天有效的 Refresh Token

### 12.6 AI调用限流
- 每用户每分钟最多 5 次 AI 调用（OCR + 求助合计）
- 每用户每天最多 100 次 AI 调用
- 超限返回友好提示："请稍后再试，今日使用次数已接近上限"
- 管理员可在系统配置中调整限流参数

### 12.7 帮助等级解锁规则
- Level 1 → Level 2：学生必须提交至少一次新答案（不同于上次答案）
- Level 2 → Level 3：同上
- "不同" 的判定：`trim()` 后字符串不相等即视为不同（不做语义比较，Phase 1 简单实现）
- 如果学生提交的新答案正确，直接标记为已解决，不需要继续求助
- 如果家长设置 maxHelpLevel = 1，学生只能看到Level 1，按钮灰显并提示"家长已设置仅查看思路提示"
- **校验位置**：在 `homework.requestHelp` tRPC procedure 中校验（业务逻辑层），不在 AI Harness 中（Harness 只管 AI 调用层面的关注点）

### 12.8 图片方向自动纠正
- 上传时读取 EXIF Orientation 标签
- 自动旋转到正确方向后再发送到 AI
- 如果无 EXIF 信息，AI Prompt 中加入"如果图片方向不对请先纠正后识别"

---

## 13. 验收检查清单

### 功能验收
- [ ] 新用户可注册（学生/家长角色）
- [ ] 用户可登录/登出
- [ ] 家长可创建家庭组
- [ ] 通过邀请码加入家庭组
- [ ] 家长可管理家庭组成员
- [ ] 手机拍照上传作业图片
- [ ] 多张照片拼接为一份作业
- [ ] 从相册选择图片上传
- [ ] 上传PDF识别
- [ ] AI正确识别试卷内容（文字+手写+公式）
- [ ] AI自动识别学科和内容类型
- [ ] 用户可修正AI识别结果（内联编辑题目/答案，修改对/错判定）
- [ ] 第一轮检查显示对/错和得分
- [ ] 学生改正后可重新提交检查
- [ ] 多轮检查得分变化可见
- [ ] 学生可对不会的题求助（渐进式揭示3级）
- [ ] 家长可设置求助Level上限
- [ ] 检查完成后错题自动录入错题库
- [ ] 手动录入单题错题
- [ ] 错题列表按学科/日期筛选
- [ ] 错题详情页包含完整信息
- [ ] 家长可添加/编辑/删除备注
- [ ] 家长首页显示今日作业检查概览
- [ ] 家长可查看历史日期的检查记录
- [ ] 家长本周打卡日历
- [ ] 家长基础统计图表（趋势+分布）
- [ ] 家长可切换查看不同孩子
- [ ] 管理员可管理用户
- [ ] 管理员可查看系统统计
- [ ] 中/英文切换所有页面正常
- [ ] PWA可安装到手机主屏
- [ ] Docker Compose一键部署成功

### AI Harness 验收
- [ ] AI 返回的 JSON 经过 Zod schema 校验后才进入业务流程
- [ ] AI 返回畸形 JSON 时自动修复（去代码围栏、修复尾逗号）或触发重试
- [ ] Prompt 模板集中管理（src/lib/ai/prompts/），支持变量注入
- [ ] 学生输入嵌入 prompt 前经过 PromptInjectionGuard 净化
- [ ] 高风险注入（riskScore > 0.9）被拦截，不发送 AI 调用
- [ ] AI 生成的求助内容经 ContentGuardrail 过滤后才展示给学生
- [ ] AI 所有重试失败后返回降级结果，不崩溃
- [ ] 所有 AI 调用记录到 AICallLog（含 tokens、耗时、成功/失败）
- [ ] Rate Limit 通过 Redis 滑动窗口实现（5次/分、100次/天）
- [ ] 业务代码通过 Operations 层调用 AI，不直接使用 AIProvider

### 非功能验收
- [ ] 单张图片AI识别 ≤ 30秒
- [ ] 页面首次加载 ≤ 3秒
- [ ] 手机端触摸操作流畅
- [ ] 小学生界面大字体大按钮
- [ ] HTTPS传输 + 密码bcrypt哈希
- [ ] 所有容器使用 star-catcher 前缀命名
