# Sprint 1: 基础架构 + 用户系统 + 家庭组 (Week 1-2)

## 目标

搭建可运行的基础应用框架，实现注册/登录/家庭组管理全流程。

## 用户故事范围

- [US-001 ~ US-003](../user-stories/auth.md) 用户认证（注册、登录、个人信息修改）
- [US-004 ~ US-007](../user-stories/family.md) 家庭组（创建、邀请、成员管理、学生切换）

## 任务清单

### Week 1

- [ ] 1. 项目初始化：Next.js + TypeScript + Tailwind + shadcn/ui
- [ ] 2. Docker Compose 环境搭建（`docker compose -p star-catcher up -d`）
- [ ] 3. Prisma Schema 定义 + 数据库迁移（`prisma/schema.prisma` 已存在）
- [ ] 4. tRPC 基础配置
- [ ] 5. NextAuth.js 集成（用户名密码认证）
- [ ] 6. next-intl 国际化配置 + 初始翻译文件
- [ ] 7. 注册/登录页面 + API

### Week 2

- [ ] 8. 用户个人信息页
- [ ] 9. 家庭组 CRUD（创建、邀请、加入、管理成员）
- [ ] 10. 家长-学生关系视图（切换查看不同学生）
- [ ] 11. 基础布局（学生端/家长端/管理员端导航）
- [ ] 12. RBAC 中间件（路由守卫）

## 验收标准

- [ ] 新用户可注册（学生/家长角色）
- [ ] 用户名唯一校验，4-32 字符
- [ ] 密码最少 8 位，含字母和数字
- [ ] 学生注册需填写年级
- [ ] 用户可登录/登出
- [ ] 连续 5 次失败锁定 15 分钟
- [ ] JWT Token 7 天有效 + 30 天 Remember Me
- [ ] 家长可创建家庭组
- [ ] 通过 6 位邀请码加入家庭组（24 小时有效）
- [ ] 家长可管理成员（查看/移除）
- [ ] 家长可切换查看不同孩子
- [ ] 中/英文切换正常
- [ ] Docker Compose 一键启动

## 完成定义

```bash
npm run test:acceptance -- --grep "sprint-1"   # 验收测试通过
npm run lint                                    # 无错误
docker compose -p star-catcher up -d            # 一键启动成功
npx prisma migrate deploy                       # 迁移成功
```
