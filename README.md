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
├── CLAUDE.md                  # AI 助手开发指南（规则、文档地图、自审清单）
├── README.md                  # 本文件
├── LICENSE                    # 开源协议
├── .gitignore                 # Git 忽略规则（Next.js + 本地基础设施）
├── .env.example               # 环境变量模板（不提交到 Git）
├── docker-compose.yml         # Docker Compose 部署配置（不提交到 Git）
│
├── prisma/
│   └── schema.prisma          # 数据库模型定义（Prisma Schema，数据层唯一真相源）
│
├── docs/                      # 项目文档
│   ├── REQUIREMENTS.md        # 全阶段系统需求（稳定，~330 行）
│   ├── ARCHITECTURE.md        # 架构设计：AI Harness 管道、异步任务、路由、错误处理
│   ├── DESIGN-SYSTEM.md       # UI/UX 设计系统：3 套年龄段主题、组件规范、响应式断点
│   ├── BUSINESS-RULES.md      # 业务规则：得分计算、去重、并发锁、帮助等级、限流
│   │
│   ├── user-stories/          # 用户故事（按模块拆分，每文件 < 100 行）
│   │   ├── _index.md          # 用户故事注册表（30 个故事 → 模块 + Sprint 映射）
│   │   ├── auth.md            # US-001~003: 注册、登录、个人信息
│   │   ├── family.md          # US-004~007: 家庭组创建、邀请、成员管理、学生切换
│   │   ├── homework-input.md  # US-008~012: 拍照、多张、手动录入、PDF、截图
│   │   ├── ai-recognition.md  # US-013~015: AI 识别、判分、用户修正
│   │   ├── homework-check.md  # US-016~019: 多轮检查、改正、渐进式求助、结束
│   │   ├── error-management.md # US-020~022: 错题列表、详情、家长备注
│   │   ├── parent-view.md     # US-023~026: 每日概览、检查详情、统计、策略设置
│   │   ├── admin.md           # US-027~028: 用户管理、系统配置
│   │   └── pwa-i18n.md        # US-029~030: PWA 安装、中英文切换
│   │
│   ├── adr/                   # 架构决策记录（ADR）
│   │   ├── 001-ai-harness-pipeline.md    # 为什么所有 AI 调用必须经过 Harness 管道
│   │   ├── 002-prisma-source-of-truth.md # 为什么 schema.prisma 是数据层唯一真相源
│   │   ├── 003-bullmq-async-ai.md        # 为什么 OCR 用 BullMQ 异步 + 轮询
│   │   ├── 004-progressive-help-reveal.md # 为什么用 3 级渐进式求助 + 答案变更门控
│   │   ├── 005-content-hash-dedup.md     # 为什么用 SHA256 内容哈希去重错题
│   │   ├── 006-optimistic-locking.md     # 为什么用乐观锁而非悲观锁
│   │   └── 007-i18n-prompt-strategy.md   # 为什么用英文 Prompt + locale 变量注入
│   │
│   ├── sprints/               # Sprint 工作文档
│   │   ├── sprint-1.md        # Week 1-2: 基础架构 + 用户系统 + 家庭组
│   │   ├── sprint-2.md        # Week 3-4: 作业录入 + AI Harness + AI 识别 + 多轮检查
│   │   └── sprint-3.md        # Week 5-6: 家长视图 + 错题管理 + PWA + 部署
│   │
│   └── archive/               # 归档文档
│       └── PRD-Phase1-original.md  # 原始单文件 PRD（已拆分，仅供参考）
│
└── tests/                     # 测试
    ├── acceptance/            # 验收测试桩（与用户故事一一对应）
    │   ├── auth.test.ts       # US-001~003 验收测试
    │   ├── family.test.ts     # US-004~007 验收测试
    │   ├── homework-input.test.ts  # US-008~012 验收测试
    │   ├── ai-recognition.test.ts  # US-013~015 验收测试
    │   ├── homework-check.test.ts  # US-016~019 验收测试
    │   ├── error-management.test.ts # US-020~022 验收测试
    │   ├── parent-view.test.ts     # US-023~026 验收测试
    │   ├── admin.test.ts           # US-027~028 验收测试
    │   └── pwa-i18n.test.ts       # US-029~030 验收测试
    │
    └── architecture/          # 架构守护测试（自动化检查）
        ├── harness-integrity.test.ts  # 检测是否有代码绕过 AI Harness 管道
        └── i18n-coverage.test.ts      # 检测翻译 key 在中英文文件中是否齐全
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
