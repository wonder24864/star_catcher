# Star Catcher — 开发环境搭建指南

## 架构概览

```
开发机 (Windows + Docker Desktop)
┌─────────────────────────────────────────────────┐
│                                                 │
│  npm run dev (Next.js :3000)                    │
│      ↕ tRPC          ↕ BullMQ                   │
│  ┌───────────── Docker Compose ───────────────┐ │
│  │  star-catcher-db     (PostgreSQL :5432)     │ │
│  │  star-catcher-redis  (Redis :6379)          │ │
│  │  star-catcher-minio  (MinIO :9000 / :9001)  │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

开发模式下，Next.js 和 Worker 直接在本机运行（`npm run dev`），只用 Docker 跑基础设施。

---

## 前置准备

| 项目 | 版本要求 | 检查命令 |
|------|---------|---------|
| Node.js | 22+ | `node -v` |
| npm | 10+ | `npm -v` |
| Docker Desktop | 已启动 | `docker --version` |
| Git | 任意 | `git --version` |
| Azure OpenAI 凭证 | API Key + Endpoint + Deployment | Azure Portal |

---

## 首次搭建

### 第 1 步：克隆项目

```bash
git clone <repo-url>
cd star_catcher
```

### 第 2 步：安装依赖

```bash
npm install
```

### 第 3 步：配置环境变量

```bash
# 从模板复制
cp deploy/.env.dev.example .env
```

编辑根目录的 `.env` 文件，需要修改：

| 变量 | 怎么填 |
|------|--------|
| `DB_PASSWORD` | 开发环境随便填，比如 `dev123` |
| `MINIO_ACCESS_KEY` | 开发环境可用默认 `minioadmin` |
| `MINIO_SECRET_KEY` | 开发环境可用默认 `minioadmin` |
| `AZURE_OPENAI_API_KEY` | 你的 Azure OpenAI Key |
| `AZURE_OPENAI_ENDPOINT` | 形如 `https://xxx.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | 你的模型部署名称（如 `gpt-5.4`） |
| `NEXTAUTH_SECRET` | 开发环境随便填，比如 `dev-secret-key-12345` |
| `ADMIN_DEFAULT_PASSWORD` | 管理员密码，比如 `admin123` |

> `.env` 文件已在 `.gitignore` 中，不会被提交。

### 第 4 步：启动基础设施容器

```bash
docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d
```

等待容器启动完成：
```bash
docker compose -p star-catcher -f deploy/docker-compose.dev.yml ps
# 应该看到 3 个容器 running：star-catcher-db, star-catcher-redis, star-catcher-minio
```

> 注意：dev compose 中也定义了 app 和 worker 容器，但日常开发不需要启动它们——直接用 `npm run dev`。
> 如果你只想启动基础设施：
> ```bash
> docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d star-catcher-db star-catcher-redis star-catcher-minio
> ```

### 第 5 步：初始化数据库

```bash
# 执行数据库迁移（创建表结构）
npx prisma migrate dev

# 创建管理员账号 + 注册内置 Skill
npx prisma db seed
```

### 第 6 步：启动开发服务器

```bash
npm run dev
```

打开浏览器访问 **http://localhost:3000**

- 用 `admin` + 你设置的 `ADMIN_DEFAULT_PASSWORD` 登录
- 尝试：创建作业 → 拍照上传 → AI 识别

---

## 日常开发

### 每天开始工作

```bash
# 1. 确保 Docker Desktop 已启动

# 2. 启动基础设施（如果没在运行）
docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d star-catcher-db star-catcher-redis star-catcher-minio

# 3. 启动开发服务器
npm run dev
```

### 数据库相关

```bash
# 修改了 prisma/schema.prisma 后，生成新的迁移
npx prisma migrate dev --name 描述

# 重新生成 Prisma Client（修改 schema 后）
npx prisma generate

# 打开 Prisma Studio（可视化查看/编辑数据库）
npx prisma studio
```

### 查看 MinIO 控制台

浏览器访问 **http://localhost:9001**
- 用户名：`.env` 中的 `MINIO_ACCESS_KEY`（默认 `minioadmin`）
- 密码：`.env` 中的 `MINIO_SECRET_KEY`（默认 `minioadmin`）

可以在这里查看上传的图片文件。

### 查看容器日志

```bash
# 查看数据库日志
docker logs star-catcher-db --tail 20

# 查看 Redis 日志
docker logs star-catcher-redis --tail 20
```

### 停止开发环境

```bash
# 停止 Next.js：终端按 Ctrl+C

# 停止容器（数据不会丢失）
docker compose -p star-catcher -f deploy/docker-compose.dev.yml down

# 如果想彻底清除数据（重建数据库）
docker compose -p star-catcher -f deploy/docker-compose.dev.yml down -v
```

---

## 运行测试

```bash
# 运行全部测试
npm test

# 运行单个测试文件
npx vitest run src/path/to/file.test.ts

# 监听模式（修改文件自动重跑）
npx vitest
```

---

## 用 Docker 完整运行（模拟生产）

如果想在开发机上用 Docker 完整跑所有 5 个容器（模拟生产环境）：

```bash
# 构建镜像
docker build -t star-catcher:dev .

# 启动全部（包括 app 和 worker 容器）
docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d

# 访问 http://localhost:3000
```

---

## 常见问题

### `npm run dev` 端口 3000 被占用

```bash
# 查看谁在用 3000 端口
netstat -ano | findstr :3000

# 杀掉进程或换端口
# 在 .env 添加 PORT=3001，然后访问 localhost:3001
```

### Docker 容器启动失败

```bash
# 查看具体报错
docker compose -p star-catcher -f deploy/docker-compose.dev.yml logs

# 常见原因：
# - Docker Desktop 没启动     → 启动 Docker Desktop
# - 端口被占用 (5432/6379)    → 停止本机的 PostgreSQL / Redis
# - .env 没创建              → cp deploy/.env.dev.example .env
```

### Prisma migrate 报错

```bash
# 数据库容器没启动
docker compose -p star-catcher -f deploy/docker-compose.dev.yml up -d star-catcher-db

# 等几秒让数据库就绪，再重试
npx prisma migrate dev
```

### 图片上传失败

```bash
# 检查 MinIO 容器是否运行
docker ps | grep minio

# 检查 .env 中的 MinIO 配置
# MINIO_ENDPOINT=localhost
# MINIO_PUBLIC_ENDPOINT=localhost
# MINIO_PORT=9000
```

### 重置开发数据库

```bash
# 方式 1：只重置数据，保留表结构
npx prisma migrate reset

# 方式 2：彻底删除，从头来过
docker compose -p star-catcher -f deploy/docker-compose.dev.yml down -v
docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d star-catcher-db star-catcher-redis star-catcher-minio
npx prisma migrate dev
npx prisma db seed
```

---

## 目录结构速查

```
star_catcher/
├── .env                          # 你的本地环境变量（不提交 Git）
├── Dockerfile                    # Docker 镜像构建
├── deploy/
│   ├── DEPLOY-DEV.md             # ← 你正在看的这个文件
│   ├── DEPLOY-PROD.md            # 生产部署指南
│   ├── docker-compose.dev.yml    # 开发环境容器配置
│   ├── docker-compose.prod.yml   # 生产环境容器配置
│   ├── .env.dev.example          # 开发环境变量模板
│   ├── .env.prod.example         # 生产环境变量模板
│   └── scripts/
│       ├── docker-entrypoint.sh  # 容器入口脚本
│       ├── deploy.sh             # 一键部署到 NAS
│       └── backup-db.sh          # 数据库备份
├── prisma/
│   ├── schema.prisma             # 数据模型定义
│   ├── seed.ts                   # 初始数据（admin 用户 + Skill）
│   └── migrations/               # 数据库迁移记录
├── src/                          # 应用源码
└── skills/                       # Skill 插件
```

---

## 常用命令速查

| 操作 | 命令 |
|------|------|
| 启动基础设施 | `docker compose -p star-catcher -f deploy/docker-compose.dev.yml --env-file .env up -d star-catcher-db star-catcher-redis star-catcher-minio` |
| 启动开发服务器 | `npm run dev` |
| 停止容器 | `docker compose -p star-catcher -f deploy/docker-compose.dev.yml down` |
| 数据库迁移 | `npx prisma migrate dev --name 描述` |
| 数据库种子 | `npx prisma db seed` |
| Prisma Studio | `npx prisma studio` |
| 运行测试 | `npm test` |
| 构建镜像 | `docker build -t star-catcher:dev .` |
| 查看容器状态 | `docker compose -p star-catcher -f deploy/docker-compose.dev.yml ps` |
