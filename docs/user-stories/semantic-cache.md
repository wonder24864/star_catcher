# SemanticCache 集成用户故事

## US-044: AI 响应语义缓存

**As a** 系统运维者
**I want to** 对 AI Harness 调用结果进行语义级缓存，相似 prompt 命中缓存时直接返回已验证的响应
**So that** 减少重复 AI 调用、降低延迟和成本，同时保持响应质量

**验收标准：**
- [ ] 新增 EmbeddingProvider 抽象层，支持 Azure OpenAI text-embedding-3-small
- [ ] 新增 SemanticCache 双层缓存：prompt_hash 精确匹配 → embedding cosine 语义匹配（≥ 0.95）
- [ ] SemanticCache 作为 Harness 管道组件集成，executeOperation 签名不变
- [ ] 可缓存操作：HELP_GENERATE, EXTRACT_KNOWLEDGE_POINTS, CLASSIFY_QUESTION_KNOWLEDGE, DIAGNOSE_ERROR
- [ ] 不缓存操作：OCR_RECOGNIZE（vision）、SUBJECT_DETECT（低成本）、GRADE_ANSWER（学生相关）
- [ ] Cache hit 时跳过后续 AI 调用组件，直接返回已验证响应
- [ ] promptVersion 作为查询条件，schema 升级时旧缓存自动失效
- [ ] AIHarnessResult 新增 cacheHit / cacheId 字段
- [ ] 环境变量控制：SEMANTIC_CACHE_ENABLED、SEMANTIC_CACHE_TTL_HOURS、SEMANTIC_CACHE_SIMILARITY_THRESHOLD
- [ ] EmbeddingProvider 工厂模式，环境变量配置 provider/model/dimensions，未来可切换本地模型

**边界条件：**
- SEMANTIC_CACHE_ENABLED=false 时：SemanticCache 组件直接 pass-through
- embedding 服务不可用时：降级为仅 prompt_hash 精确匹配
- 缓存过期（TTL）：自动失效，不返回过期响应
- 并发写入同一 promptHash：幂等 upsert，不报错
- pgvector 扩展未安装时：启动日志警告，语义匹配降级禁用

**性能要求：**
- prompt_hash 精确匹配 < 5ms
- embedding 语义匹配 < 50ms（brute-force @ 5000 条）
- Cache hit 端到端延迟 < 100ms（vs 正常 AI 调用 1-5s）
- embedding 生成 < 200ms/次
