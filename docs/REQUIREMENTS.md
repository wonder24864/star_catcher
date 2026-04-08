# Star Catcher - System Requirements Document

> **Last Updated**: 2026-04-08
> **Status**: Approved
> **Author**: Requirement discussions captured from user sessions

---

## 1. Product Vision

An intelligent error notebook system for K-12 students (elementary, middle, and high school), designed as a complete learning loop engine. The system goes beyond error recording to achieve personalized learning cycles from "error occurrence" to "stable mastery."

Family-focused: parents and students are the primary users.

---

## 2. System Architecture Overview

The system architecture centers on student learning state, following an "Input-Understanding-Decision-Action-Feedback-Update" learning loop:

### Architecture Layers

| Layer | Components | Responsibility |
|-------|-----------|---------------|
| **Input Layer** | Homework/exam input, photo capture, answer submission, parent notes | Data ingestion |
| **Understanding Layer** | OCR Skill, Structuring Skill, Question Understanding Agent, Diagnosis Agent | Content recognition and comprehension |
| **Decision Layer** | Weakness Profiling Agent, Intervention Planning Agent, Review Scheduling Skill, Learning Brain | Strategy and planning |
| **Action Layer** | Similar Question Retrieval, Task Packaging, Daily Task Pack, Explanation/Practice Cards | Intervention execution |
| **Feedback Layer** | Answer collection, Mastery Evaluation Agent, State Update Skill | Loop closure |
| **Student Memory** | Error assets, learning issues, mastery state, intervention history, student profile, forgetting risk | Long-term state persistence |

### Core Components

- **Learning Brain** (Phase 3): 全局编排器，通过 function calling 自主选择启动哪个 Agent，管理学习闭环
- **Agents** (Phase 2+): 专注特定任务的 AI 实体（题目理解、诊断、薄弱分析、掌握评估），通过 function calling 调用 Skills
- **Skills**: 原子能力单元（OCR、结构化、映射、评分、排程、检索、打包、状态更新），每个 Skill 经过 Harness 管道
- **Student Memory**: 持久化学生状态（错题、掌握度、干预历史），Agent 读写这些数据做决策

> 完整的三阶段演进路线（Phase 1 → Phase 2 → Phase 3）见 `docs/ARCHITECTURE.md` Section 6。

### AI Harness 层（跨所有 Phase 的架构原则）

所有 AI 调用必须经过 **Harness 管道**，不允许业务代码直接调用 AI Provider。Harness 在 AI 调用前后注入跨切面关注点：

```
业务代码 → Operations 层 → AI Harness 管道 → AI Provider
```

**Harness 管道组件（按 Phase 逐步扩展）**：

| 组件 | Phase 1 | Phase 2+ | 职责 |
|------|---------|----------|------|
| OutputValidator | 必须 | 扩展 schema | Zod 校验 AI JSON 输出 |
| PromptManager | 必须 | 加入 DB 存储 | Prompt 模板管理 + 变量注入 |
| ContentGuardrail | 必须 | 加入 AI 审核 | K-12 内容安全过滤 |
| PromptInjectionGuard | 必须 | 持续更新规则 | 用户输入净化 |
| FallbackHandler | 必须 | 加入多 provider 路由 | AI 不可用时降级 |
| RateLimiter | 必须 | 保持 | 限流 |
| CallLogger | 必须 | 加入 trace ID | AI 调用日志 |
| CircuitBreaker | — | 必须 | 多 provider 时熔断 |
| SemanticCache | — | 必须 | 相似请求缓存 |
| CostTracker | — | 必须 | Token 预算管理 |
| ObservabilityTracer | — | 推荐 | OpenTelemetry 集成 |
| EvalFramework | — | 推荐 | AI 输出质量自动评估 |

**设计原则**：
- 每个 Harness 组件独立，可插拔
- 新 Phase 增加 AI 操作类型时，只需新增 Zod schema + Prompt 模板 + Operation 文件
- Agent 和 Skill 都通过 Operations 层编排，共享同一 Harness 管道
- 后续扩展（如 Phase 2 的 Question Understanding Agent）遵循相同架构模式

---

## 3. Target Users & Roles

| Role | Description | Key Capabilities |
|------|------------|-----------------|
| **Student** | Learning subject | Photo upload, complete tasks, view progressive hints, ask AI follow-up questions |
| **Parent** | Supervisor/helper | View daily homework check records, learning reports, control answer reveal strategy, operate on behalf of young students, add notes |
| **Admin** | System + content management | User management, question bank management, knowledge graph review, textbook resource management, system configuration |

### Family Group Model
- Create "Family Groups" with multiple parents and multiple students
- Parents can view all student data within the group
- Students can only see their own data (not the analysis reports parents see)
- Parents can independently configure answer reveal strategies per student
- A user can belong to multiple family groups
- Invitation mechanism: invite code/link

---

## 4. Platform & Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Platform** | Web-first + PWA | Camera access via PWA, future Android APK via TWA |
| **Tech Stack** | TypeScript / Next.js full-stack | No model fine-tuning needed, unified language |
| **Database** | PostgreSQL + Redis | Relational queries for knowledge graph, JSONB for flexibility, pgvector for future similarity search |
| **AI Model** | Azure OpenAI GPT-5.4 | Multi-modal (vision + text), future switch to local models via abstraction layer |
| **File Storage** | MinIO (S3-compatible) | Self-hosted object storage |
| **ORM** | Prisma | Type-safe database access |
| **Auth** | NextAuth.js (username + password) | Simple, extensible |
| **i18n** | next-intl | Full Chinese-English bilingual |
| **Task Queue** | BullMQ (Redis) | Async AI processing |
| **Deployment** | Docker Compose (self-hosted) | All containers prefixed with `star-catcher-` |
| **Commercial Model** | TBD | Not decided yet |

---

## 5. Subject & Content Coverage

### Subjects (All)
Mathematics, Chinese, English, Physics, Chemistry, Biology, Politics, History, Geography

### Content Types
- Exam papers
- Homework assignments
- Character writing practice (shengzi chaoxi)
- Text dictation/recitation (kewen moxie)
- Oral calculation practice
- English word dictation
- Compositions/Essays
- Regular exercise books

### Grade Levels
- Elementary: Grades 1-6
- Middle School: Grades 1-3
- High School: Grades 1-3

---

## 6. Core Workflow: Homework Check Process

### Multi-round iterative checking (NOT one-time grading):

**Round 1: Check**
1. Student/parent uploads homework photo
2. AI recognizes and judges each question right/wrong
3. System shows right/wrong marks + score, **NO answers, NO hints**
4. Student sees what's wrong, goes back to correct

**Round 2+: Correction**
5. Student corrects errors, re-submits (re-photo or manual input)
6. AI re-checks corrected answers
7. Still only shows right/wrong + updated score
8. Repeat until all correct or student asks for help

**Help Phase: Progressive Reveal**
9. Student clicks "Help" button on a specific question they can't solve
10. Level 1: Thinking direction (knowledge point, approach)
11. Level 2: Key steps (framework without final answer)
12. Level 3: Complete solution with answer
13. Each level requires student attempt before unlocking next
14. Parent controls maximum accessible level per student

### Default Help Level by Grade
- Elementary: Max Level 2 (adjustable to 1 or 3)
- Middle School: Max Level 3
- High School: Max Level 3

---

## 7. Input Methods

| Method | Description |
|--------|------------|
| **Photo (single)** | Camera capture + album selection, AI auto-segment questions |
| **Photo (multi)** | Multiple photos stitched into complete exam paper |
| **Manual Input** | Text entry, system auto-detects subject (no manual selection needed) |
| **PDF Upload** | Full exam paper PDF recognition |
| **Screenshot Paste** | Ctrl+V clipboard paste |

**Subject auto-detection**: System automatically identifies subject and content type from content, user can correct if wrong.

---

## 8. Knowledge Graph System (Phase 2+)

### Construction
- **Primary**: AI auto-extract from textbook PDFs
- **Secondary**: Admin manual review and approval
- **Version control**: Support multiple textbook editions

### Structure
- Hierarchy: School Level -> Grade -> Subject -> Chapter -> Knowledge Point -> Sub-point
- Relations: Prerequisites, parallel, containment
- Attributes: Difficulty, importance, exam frequency

### Textbook Resources
- PDF textbooks (all grade levels available)
- Format: PDF/image files
- Need OCR extraction and structuring

---

## 9. Weakness Analysis Strategy (Phase 2+)

### Three-tier Analysis

| Tier | Scope | Frequency | Purpose |
|------|-------|-----------|---------|
| **Real-time** | Last 30 days | Every new error | Current active weak points, drive daily tasks |
| **Periodic** | Current semester | Weekly | Systematic weakness patterns within semester |
| **Global** | All history | End of semester/grade transition | Fundamental cross-semester issues |

### Grade Transition Policy
- Upon entering new school level (elementary->middle, middle->high), previous level's knowledge points are archived
- If new-level errors trace back to previous-level deficiencies, system flags as "foundational weakness" and suggests remedial review
- Previous-level mastery data preserved but excluded from forgetting curve scheduling
- Within same school level, lower-grade knowledge always participates in analysis

---

## 10. Review Scheduling (Phase 3+)

### Hybrid Approach
- **Base**: SM-2 spaced repetition algorithm (Anki-style)
- **Smart layer**: AI dynamically adjusts review timing and intensity based on student mastery
- **Factors**: Error type, historical mastery speed, recent workload, exam timing

---

## 11. Explanation Cards (Phase 3+)

### Mixed Format
- **Default**: Static cards (text + formulas + diagrams)
- **Interactive**: Step-by-step guidance with Q&A at each step
- **Conversational**: Student can ask follow-up questions, AI responds
- Cards only appear when student triggers "Help" - never proactively shown

---

## 12. Parent Features

### Daily Homework Check Records (Primary View)
- Today's check list: which homework was uploaded, status, scores
- Timeline view: when uploaded, when corrected, when completed
- Per-homework stats: "Math: 15 questions, 3 wrong, 2 corrected"
- Whether student used "Help" and on which questions
- Weekly calendar: check-in status per day

### Learning Reports
- Error quantity trends (daily/weekly/monthly) by subject
- Subject error distribution pie chart
- Average score trends by subject
- Correction success rate distribution
- Help frequency analysis

### Learning Suggestions & Intervention Tracking (Phase 4)
- AI-generated personalized learning suggestions
- Intervention effect tracking: pre/post mastery comparison
- Key attention items requiring parent cooperation

### Parent Control Panel
- Answer reveal strategy per student **(Phase 1)**
- Daily task volume limit **(Phase 3+, 依赖今日任务包功能)**
- Study time period settings **(Phase 3+, 依赖今日任务包功能)**
- Student operation log **(Phase 3+)**

---

## 13. Child-Friendly UI Design

- **Large fonts/buttons**: Minimum 16px font, minimum 44x44px buttons for elementary
- **Colorful**: Bright color system, subjects color-coded
- **Simplified navigation**: Max 2-level depth for lower elementary
- **Instant feedback**: Animations (checkmarks, stars, progress bars)
- **Grade-adaptive interface**:
  - Elementary 1-3: Minimal interface, large icons, parent-led
  - Elementary 4-6: Transitional interface
  - Middle School: Standard interface, student self-operated
  - High School: Full-feature interface

---

## 14. Internationalization

- Full Chinese-English bilingual (next-intl)
- Language files organized by module
- AI-generated content follows current language setting
- English subject content stays in English
- Math formulas rendered with KaTeX (language-independent)

---

## 15. Data Security

### Current Phase (Personal Use)
- HTTPS transport encryption
- Password bcrypt hashing
- JWT Token authentication
- Basic RBAC access control
- Database regular backup (Docker Volume)

### Future Commercial Extension (Architecture Pre-reserved)
- Auth middleware and permission checks modularized for enhancement
- Sensitive field encryption markers pre-reserved
- Audit logging middleware pre-embedded (can be disabled, enable for commercial)
- User data export/delete interfaces pre-reserved (GDPR/PIPL compliance)

---

## 16. Deployment

- Self-hosted Docker Compose
- All containers use `star-catcher-` prefix (avoid conflicts with other services)
- Local Docker installation available
- Future: Local model deployment for cost reduction

---

## 17. Phased Implementation Plan

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| **Phase 1** | Basic Error Notebook (MVP) | Auth, family groups, photo upload, AI recognition, multi-round check, error management, parent daily view, PWA, i18n, Docker |
| **Phase 2** | AI Understanding + Knowledge Graph | Knowledge graph construction, Question Understanding Agent, Diagnosis Agent, mastery tracking, parent reports v1, admin content management |
| **Phase 3** | Learning Loop + Intervention | Weakness profiling, intervention planning, review scheduling, daily task packs, similar questions, explanation/practice cards, progressive reveal, mastery evaluation, feedback loop |
| **Phase 4** | Parent Dashboard + UX Polish | Full parent dashboard, detailed analysis, learning suggestions, intervention tracking, child-friendly UI optimization, student profile visualization |
| **Phase 5** | Ongoing Optimization | Learning Brain upgrade, local model deployment, Android APK, multi-textbook support, security enhancement, data export |

---

## 18. Future Roadmap (to be tracked in README.md)

- [ ] Android APK packaging via TWA (Trusted Web Activity)
- [ ] Local model deployment via AI Provider abstraction layer (Ollama/vLLM)
- [ ] Multi-textbook edition support (PEP/BSD/Jiangsu editions)
- [ ] Commercial-grade security (encryption, audit, compliance, parent authorization)
- [ ] Learning data export to PDF
- [ ] Third-party login (WeChat/Google OAuth)
- [ ] Operations management dashboard (for commercial use)
- [ ] Teacher role: class-level weakness view, targeted assignments
- [ ] Learning community: anonymous peer comparison (strict privacy)
- [ ] AI cost optimization: hybrid scheduling (local small model + cloud large model)
