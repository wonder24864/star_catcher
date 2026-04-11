# Star Catcher

面向 K-12 学生的智能错题本系统。以家庭为核心（学生 + 家长 + 管理员），构建从"错误发生"到"稳定掌握"的完整学习闭环。

## 技术栈

- **前端**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **后端**: Next.js API Routes + tRPC
- **数据库**: PostgreSQL + Redis
- **AI**: Azure OpenAI GPT-5.4（通过 AI Harness 管道调用，支持未来切换本地模型）
- **文件存储**: MinIO（S3 兼容）
- **认证**: NextAuth.js
- **国际化**: next-intl（中英双语）
- **任务队列**: BullMQ
- **部署**: Docker Compose（自托管）

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd star_catcher

# 复制环境配置
cp .env.example .env
# 编辑 .env，填入 Azure OpenAI 凭证和密码

# 启动基础服务（PostgreSQL、Redis、MinIO、App）
# 所有容器使用 star-catcher-* 前缀
docker compose -p star-catcher up -d

# 安装依赖
npm install

# 数据库迁移 + 创建管理员账号
npx prisma migrate dev
npx prisma db seed

# 启动开发服务器
npm run dev
```

## 架构概览

### 学习闭环

```
输入层     -> 拍照/PDF/手动录入，AI 自动识别学科
理解层     -> OCR、结构化、题目理解、诊断
决策层     -> 薄弱分析、干预规划、复习排程
执行层     -> 今日任务、讲解卡、练习卡、类似题
反馈层     -> 答案收集、掌握度评估、状态更新
学生记忆   -> 错题资产、掌握状态、干预历史、学生画像
学习大脑   -> 基于 LLM 的全局编排器，协调所有 Agent 和 Skill
```

### AI Harness 管道

所有 AI 调用必须经过 Harness 管道（不允许直接调用 Provider）：

```
业务代码 -> Operations 层 -> AI Harness 管道 -> AI Provider
                              |
                              ├── 调用前: 限流器、注入防御、Prompt 管理器
                              ├── 调用后: 输出校验(Zod)、内容安全(K-12)、调用日志
                              └── 异常:   降级处理（优雅退化）
```

### AI 架构演进

```
Phase 1: AI-as-a-Function    代码驱动，AI 被动执行单次调用
Phase 2: AI-with-Tools       AI 通过 function calling 自主选择调用 Skills
Phase 3: Agentic Loop         Learning Brain 全局编排，自主循环决策
```

三个阶段共享同一 Harness 安全管道。详见 `docs/ARCHITECTURE.md` Section 6。

## 项目目录结构

```
star_catcher/
│
│── 配置 ──────────────────────────────────────────────────
├── package.json               # 依赖 + scripts
├── tsconfig.json              # TypeScript 配置（@/ → src/）
├── next.config.ts             # Next.js 配置（i18n + PWA）
├── vitest.config.ts           # 测试框架配置
├── components.json            # shadcn/ui 组件路径
├── .env.example               # 环境变量模板
│
│── 部署 ──────────────────────────────────────────────────
├── Dockerfile                 # 多阶段构建（App + Worker）
├── docker-compose.yml         # 一键部署（App + Worker + PG + Redis + MinIO）
├── scripts/docker-entrypoint.sh
│
│── 数据 ──────────────────────────────────────────────────
├── prisma/schema.prisma       # 数据模型（唯一真相源）
├── public/manifest.json       # PWA 清单 + 图标
│
│── 文档 ──────────────────────────────────────────────────
├── docs/
│   ├── REQUIREMENTS.md        # 全阶段需求
│   ├── ARCHITECTURE.md        # 架构设计（AI Harness + 异步队列 + SSE）
│   ├── DESIGN-SYSTEM.md       # 设计系统（3 套主题 + 响应式）
│   ├── BUSINESS-RULES.md      # 业务规则
│   ├── ROADMAP.md             # 路线图
│   ├── PHASE2-LAUNCH-PLAN.md  # Phase 2 启动计划 + 设计决策记录
│   ├── adr/                   # 架构决策记录（11 个）
│   ├── user-stories/          # 用户故事（12 个模块）
│   └── sprints/               # Sprint 计划（8 个：1, 2, 3, 4a, 4b, 5, 6, 7, 8）
│
│── Skill 示例 ────────────────────────────────────────────
├── skills/                    # Skill 插件源码 + 编译产物
│   ├── echo/                      # Echo Skill（IPC 流程测试用）
│   ├── harness-call/              # AI 调用 Skill（IPC→Harness 链路测试用）
│   ├── diagnose-error/            # 错误诊断 Skill（业务示例）
│   ├── extract-knowledge-points/  # 教材目录提取 Skill（AI → 知识点层级树）
│   ├── search-knowledge-points/   # 知识点搜索 Skill（纯 DB 查询，IPC query）
│   └── classify-question-knowledge/ # 题目知识点分类 Skill（AI 置信度评分）
│
│── 源码 ──────────────────────────────────────────────────
└── src/
    │
    ├── app/                   # ── 页面层（Next.js App Router）──
    │   ├── [locale]/(auth)/       # 登录 / 注册
    │   ├── [locale]/(dashboard)/  # 受保护的功能页面
    │   │   ├── check/                 # 作业检查
    │   │   │   ├── new/                   # 新建检查（拍照上传）
    │   │   │   ├── manual/                # 手动录入错题
    │   │   │   └── [sessionId]/results/   # 检查结果 + 多轮改正
    │   │   ├── errors/                # 错题管理
    │   │   │   ├── page.tsx               # 错题列表（筛选/搜索/分页）
    │   │   │   └── [id]/page.tsx          # 错题详情（AI 摘要 + 家长备注）
    │   │   ├── mastery/               # 掌握地图（掌握度 + 间隔复习 + 复习对话框）
    │   │   ├── parent/                # 家长视图
    │   │   │   ├── overview/              # 今日概览
    │   │   │   ├── stats/                 # 学习统计
    │   │   │   ├── sessions/[sessionId]/  # 检查时间线
    │   │   │   └── reports/               # 学习报告（周报/月报）
    │   │   ├── admin/                 # 管理后台
    │   │   │   ├── users/[id]/            # 用户管理 + 详情
    │   │   │   ├── settings/              # 系统配置
    │   │   │   ├── knowledge-graph/       # 知识图谱管理
    │   │   │   ├── skills/                # Skill 管理
    │   │   │   └── agent-traces/[traceId]/ # Agent 追踪（列表 + 详情时序图）
    │   │   ├── family/                # 家庭组管理
    │   │   └── settings/              # 个人设置
    │   ├── api/trpc/[trpc]/       # tRPC 端点
    │   └── sw.ts                  # Service Worker（PWA 离线缓存）
    │
    ├── components/            # ── UI 组件 ──
    │   ├── agent-summary-card.tsx   # AI 分析摘要卡片（家长/学生简化视图）
    │   ├── homework/              # 拍照 / 照片网格
    │   ├── dashboard/             # 首页组件（今日复习 Widget）
    │   ├── mastery/               # 掌握地图组件（复习对话框）
    │   ├── nav/                   # 侧边栏 / 底部导航 / 学生切换
    │   ├── providers/             # Session / Theme Provider
    │   └── ui/                    # shadcn/ui 基础组件
    │
    ├── hooks/                 # ── React Hooks ──
    │   └── use-upload.ts          # 上传编排（压缩→预签名→上传→确认）
    │
    ├── i18n/                  # ── 国际化 ──
    │   ├── config.ts              # 语言列表 + 默认语言
    │   ├── request.ts             # next-intl 请求配置
    │   └── messages/              # 翻译文件
    │       ├── zh.json
    │       └── en.json
    │
    ├── lib/                   # ── 共享库（分层组织）──
    │   │
    │   ├── infra/             # 基础设施（外部服务连接）
    │   │   ├── db/                # Prisma 客户端（含软删除扩展）
    │   │   ├── redis.ts           # Redis 客户端
    │   │   ├── storage/           # MinIO 文件存储
    │   │   ├── queue/             # BullMQ 异步队列（连接/类型/入队）
    │   │   └── events.ts          # Redis Pub/Sub 事件桥
    │   │
    │   ├── domain/            # 业务逻辑
    │   │   ├── ai/                # AI Harness 管道
    │   │   │   ├── harness/           # 管道组件（7 个）
    │   │   │   ├── operations/        # 业务操作（OCR/判分/求助/学科检测）
    │   │   │   ├── prompts/           # Prompt 模板
    │   │   │   └── providers/         # AI 提供商（Azure OpenAI / FC 适配器）
    │   │   ├── skill/             # Skill 插件系统（Phase 2）
    │   │   │   ├── types.ts           # IPC 协议 + 执行上下文类型
    │   │   │   ├── runtime.ts         # SkillRuntime（worker_threads 生命周期）
    │   │   │   ├── sandbox-worker.js  # 沙箱 Worker（vm 隔离执行）
    │   │   │   ├── schema-adapter.ts  # Canonical JSON Schema → 多 Provider 转换
    │   │   │   ├── bundle.ts          # Bundle 格式定义 + 校验
    │   │   │   ├── registry.ts        # SkillRegistry（DB 缓存 + ACTIVE 过滤）
    │   │   │   ├── scaffold.ts        # 脚手架（生成 Skill 模板文件）
    │   │   │   └── build.ts           # 构建（校验 + esbuild 编译 + Prisma 检查）
    │   │   ├── agent/             # Agent Runner（Phase 2）
    │   │   │   ├── types.ts           # Agent 定义 + Function Calling 类型
    │   │   │   ├── runner.ts          # AgentRunner（function calling 循环）
    │   │   │   ├── step-limiter.ts    # AgentStepLimiter（步数限制，ADR-008 ≤ 10）
    │   │   │   ├── cost-tracker.ts    # CostTracker（Token 预算追踪）
    │   │   │   ├── circuit-breaker.ts # CircuitBreaker（熔断 + 多 Provider 降级）
    │   │   │   ├── trace-publisher.ts # AgentTracePublisher（Redis Pub/Sub 推送）
    │   │   │   ├── definitions/       # Agent 定义（代码声明，非 DB）
    │   │   │   │   └── question-understanding.ts  # 题目理解 Agent
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── memory/            # Student Memory 层（Phase 2）
    │   │   │   ├── types.ts           # 状态机定义 + Memory 接口
    │   │   │   ├── student-memory.ts  # StudentMemoryImpl（状态机 + SM-2 复习 + 自动转换）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── spaced-repetition/ # SM-2 间隔复习算法（Phase 2）
    │   │   │   ├── sm2.ts             # SM-2 纯函数（calculateSM2 + mapQuality）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── auth.ts            # NextAuth 认证配置
    │   │   ├── scoring.ts         # 得分计算
    │   │   ├── content-hash.ts    # SHA256 去重哈希
    │   │   └── validations/       # Zod 校验（auth/upload/homework）
    │   │
    │   ├── utils.ts           # cn() 工具函数
    │   ├── stores/            # Zustand 客户端状态
    │   ├── trpc/              # tRPC 客户端（含 SSE splitLink）
    │   └── upload/            # 图片压缩（EXIF 校正）
    │
    ├── server/                # ── tRPC 服务端 ──
    │   ├── trpc.ts                # 初始化 + 角色中间件 + SSE 配置
    │   ├── context.ts             # 上下文工厂
    │   └── routers/               # 路由器（12 个业务 + 1 个订阅）
    │
    ├── worker/                # ── BullMQ Worker（独立 Docker 服务）──
    │   ├── index.ts               # 入口（监听 ai-jobs 队列）
    │   └── handlers/              # OCR 识别 / 改正照片 / 求助生成 / 题目理解 / 诊断
    │
    ├── cli/                   # ── CLI 工具 ──
    │   ├── skill-scaffold.ts      # Skill 脚手架（交互式 / 参数模式）
    │   └── skill-build.ts         # Skill 构建（校验 + 编译 + Prisma 检查）
    │
    ├── tests/                 # ── 测试（43 文件，708+ 用例）──
    │   ├── acceptance/            # 验收测试（9 个用户故事模块）
    │   ├── unit/                  # 单元测试（含 Skill 运行时 / Agent 组件）
    │   ├── perf/                  # 性能测试（Knowledge Graph CTE 等）
    │   ├── architecture/          # 架构守护（Harness 完整性 + i18n 覆盖）
    │   ├── fixtures/skills/       # 测试用 Skill 夹具（echo/error/security）
    │   └── helpers/               # 测试辅助（mock-db/storage/auth/ai）
    │
    └── types/                 # TypeScript 类型声明
```

## 分阶段路线图

| 阶段 | 重点 | 关键交付物 |
|------|------|-----------|
| **Phase 1** | 基础错题本 (MVP) | 认证、家庭组、拍照上传、AI 识别、多轮检查、错题管理、家长日视图、PWA、国际化、Docker |
| **Phase 2** | AI 理解 + 知识图谱 | 知识图谱构建、题目理解 Agent、诊断 Agent、掌握度追踪、家长报表 v1 |
| **Phase 3** | 学习闭环 + 干预 | 薄弱分析、干预规划、复习排程、今日任务包、类似题、讲解卡/练习卡 |
| **Phase 4** | 家长仪表盘 + 体验优化 | 完整家长仪表盘、详细分析、学习建议、干预追踪、儿童友好 UI 优化 |
| **Phase 5** | 持续优化 | 学习大脑升级、本地模型部署、Android APK、多教材版本支持、安全增强 |

## 未来规划

- [ ] 通过 TWA 打包 Android APK
- [ ] 本地模型部署（Ollama/vLLM）降低 API 成本
- [ ] 多教材版本支持（人教版/北师大版/苏教版）
- [ ] 商业级安全（数据加密、审计日志、GDPR/个保法合规）
- [ ] 学习数据导出 PDF 报告
- [ ] 第三方登录（微信/Google OAuth）
- [ ] 运营管理后台（商业化部署）
- [ ] 教师角色：班级薄弱分析、定向布置作业
- [ ] 学习社区：匿名同龄对比（严格隐私保护）
- [ ] AI 成本优化：本地小模型 + 云端大模型混合调度
