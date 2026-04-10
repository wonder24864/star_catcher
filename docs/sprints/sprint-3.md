# Sprint 3: 家长视图 + 错题管理 + PWA + 部署 (Week 5-6)

## 目标

完成家长端功能、错题管理、PWA 支持，实现完整可部署的 MVP。

## 用户故事范围

- [US-020 ~ US-022](../user-stories/error-management.md) 错题管理
- [US-023 ~ US-026](../user-stories/parent-view.md) 家长视图
- [US-027 ~ US-028](../user-stories/admin.md) 管理员
- [US-029 ~ US-030](../user-stories/pwa-i18n.md) PWA + i18n

## 任务清单

### Week 5

- [x] 26. 家长今日概览页面
- [x] 27. 作业检查详情时间线
- [x] 28. 家长基础统计（趋势图、分布图）
- [x] 29. 家长设置（答案揭示策略）
- [x] 30. 错题列表页（筛选、搜索、分页）
- [x] 31. 错题详情页 + 家长备注

### Week 6

- [x] 32. 管理员后台（用户管理、系统配置）
- [x] 33. PWA 配置（manifest、Service Worker、离线支持）
- [ ] 34. 儿童友好 UI 适配（大字体大按钮主题）
- [ ] 35. 响应式适配（PC + 手机）
- [ ] 36. Docker 镜像构建 + 部署测试
- [ ] 37. 端到端测试 + Bug 修复

## 验收标准

- [ ] 家长首页显示今日作业检查概览
- [ ] 家长可查看历史日期的检查记录
- [ ] 家长本周打卡日历
- [ ] 家长基础统计图表（趋势+分布）
- [ ] 家长可切换查看不同孩子
- [ ] 家长可添加/编辑/删除备注
- [ ] 错题列表按学科/日期筛选
- [ ] 错题详情页包含完整信息
- [ ] 管理员可管理用户
- [ ] 管理员可查看系统统计
- [ ] 中/英文切换所有页面正常
- [ ] PWA 可安装到手机主屏
- [ ] Docker Compose 一键部署成功
- [ ] 小学生界面大字体大按钮
- [ ] 手机端触摸操作流畅

## 非功能验收

- [ ] 单张图片 AI 识别 ≤ 30 秒
- [ ] 页面首次加载 ≤ 3 秒
- [ ] HTTPS 传输 + 密码 bcrypt 哈希
- [ ] 所有容器使用 `star-catcher-*` 前缀

## 完成定义

```bash
npm run test:acceptance                         # 全部验收测试通过
npm run test:architecture                       # 架构守护测试通过
npm run lint
docker compose -p star-catcher up -d            # 部署成功
# 手动验证 PWA 安装和离线访问
```
