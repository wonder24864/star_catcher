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
cp deploy/.env.dev.example .env
# 编辑 .env，填入 Azure OpenAI 凭证和密码

# 启动基础服务（PostgreSQL、Redis、MinIO、App）
# 所有容器使用 star-catcher-* 前缀
docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d

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
业务代码 -> Operations 层 -> AI Harness 组件管道 -> AI Provider
                              |
                              ├── 限流器 → 注入防御 → Prompt 管理器
                              ├── 语义缓存查询 → AI 调用 → 输出校验(Zod)
                              ├── 内容安全(K-12) → 语义缓存存储
                              ├── 日志记录（always）+ OTel 追踪
                              └── 每个组件实现 HarnessComponent 接口
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
│
│── 部署 ──────────────────────────────────────────────────
├── Dockerfile                 # 多阶段构建（App + Worker + Seed）
├── deploy/
│   ├── DEPLOY-DEV.md                  # 开发环境搭建指南
│   ├── DEPLOY-PROD.md                 # 生产部署指南（NAS）
│   ├── docker-compose.dev.yml         # 开发环境（build + 端口全开）
│   ├── docker-compose.prod.yml        # 生产环境（预构建镜像 + 健康检查 + 资源限制）
│   ├── .env.dev.example               # 开发环境变量模板
│   ├── .env.prod.example              # 生产环境变量模板
│   └── scripts/
│       ├── docker-entrypoint.sh       # 容器入口（迁移 + 种子）
│       ├── deploy.sh                  # 一键部署到 NAS
│       └── backup-db.sh              # PostgreSQL 定时备份
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
│   ├── PHASE3-LAUNCH-PLAN.md  # Phase 3 启动计划（精简索引 — 模块/决策/验收）
│   ├── phase3-db-schema.md    # Phase 3 DB 模型设计（Sprint 10a 迁移用）
│   ├── adr/                   # 架构决策记录（11 个）
│   ├── user-stories/          # 用户故事（14 个模块）
│   ├── PHASE4-LAUNCH-PLAN.md  # Phase 4 启动计划（家长仪表盘 + 体验优化）
│   ├── PHASE5-LAUNCH-PLAN.md  # Phase 5 启动计划（Brain 优化 + UI 现代化）
│   └── sprints/               # Sprint 计划（Phase 2: 1~9, Phase 3: 10a~16, Phase 4: 17~22, Phase 5: 23~）
│
│── Skill 插件 ────────────────────────────────────────────
├── skills/                    # Skill 插件源码 + 编译产物（17 个内置 Skill）
│   ├── echo/                      # Echo Skill（IPC 流程测试用）
│   ├── harness-call/              # AI 调用 Skill（IPC→Harness 链路测试用）
│   ├── recognize-homework/        # OCR 识别 Skill（拍照 → 结构化题目）
│   ├── grade-answer/              # 答案评分 Skill（判定正误）
│   ├── help-generate/             # 渐进提示 Skill（3 级求助）
│   ├── subject-detect/            # 学科检测 Skill（自动识别学科）
│   ├── extract-knowledge-points/  # 教材目录提取 Skill（AI → 知识点层级树）
│   ├── search-knowledge-points/   # 知识点搜索 Skill（纯 DB 查询，IPC query）
│   ├── classify-question-knowledge/ # 题目知识点分类 Skill（AI 置信度评分）
│   ├── diagnose-error/            # 错误诊断 Skill（错误模式分析 + 薄弱诊断）
│   ├── weakness-profile/          # 薄弱分析 Skill（MasteryState 聚合 → severity/trend）
│   ├── generate-daily-tasks/      # 干预规划 Skill（薄弱数据 → 每日任务计划）
│   ├── find-similar-questions/    # 类似题检索 Skill（KP + pgvector 双路，纯 IPC 编排）
│   ├── generate-explanation-card/ # 讲解卡 Skill（三格式 AI 生成：static/interactive/conversational）
│   ├── evaluate-mastery/          # 掌握评估 Skill（综合表现 → MasteryState 转换 + SM-2 调整建议）
│   ├── get-intervention-history/  # 干预历史读取 Skill（Memory 代理，提供更深历史窗口）
│   ├── eval-judge/                # AI 质量评判 Skill（Sprint 16 — 对比 actual vs expected 打 1-5 分）
│   └── generate-learning-suggestions/ # 学习建议 Skill（薄弱+掌握+干预 → AI 个性化建议三区）
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
    │   │   ├── mastery/               # 掌握地图（掌握度 + 间隔复习 + 复习对话框 + 进度图 + 画像入口）
    │   │   ├── student/profile/       # 学生画像（掌握仪表盘 + 累计进度图 + 学习旅程时间线）
    │   │   ├── tasks/                 # 今日任务包（三种卡片 + 进度条 + 标记完成）
    │   │   ├── parent/                # 家长视图
    │   │   │   ├── overview/              # 今日概览
    │   │   │   ├── stats/                 # 学习统计（含纠正率分布 + 帮助频率明细）
    │   │   │   ├── suggestions/           # 学习建议（AI 三区 + 干预效果 + 时间线）
    │   │   │   ├── comparison/            # 多孩学习对比（2+ 学生时可用）
    │   │   │   ├── sessions/[sessionId]/  # 检查时间线
    │   │   │   └── reports/               # 学习报告（周报/月报）
    │   │   ├── admin/                 # 管理后台
    │   │   │   ├── users/[id]/            # 用户管理 + 详情
    │   │   │   ├── settings/              # 系统配置
    │   │   │   ├── knowledge-graph/       # 知识图谱管理（列表/层级编辑拖拽）
    │   │   │   │   └── mappings/          # 低置信度映射审核（Sprint 15 US-055）
    │   │   │   ├── brain/                 # Learning Brain 监控（Sprint 15 US-057）
    │   │   │   ├── eval/                  # AI 质量评估（Sprint 16 US-058 — 数据集 + 运行历史 + 详情）
    │   │   │   ├── skills/                # Skill 管理
    │   │   │   └── agent-traces/[traceId]/ # Agent 追踪（列表 + 详情时序图 + Jaeger 链接）
    │   │   ├── family/                # 家庭组管理
    │   │   └── settings/              # 个人设置
    │   ├── api/trpc/[trpc]/       # tRPC 端点
    │   └── sw.ts                  # Service Worker（PWA 离线缓存）
    │
    ├── components/            # ── UI 组件 ──
    │   ├── agent-summary-card.tsx   # AI 分析摘要卡片（家长/学生简化视图）
    │   ├── adaptive/              # 年级自适应组件（卡片、按钮、进度条、分数、学科徽章）
    │   ├── admin/                 # 管理员专用组件（KG 拖拽编辑器 / KG 2D 力导向图 / LiveIndicator 实时指示灯 / Jaeger 链接）
    │   ├── animation/             # 动画组件（页面过渡、Lottie、Three.js 星空、庆祝动画）
    │   ├── homework/              # 拍照 / 照片网格
    │   ├── dashboard/             # 首页组件（今日复习 Widget）
    │   ├── mastery/               # 掌握地图组件（复习对话框）
    │   ├── pro/                   # Pro 组件库（GlassCard/CountUp/GaugeChart/StatusPulse/GradientMesh/InteractiveChart/CommandPalette/StatCard — admin+parent 共用）
    │   ├── profile/               # 学生画像组件（HistoricalProgressChart — tier 自适应进度图）
    │   ├── tasks/                 # 今日任务组件（TaskCard + PracticeDialog + ExplanationDialog + ExplanationCard 三格式）
    │   ├── nav/                   # 侧边栏（TierSidebar tier 门控）/ 底部导航（年级自适应）/ 学生切换
    │   ├── providers/             # Session / GradeTier Provider（4 级年级自适应）
    │   └── ui/                    # shadcn/ui 基础组件（含 Skeleton）
    │
    ├── hooks/                 # ── React Hooks ──
    │   ├── use-reduced-motion.ts    # prefers-reduced-motion 检测（SSR 安全）
    │   ├── use-tier-translations.ts  # 年级自适应 i18n（useTierTranslations — useTranslations 同构替换）
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
    │   │   ├── telemetry/         # OpenTelemetry 观测（initTelemetry + withSpan + captureOtelTraceId + buildJaegerUrl）
    │   │   └── events.ts          # Redis Pub/Sub 事件桥
    │   │
    │   ├── domain/            # 业务逻辑
    │   │   ├── ai/                # AI Harness 管道
    │   │   │   ├── harness/           # 组件管道（8 个组件 + SemanticCache）
    │   │   │   │   └── components/        # 管道组件类（RateLimiter/InjectionGuard/...）
    │   │   │   ├── embedding/         # EmbeddingProvider 抽象层（Azure/未来 Ollama）
    │   │   │   ├── operations/        # 业务操作（13 个）+ registry.ts（通用路由）
    │   │   │   ├── prompts/           # Prompt 模板
    │   │   │   ├── eval/              # EvalFramework（Sprint 16 US-058 — EvalRunner + 数据集 Zod + deep-equal compare）
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
    │   │   │   ├── memory-write-interceptor.ts # memoryWriteManifest 拦截器
    │   │   │   ├── definitions/       # Agent 定义（代码声明，非 DB）
    │   │   │   │   ├── question-understanding.ts  # 题目理解 Agent
    │   │   │   │   ├── diagnosis.ts               # 诊断 Agent
    │   │   │   │   └── intervention-planning.ts   # 干预规划 Agent
    │   │   ├── similar-questions/ # 类似题检索（KP + pgvector 双路纯函数）
    │   │   ├── daily-task/        # DailyTask 完成事务 helper（router + practice 共用）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── brain/             # Learning Brain 编排器（Phase 3）
    │   │   │   ├── learning-brain.ts  # 确定性决策逻辑（不调 AI）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── memory/            # Student Memory 层（Phase 2）
    │   │   │   ├── types.ts           # 状态机定义 + Memory 接口
    │   │   │   ├── student-memory.ts  # StudentMemoryImpl（状态机 + SM-2 复习 + 自动转换）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── weakness/          # 薄弱分析计算（Phase 3）
    │   │   │   ├── compute-profile.ts # severity/trend 计算纯函数（handler 侧）
    │   │   │   └── semester.ts        # 学期日期计算（中国学制 2月/9月分界）
    │   │   ├── school-level.ts    # 年级→学段映射 + 学段比较工具
    │   │   ├── spaced-repetition/ # SM-2 + 混合调度（Phase 2 + Sprint 14 hybrid 调整因子）
    │   │   │   ├── sm2.ts             # SM-2 纯函数（calculateSM2 + mapQuality）
    │   │   │   └── index.ts           # 公共导出
    │   │   ├── admin-log.ts        # AdminLog 领域工具函数（审计日志）
    │   │   ├── auth.ts            # NextAuth 认证配置
    │   │   ├── scoring.ts         # 得分计算
    │   │   ├── content-hash.ts    # SHA256 去重哈希
    │   │   └── validations/       # Zod 校验（auth/upload/homework）
    │   │
    │   ├── constants/         # 共享常量
    │   │   └── subject-colors.ts  # 学科颜色（HEX + Tailwind Badge 类）
    │   ├── utils.ts           # cn() 工具函数
    │   ├── stores/            # Zustand 客户端状态
    │   ├── trpc/              # tRPC 客户端（含 SSE splitLink）
    │   └── upload/            # 图片压缩（EXIF 校正）
    │
    ├── server/                # ── tRPC 服务端 ──
    │   ├── trpc.ts                # 初始化 + 角色中间件 + SSE 配置
    │   ├── context.ts             # 上下文工厂
    │   └── routers/               # 路由器（15 个业务 + 1 个订阅，含 Sprint 23 brain triggerBrain/overrideCooldown）
    │       └── shared/                # 共享工具（resolveStudentId 权限校验）
    │
    ├── worker/                # ── BullMQ Worker（独立 Docker 服务）──
    │   ├── index.ts               # 入口（Handler Registry + Schedule Registry）
    │   ├── handler-registry.ts    # AIJobName → Handler 注册表（Rule 9）
    │   ├── schedule-registry.ts   # 声明式定时任务注册（Rule 9）
    │   └── handlers/              # OCR 识别 / 改正照片 / 求助生成 / 题目理解 / 诊断 / Learning Brain / 干预规划 / 掌握评估 / Embedding 生成 / Eval 运行（Sprint 16）
    │
    ├── cli/                   # ── CLI 工具 ──
    │   ├── skill-scaffold.ts      # Skill 脚手架（交互式 / 参数模式）
    │   └── skill-build.ts         # Skill 构建（校验 + 编译 + Prisma 检查）
    │
    ├── tests/                 # ── 测试（78 文件，1091+ 用例）──
    │   ├── acceptance/            # 验收测试（9 个用户故事模块）
    │   ├── unit/                  # 单元测试（含 Skill 运行时 / Agent 组件 / EvalRunner 等）
    │   ├── integration/           # 集成测试（端到端闭环场景 Sprint 14→16）
    │   ├── harness/               # Harness 管道 + SemanticCache 测试
    │   ├── worker/                # Handler Registry + Schedule Registry + eval-run handler
    │   ├── perf/                  # 性能测试（Knowledge Graph CTE 等）
    │   ├── architecture/          # 架构守护（Harness 完整性 + i18n 覆盖）
    │   ├── fixtures/skills/       # 测试用 Skill 夹具（echo/error/security）
    │   └── helpers/               # 测试辅助（mock-db/storage/auth/ai）
    │
    └── types/                 # TypeScript 类型声明
│
│── EvalFramework 数据集 ─────────────────────────────────
tests/eval/
├── datasets/                   # 每个 AIOperationType 一个 JSON（Sprint 16 US-058）
│   ├── subject-detect.json     # 4 条：数学/中文/英语/物理学科识别
│   ├── help-generate.json      # 3 条：L1/L2/L3 渐进提示
│   ├── grade-answer.json       # 4 条：正确/错误/同义回答
│   ├── extract-knowledge-points.json  # 3 条：教材 TOC → KP 树
│   ├── classify-question-knowledge.json # 3 条：题目 → KP 候选分类
│   ├── diagnose-error.json     # 3 条：加法进位/分数约分/周长面积混用
│   ├── intervention-plan.json  # 3 条：严重/多 KP 混合/maxTasks 限制
│   ├── mastery-evaluate.json   # 3 条：升为 MASTERED / 回落 REGRESSED / 维持 REVIEWING
│   ├── generate-explanation.json  # 3 条：static/interactive/conversational 三格式
│   ├── ocr-recognize.json      # 2 张合成图 smoke test（scripts/gen-ocr-fixtures.ts 生成），非生产基线
│   └── {weakness-profile, find-similar, eval-judge}.json  # stub，明示 unavailableReason
└── fixtures/ocr/README.md      # OCR 题图素材规格说明
│
│── 运维脚本 ────────────────────────────────────────────
└── scripts/
    └── backfill-embeddings.ts # ErrorQuestion embedding 回填脚本（Sprint 13）
```

## 分阶段路线图

| 阶段 | 重点 | 关键交付物 |
|------|------|-----------|
| **Phase 1** | 基础错题本 (MVP) | 认证、家庭组、拍照上传、AI 识别、多轮检查、错题管理、家长日视图、PWA、国际化、Docker |
| **Phase 2** | AI 理解 + 知识图谱 | 知识图谱构建、题目理解 Agent、诊断 Agent、掌握度追踪、家长报表 v1 |
| **Phase 3** | 学习闭环 + 干预 | 薄弱分析、干预规划、复习排程、今日任务包、类似题、讲解卡/练习卡 |
| **Phase 4** | 家长仪表盘 + 体验优化 | 家长分析增强、学习建议、干预追踪、4 级年级自适应动画、学生画像可视化 |
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
