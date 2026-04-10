# Sprint 2: 作业录入 + AI Harness + AI 识别 + 多轮检查 (Week 3-4)

## 目标

实现核心检查流程：拍照上传 → AI 识别 → 判分 → 改正 → 重检 → 求助。构建 AI Harness 管道。

## 用户故事范围

- [US-008 ~ US-012](../user-stories/homework-input.md) 作业录入（拍照、多张、手动、PDF、截图）
- [US-013 ~ US-015](../user-stories/ai-recognition.md) AI 识别与判分
- [US-016 ~ US-019](../user-stories/homework-check.md) 多轮检查与求助

## 任务清单

### Week 3

- [x] 13. 文件上传：MinIO 集成 + 预签名 URL + 客户端图片压缩
- [x] 14. 拍照组件：摄像头调用 + 相册选择 + 多张管理
- [x] 15. AI Provider 抽象层 + Azure OpenAI 实现（含 usage 信息提取）
- [x] 16. AI Harness 基础设施：
  - [x] PromptManager + OCR Prompt 模板
  - [x] OutputValidator + OCR Zod Schema
  - [x] CallLogger（AICallLog 写入）
  - [x] PromptInjectionGuard（输入净化）
  - [x] RateLimiter（Redis 滑动窗口）
- [x] 17. OCR Operation：`recognizeHomework` 编排（经 Harness 管道）
- [x] 18. 识别结果确认/修正页面

### Week 4

- [x] 19. 多轮检查流程：状态机实现
- [x] 20. 第一轮检查结果展示（对/错 + 得分）
- [x] 21. 改正提交 + 重新检查
- [x] 22. AI Harness 补充：
  - [x] ContentGuardrail（K-12 内容安全）
  - [x] FallbackHandler（降级策略）
  - [x] help-generate / subject-detect Prompt 模板 + Zod Schema
- [x] 23. 求助功能（渐进式揭示，经 Harness 管道）
- [x] 24. 手动录入页面 + 学科自动识别（经 Harness 管道）
- [x] 25. 错题自动录入错题库（含 contentHash 去重）

## 验收标准

- [ ] 手机拍照上传作业图片
- [ ] 多张照片拼接为一份作业
- [ ] 从相册选择图片上传
- [ ] 上传 PDF 识别
- [ ] AI 正确识别试卷内容（文字+手写+公式）
- [ ] AI 自动识别学科和内容类型
- [ ] 用户可修正 AI 识别结果（内联编辑）
- [ ] 第一轮检查显示对/错和得分，不显示答案
- [ ] 学生改正后可重新提交检查
- [ ] 多轮检查得分变化可见
- [ ] 学生可对不会的题求助（渐进式揭示 3 级）
- [ ] 家长可设置求助 Level 上限
- [ ] 检查完成后错题自动录入错题库
- [ ] 手动录入单题错题
- [ ] AI Harness 管道完整运行（见 Harness 验收）

## AI Harness 验收

- [ ] AI 返回的 JSON 经过 Zod schema 校验
- [ ] 畸形 JSON 自动修复或触发重试
- [ ] Prompt 模板集中管理（`src/lib/ai/prompts/`）
- [ ] 学生输入经 PromptInjectionGuard 净化
- [ ] 高风险注入被拦截
- [ ] AI 求助内容经 ContentGuardrail 过滤
- [ ] AI 重试失败后返回降级结果
- [ ] 所有 AI 调用记录到 AICallLog
- [ ] Rate Limit 通过 Redis 滑动窗口实现
- [ ] 业务代码通过 Operations 层调用 AI

## 完成定义

```bash
npm run test:acceptance -- --grep "sprint-2"
npm run test:architecture                       # Harness 完整性检查
npm run lint
```
