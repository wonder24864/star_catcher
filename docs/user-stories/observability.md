# ObservabilityTracer 用户故事

## US-045: AI Harness 可观测性追踪

**As a** 系统运维者
**I want to** 通过 OpenTelemetry 自动追踪 Harness 管道每个组件的执行耗时、状态和错误
**So that** 能在 Jaeger UI 中可视化 AI 调用链路，快速定位性能瓶颈和故障

**验收标准：**
- [ ] 集成 @opentelemetry/sdk-node，支持 OTLP/HTTP 导出到 Jaeger
- [ ] Harness Pipeline 执行器自动为每个组件创建 span（withSpan 包装）
- [ ] span 包含属性：operation type、component name、cache hit、token usage、duration
- [ ] Next.js instrumentation hook 初始化 OTel（App 进程）
- [ ] Worker 入口初始化 OTel（Worker 进程）
- [ ] Docker Compose 新增 star-catcher-jaeger 服务（all-in-one 镜像）
- [ ] OTEL_ENABLED=false 时 withSpan 直接执行回调，零开销（无 SDK 初始化）
- [ ] 错误 span 自动标记 status=ERROR + 记录 exception

**边界条件：**
- Jaeger 服务不可用时：OTel SDK 内置重试 + 静默降级，不影响业务
- 高并发下：OTel BatchSpanProcessor 批量导出，不阻塞主线程
- OTEL_ENABLED 未设置时：默认 false（opt-in）

**性能要求：**
- withSpan 包装开销 < 0.1ms（OTEL_ENABLED=true）
- OTEL_ENABLED=false 时零开销（直接调用原函数）
- BatchSpanProcessor 批量间隔 5s，队列上限 2048
