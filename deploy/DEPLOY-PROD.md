# Star Catcher — 生产环境部署指南（UGreen NAS）

## 部署方案选择

本文档提供两种部署方案，选一种即可：

- **方案 A：NAS UI 部署**（推荐，无需 SSH）— 见 [方案 A](#方案-a-nas-ui-部署推荐) 节。完全通过绿联 NAS 的 Docker 图形界面完成。
- **方案 B：CLI + SSH 部署** — 见 [方案 B](#方案-b-cli--ssh-部署) 节。需要 NAS 开 SSH，使用 `deploy.sh` 一键脚本。

## 架构概览

```
开发机 (Windows)                     NAS (UGreen, Tailscale)
┌──────────────┐    docker save     ┌─────────────────────────────────┐
│  docker build │ ──── scp ──────> │  docker load                    │
│  star-catcher │                   │                                 │
└──────────────┘                   │  ┌─── star-catcher-app (:3000)  │
                                    │  ├─── star-catcher-worker       │
     浏览器                         │  ├─── star-catcher-db  (内部)   │
  ┌──────────┐    Tailscale VPN     │  ├─── star-catcher-redis (内部) │
  │ 手机/电脑 │ ◄───────────────── │  └─── star-catcher-minio (:9000)│
  └──────────┘                     └─────────────────────────────────┘
```

5 个容器：Next.js 应用 + BullMQ Worker + PostgreSQL + Redis + MinIO。
PostgreSQL 和 Redis 不暴露端口，只在 Docker 内部网络通信。

---

## 前置准备

### 你需要准备的东西

| 项目 | 说明 | 怎么获取 |
|------|------|---------|
| NAS SSH 访问 | 能 `ssh user@nas` 登录 | NAS 管理界面开启 SSH |
| NAS 上的 Docker | `docker --version` 和 `docker compose version` | NAS 应用商店安装 |
| NAS 上的 Tailscale | 内网穿透，让手机/电脑能访问 NAS | NAS 应用商店安装 |
| NAS Tailscale 地址 | 形如 `100.x.x.x` 或 `nas.xxx.ts.net` | NAS 上运行 `tailscale status` |
| 开发机 Docker Desktop | 用于构建镜像 | 已安装 |
| Azure OpenAI 凭证 | API Key + Endpoint + Deployment 名称 | Azure Portal |

### NAS 与现有 PostgreSQL 冲突？

**不冲突。** 生产 compose 中 PostgreSQL 不暴露 5432 端口到宿主机，只在 Docker 内部网络使用。你 NAS 上已有的 PostgreSQL 完全不受影响。

---

## 方案 A：NAS UI 部署（推荐）

适用于绿联 NAS 提供的 Docker 图形界面，**无需 SSH**，全部通过 UI 完成。

### A1. 准备阶段（开发机）

在项目根目录执行：

```bash
TAG=$(git rev-parse --short HEAD)
docker build -t star-catcher:$TAG .
mkdir -p release
```

然后根据场景选一个打包命令：

**首次部署**（bundle 含 4 个镜像，约 400 MB，NAS 完全离线）：
```bash
# 先确保基础镜像在本地（第一次需要，之后已缓存）
docker pull pgvector/pgvector:pg16 redis:7-alpine minio/minio:latest

# 一次性打包所有镜像
docker save star-catcher:$TAG pgvector/pgvector:pg16 redis:7-alpine minio/minio:latest \
  | gzip > release/star-catcher-bundle-$TAG.tar.gz
```

**日常更新**（只打包 app 镜像，约 190 MB，基础镜像 NAS 已有）：
```bash
docker save star-catcher:$TAG | gzip > release/star-catcher-$TAG.tar.gz
```

`release/` 目录已被 `.gitignore` 忽略，tar.gz 不会误提交。

### A2. 生成密钥（开发机，一次性）

```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)"
echo "MINIO_ACCESS_KEY=$(openssl rand -hex 16)"
echo "MINIO_SECRET_KEY=$(openssl rand -base64 32)"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
```

输出的值稍后粘到 NAS UI 环境变量。不要写入文件。

### A3. NAS 侧准备

1. **创建项目目录**：在 NAS 文件管理器里创建 `star-catcher/` 文件夹（位置任意，建议 `/docker/star-catcher/`）
2. **把 tar.gz 传到 NAS**：用 NAS 文件管理器上传 / SMB 共享，把 `release/star-catcher-<TAG>.tar.gz` 放到 `star-catcher/` 下

> **数据目录不用手动建**：compose 的 bind mount 默认是 `./data`（相对于 compose 文件所在目录），Docker 首次启动时会自动创建 `data/pgdata`、`data/redisdata`、`data/miniodata` 三个子目录。pgvector/redis/minio 官方镜像的 entrypoint 会自己处理目录所有权。
>
> **关于 NAS 提示的 PUID=1000 / PGID=10**：这是 linuxserver.io 社区镜像的约定，对我们用的官方 `pgvector`/`redis`/`minio` 镜像**不起作用**（它们有各自的 entrypoint 处理权限）。不用配置 PUID/PGID。

### A4. NAS UI 操作

**Step 1 — 导入镜像**：  
NAS Docker 应用 → 镜像管理 → 导入 → 选刚传的 tar.gz。导入完成后镜像列表出现 `star-catcher:<TAG>`。

**Step 2 — 新建 Compose 项目**：  
NAS Docker 应用 → 项目（或 "Compose" / "Stack" 菜单）→ 新建：
- 项目名：`star-catcher`
- 项目目录：选 `star-catcher/` 文件夹（跟 tar.gz 同目录，支持相对路径）
- compose 内容：粘 [deploy/docker-compose.prod.yml](./docker-compose.prod.yml) 整段内容

**Step 3 — 配置环境变量**（在 UI 环境变量编辑面板里粘入）：

```
# 必改：NAS 地址（先用内网 IP，后续可切 Tailscale）
NAS_TAILSCALE_HOSTNAME=<NAS 的 IP 或 Tailscale 地址>

# 必改：镜像 tag（跟导入的镜像对齐）
IMAGE_TAG=<git hash,例如 afbdefe>

# 数据目录（默认 ./data，Docker 自动创建相对于 compose 所在目录）
DATA_PATH_PREFIX=./data

# 必改：端口（如果默认 3000/9000 被占用，换成其他）
APP_PORT=3000
MINIO_PORT=9000

# 必改：密钥（A2 步骤生成的）
DB_PASSWORD=<generated>
MINIO_ACCESS_KEY=<generated>
MINIO_SECRET_KEY=<generated>
NEXTAUTH_SECRET=<generated>

# 必改：管理员密码（首次登录用）
ADMIN_DEFAULT_PASSWORD=<自己设一个>

# 必改：Azure OpenAI 凭证
AZURE_OPENAI_API_KEY=<Azure Portal>
AZURE_OPENAI_ENDPOINT=<形如 https://xxx.openai.azure.com/>
AZURE_OPENAI_DEPLOYMENT=<你的部署名>
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# 首次启动必加（seed 完后删掉）
RUN_SEED=1

# ── 以下可留默认值 ──────────────────────────────────────
MINIO_BUCKET=star-catcher
NEXT_PUBLIC_APP_NAME=Star Catcher
NEXT_PUBLIC_DEFAULT_LOCALE=zh
EMBEDDING_PROVIDER=azure
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DEPLOYMENT=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
SEMANTIC_CACHE_ENABLED=false
SEMANTIC_CACHE_TTL_HOURS=168
SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.95
OTEL_ENABLED=false
LOG_LEVEL=info
APP_MEM=1G
WORKER_MEM=1G
DB_MEM=1G
REDIS_MEM=512M
MINIO_MEM=512M
REDIS_MAXMEMORY=256mb
WORKER_CONCURRENCY=3
```

**Step 4 — 启动并等 seed 完成**：  
UI 点"部署" / "启动"。查看 `star-catcher-app` 容器日志，等出现：
```
Running database migrations...
Migrations complete.
Running database seed...
Seed complete.
```
首次启动约 60-90 秒。

**Step 5 — 删除 RUN_SEED 并重启**：  
UI 编辑项目环境变量 → **删除 `RUN_SEED=1`**（或改成 `0`）→ 只重启 `star-catcher-app` 容器。  
不删会导致下次重启时重复 seed，可能引起容器 restart loop。

**Step 6 — 验证**：  
- NAS UI 看到 5 个容器全部 Running + healthy
- 浏览器访问 `http://<NAS_IP>:<APP_PORT>` → 登录页正常
- 用 `admin` + `ADMIN_DEFAULT_PASSWORD` 登录
- 建学生 → 建作业 → 手机拍作业上传 → AI 识别成功

### A5. 后续更新部署（UI 方案）

更新**只重新打包 app 镜像**（190 MB），基础镜像 NAS 已缓存：

```bash
TAG=$(git rev-parse --short HEAD)
docker build -t star-catcher:$TAG .
docker save star-catcher:$TAG | gzip > release/star-catcher-$TAG.tar.gz
```

NAS 侧：
1. 传新 tar.gz 到 NAS
2. NAS UI 导入新镜像（只会新增一个 tag，旧 tag 保留用于回滚）
3. UI 编辑项目 `.env` 里的 `IMAGE_TAG=<新hash>`
4. 重启 `star-catcher-app` 和 `star-catcher-worker`（其他 3 个不用动，数据持久化）

回滚：把 `IMAGE_TAG` 改回旧 hash → 重启 app + worker（前提旧镜像还在 NAS 上）。

### A6. 切换 NAS 地址（192.168.x → Tailscale）

初期内网 IP 测试通过后，想切到 Tailscale 域名：

1. NAS UI 编辑项目环境变量
2. 改 `NAS_TAILSCALE_HOSTNAME=<新地址>`
3. 只重启 `star-catcher-app`

**无需**改数据、重 seed。presigned URL 每次请求动态生成，旧 IP 的 URL 不会残留在 DB 里。

---

## 方案 B：CLI + SSH 部署

## 首次部署

### 第 1 步：NAS 上创建目录

```bash
ssh user@你的NAS地址

# 创建顶层目录（data 子目录由 Docker 启动时自动创建）
mkdir -p /volume1/docker/star-catcher/{images,backups}
```

创建后的结构：
```
/volume1/docker/star-catcher/
├── data/                    # 首次启动时 Docker 自动建
│   ├── pgdata/              # PostgreSQL 数据
│   ├── redisdata/           # Redis 数据
│   └── miniodata/           # MinIO 文件存储
├── images/                  # Docker 镜像 tar.gz
├── backups/                 # 数据库备份
├── docker-compose.prod.yml  # 第 3 步放入
└── .env                     # 第 3 步放入
```

默认 `DATA_PATH_PREFIX=./data` 相对于 compose 文件所在目录。非 Synology NAS 如果挂载点不一样，在 `.env` 里改成绝对路径即可。

### 第 2 步：开发机上构建镜像并传输

```bash
# 在项目根目录执行
cd /path/to/star_catcher

# 构建 Docker 镜像
docker build -t star-catcher:initial .

# 导出并压缩（大约 200-400 MB）
docker save star-catcher:initial | gzip > star-catcher-initial.tar.gz

# 通过 Tailscale 传到 NAS
scp star-catcher-initial.tar.gz user@你的NAS地址:/volume1/docker/star-catcher/images/
```

> 构建大概 1-3 分钟，传输时间取决于网络。同一局域网走 Tailscale 直连，速度很快。

### 第 3 步：NAS 上配置

```bash
ssh user@你的NAS地址

# 加载 Docker 镜像
docker load < /volume1/docker/star-catcher/images/star-catcher-initial.tar.gz
```

**复制配置文件到 NAS：**

把项目中以下两个文件传到 NAS 的 `/volume1/docker/star-catcher/`：
- `deploy/docker-compose.prod.yml`
- `deploy/.env.prod.example` → 重命名为 `.env`

```bash
# 在开发机执行（或用 NAS 文件管理器手动复制）
scp deploy/docker-compose.prod.yml user@你的NAS地址:/volume1/docker/star-catcher/
scp deploy/.env.prod.example user@你的NAS地址:/volume1/docker/star-catcher/.env
```

**编辑 .env，填写实际值：**

```bash
ssh user@你的NAS地址
cd /volume1/docker/star-catcher

# 编辑配置（把所有 CHANGE_ME 替换为实际值）
vi .env    # 或用 nano .env
```

需要修改的变量：

| 变量 | 怎么填 |
|------|--------|
| `NAS_TAILSCALE_HOSTNAME` | NAS 的 Tailscale 地址（`tailscale status` 查看） |
| `DB_PASSWORD` | 运行 `openssl rand -base64 24` 生成 |
| `MINIO_ACCESS_KEY` | 运行 `openssl rand -hex 16` 生成 |
| `MINIO_SECRET_KEY` | 运行 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_SECRET` | 运行 `openssl rand -base64 32` 生成 |
| `ADMIN_DEFAULT_PASSWORD` | 管理员登录密码，自己设一个 |
| `AZURE_OPENAI_API_KEY` | Azure Portal 获取 |
| `AZURE_OPENAI_ENDPOINT` | 形如 `https://xxx.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | 你的模型部署名称 |

```bash
# 保护密码文件
chmod 600 .env
```

### 第 4 步：首次启动（带数据库初始化）

```bash
cd /volume1/docker/star-catcher

# 首次启动，需要 RUN_SEED=1 创建管理员账号和内置 Skill
RUN_SEED=1 docker compose -p star-catcher -f docker-compose.prod.yml up -d
```

> `RUN_SEED=1` 只在首次部署时用。它会创建 admin 用户和注册内置 Skill。
> `RUN_MIGRATE=1` 已在 compose 文件中配置，每次启动自动执行数据库迁移。

### 第 5 步：验证

```bash
# 检查所有容器状态（等 30-60 秒让健康检查通过）
docker compose -p star-catcher -f docker-compose.prod.yml ps

# 期望输出：所有容器 STATUS 为 "Up ... (healthy)"
```

```bash
# 检查应用日志（看有没有报错）
docker compose -p star-catcher -f docker-compose.prod.yml logs star-catcher-app --tail 30

# 检查 MinIO 是否可达（在手机/电脑上执行，不是 NAS）
curl http://你的NAS_Tailscale地址:9000/minio/health/live
```

**打开浏览器：** 访问 `http://你的NAS_Tailscale地址:3000`

- 用 `admin` + 你设置的 `ADMIN_DEFAULT_PASSWORD` 登录
- 尝试完整流程：创建作业 → 拍照上传 → AI 识别

### 第 6 步：设置自动备份（可选但推荐）

```bash
# 把备份脚本复制到 NAS
scp deploy/scripts/backup-db.sh user@你的NAS地址:/volume1/docker/star-catcher/

# 在 NAS 上设置 cron 定时任务（每天凌晨 3 点备份）
ssh user@你的NAS地址
chmod +x /volume1/docker/star-catcher/backup-db.sh
crontab -e
# 添加这一行：
# 0 3 * * * /volume1/docker/star-catcher/backup-db.sh >> /volume1/docker/star-catcher/backups/cron.log 2>&1
```

---

## 后续更新部署

代码改完后，重新部署只需要更新 app 和 worker 容器，基础设施（DB/Redis/MinIO）不需要重启。

### 方式一：一键脚本（推荐）

```bash
# 在开发机项目根目录执行
NAS_HOST=你的NAS地址 NAS_USER=你的用户名 bash deploy/scripts/deploy.sh
```

脚本自动完成：构建 → 压缩 → 传输 → 备份数据库 → 更新镜像 → 重启。

### 方式二：手动操作

```bash
# === 开发机上 ===
cd /path/to/star_catcher

# 1. 构建新镜像（tag 用 git commit hash）
TAG=$(git rev-parse --short HEAD)
docker build -t star-catcher:$TAG .

# 2. 导出并传输
docker save star-catcher:$TAG | gzip > /tmp/star-catcher-$TAG.tar.gz
scp /tmp/star-catcher-$TAG.tar.gz user@你的NAS地址:/volume1/docker/star-catcher/images/
```

```bash
# === NAS 上 ===
ssh user@你的NAS地址
cd /volume1/docker/star-catcher

# 3. 先备份数据库
docker exec star-catcher-db pg_dump -U star_catcher -d star_catcher --format=custom \
  > backups/pre-deploy-$(date +%Y%m%d_%H%M%S).dump

# 4. 加载新镜像
docker load < images/star-catcher-<新的TAG>.tar.gz

# 5. 更新 .env 中的 IMAGE_TAG
vi .env
# 把 IMAGE_TAG=xxx 改为新的 TAG

# 6. 仅重启 app 和 worker（数据库不动）
docker compose -p star-catcher -f docker-compose.prod.yml up -d star-catcher-app star-catcher-worker

# 7. 验证
docker compose -p star-catcher -f docker-compose.prod.yml ps
docker compose -p star-catcher -f docker-compose.prod.yml logs star-catcher-app --tail 20
```

> 停机时间大约 10-30 秒（容器重启期间）。

---

## 回滚

如果新版本有问题，可以快速切回旧版本。

```bash
ssh user@你的NAS地址
cd /volume1/docker/star-catcher

# 1. 查看可用的旧镜像
docker images star-catcher

# 2. 改回旧 TAG
vi .env
# IMAGE_TAG=旧的TAG

# 3. 重启
docker compose -p star-catcher -f docker-compose.prod.yml up -d star-catcher-app star-catcher-worker
```

如果数据库迁移也需要回滚（极少见）：
```bash
# 恢复部署前的备份
docker exec -i star-catcher-db pg_restore -U star_catcher -d star_catcher --clean --if-exists \
  < backups/pre-deploy-YYYYMMDD_HHMMSS.dump
```

---

## 日常维护

### 查看日志

```bash
# 应用日志
docker compose -p star-catcher -f docker-compose.prod.yml logs star-catcher-app --tail 50

# Worker 日志（AI 任务处理）
docker compose -p star-catcher -f docker-compose.prod.yml logs star-catcher-worker --tail 50

# 实时跟踪日志
docker compose -p star-catcher -f docker-compose.prod.yml logs -f star-catcher-app
```

### 查看容器状态

```bash
# 健康状态
docker compose -p star-catcher -f docker-compose.prod.yml ps

# 资源占用
docker stats --no-stream
```

### 手动备份

```bash
bash /volume1/docker/star-catcher/backup-db.sh
```

### 清理旧镜像

```bash
# 查看所有 star-catcher 镜像
docker images star-catcher

# 删除指定旧版本（保留当前版本和上一个版本用于回滚）
docker rmi star-catcher:旧TAG

# 清理无用镜像
docker image prune
```

### 重启所有服务

```bash
cd /volume1/docker/star-catcher
docker compose -p star-catcher -f docker-compose.prod.yml restart
```

### 完全停止

```bash
docker compose -p star-catcher -f docker-compose.prod.yml down
# 注意：down 不会删除数据，数据在 data/ 目录中
```

---

## 故障排查

### 容器启动失败

```bash
# 看具体报错
docker compose -p star-catcher -f docker-compose.prod.yml logs <服务名> --tail 50

# 常见原因：
# - .env 中有 CHANGE_ME 没改  → 检查 .env
# - 端口冲突                  → docker ps 查看是否有其他容器占用
# - 磁盘空间不足              → df -h /volume1
```

### 图片上传/显示失败（MinIO 问题）

```bash
# 检查 MinIO 健康
curl http://你的NAS_Tailscale地址:9000/minio/health/live

# 常见原因：
# - MINIO_PUBLIC_ENDPOINT 没设对  → 必须是 NAS 的 Tailscale 地址（不含 http://，不含端口）
# - 浏览器无法访问 9000 端口      → 确认 Tailscale 已连接
# - MinIO 密钥错误               → 检查 .env 中的 MINIO_ACCESS_KEY / MINIO_SECRET_KEY
```

### AI 功能不工作

```bash
# 检查 Worker 日志
docker compose -p star-catcher -f docker-compose.prod.yml logs star-catcher-worker --tail 30

# 常见原因：
# - Azure OpenAI 凭证错误    → 检查 .env 中 AZURE_OPENAI_* 三个变量
# - API 配额用完             → Azure Portal 检查用量
# - Worker 没启动            → docker ps 确认 star-catcher-worker 在运行
```

### 数据库连接失败

```bash
# 检查 DB 容器状态
docker compose -p star-catcher -f docker-compose.prod.yml ps star-catcher-db

# 进入 DB 容器检查
docker exec -it star-catcher-db psql -U star_catcher -d star_catcher -c "SELECT 1"
```

### NAS 内存不够

```bash
# 查看各容器内存占用
docker stats --no-stream

# 资源限制（默认值，可在 .env 调整）：
# - App:    $APP_MEM     (默认 1G)
# - Worker: $WORKER_MEM  (默认 1G)
# - DB:     $DB_MEM      (默认 1G，pgvector 索引大时放到 2G)
# - Redis:  $REDIS_MEM   (默认 512M；内部阈值 $REDIS_MAXMEMORY 默认 256mb)
# - MinIO:  $MINIO_MEM   (默认 512M)
# - 合计约 4GB，NAS 建议 8GB 以上内存
```

> **调优建议**：Brain + embedding 批处理在学生数增长后易 OOM。
> 如果 Worker 容器频繁 restart，先在 `.env` 里把 `WORKER_MEM` 提到 2G；
> DB 如果 pgvector 索引命中率低，把 `DB_MEM` 提到 2G 并同步调整
> `REDIS_MAXMEMORY`（应为 `REDIS_MEM` 的 50-75%）。

---

## Dev vs Prod compose 差异速查

| 项 | dev (`docker-compose.dev.yml`) | prod (`docker-compose.prod.yml`) |
|---|---|---|
| 构建来源 | `build: ..`（每次 up 都会重新 build） | `image: star-catcher:${IMAGE_TAG}` |
| DB/Redis/MinIO 数据卷 | named volume（`star-catcher-*`） | 宿主机 bind mount（`${DATA_PATH_PREFIX:-./data}/*`，Docker 首次启动自动创建） |
| DB 5432 端口 | 暴露到宿主 | 不暴露（仅内部网络） |
| Redis 6379 端口 | 暴露到宿主 | 不暴露 |
| MinIO Console 9001 | 暴露到 `0.0.0.0` | 仅 `127.0.0.1`（需 SSH 隧道） |
| Jaeger | 含 `star-catcher-jaeger`（16686/4318） | 无（如需 OTEL 自行对接外部 Collector） |
| RUN_MIGRATE | 不自动（手动 `npx prisma migrate`） | `RUN_MIGRATE=1` 默认开启 |
| Worker healthcheck | 有（Node 心跳自检） | 有（Node 心跳自检） |
| 资源 memory limit | 无 | 通过 `APP_MEM` / `WORKER_MEM` / `DB_MEM` / `REDIS_MEM` 控制 |

### Worker 心跳探针（K1）

Worker 每 15 秒往 `/tmp/worker-alive` 写时间戳。Docker healthcheck 每 15 秒用
`node` 读一次 mtime，超过 60 秒未更新即判定 unhealthy 并触发重启。
这样既避免 `pgrep` 方案无法检测 Node 事件循环冻死的问题，又避免 long-running job 阻塞心跳（心跳在独立 `setInterval` 里跑，不与 job 处理耦合）。

## 安全注意事项

1. **`.env` 文件** 包含所有密码，确保 `chmod 600 .env`，不要提交到 Git
2. **PostgreSQL / Redis** 不暴露端口到宿主机，外部无法直接访问
3. **MinIO Console** 绑定在 `127.0.0.1:9001`，只能通过 SSH 隧道访问：
   ```bash
   ssh -L 9001:localhost:9001 user@你的NAS地址
   # 然后浏览器访问 http://localhost:9001
   ```
4. **Tailscale** 已提供 WireGuard 端到端加密，不需要额外配 HTTPS
5. **定期更新** Docker 基础镜像（postgres:16-alpine、redis:7-alpine、minio/minio）
