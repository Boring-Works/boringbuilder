# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Communication Style
- Be professional, concise, and direct
- Do NOT use emojis in code reviews, changelogs, or any generated content
- Focus on substance over style
- Use clear technical language

## Project Overview
BoringForge is an AI-powered full-stack application generation platform built on Cloudflare infrastructure (forked from Cloudflare's VibeSDK).

**Tech Stack:**
- Frontend: React 19.2, TypeScript 5.9, Vite (rolldown-vite 7.x), TailwindCSS 4, React Router v7
- Backend: Cloudflare Workers, Durable Objects, D1 (SQLite), Hono
- AI/LLM: Workers AI (Kimi K2.5, GPT-OSS-120B, QwQ-32B, Qwen2.5-Coder-32B, GLM 4.7 Flash, Gemma 4 26B)
- ORM: Drizzle 0.45, Agents SDK 0.2, OpenAI SDK 5.23
- WebSocket: PartySocket for real-time communication
- Sandbox: Custom container service (4 vCPU, 12GB RAM)
- Git: isomorphic-git with SQLite filesystem
- Linting: ESLint 9 + Prettier (upstream fork convention, not Biome)
- Package Manager: bun (upstream fork convention, not pnpm)
- Tests: Vitest + @cloudflare/vitest-pool-workers
- Commit: Husky pre-commit (typecheck + related tests), commitlint (conventional)

**Deployment:**
- Worker: `boringbuilder` at `build.getboring.io`
- Also on: `boringbuilder.codyboring.workers.dev`
- Deploy: `bun --env-file .prod.vars scripts/deploy.ts`
- Auto-deploy: pushes to main trigger automatic CF deployment (~30s)
- Lockfile must be committed with dep changes (--frozen-lockfile in CI)
- CF Account: `94bdc287cd4e0622b68f9e18e406ae66`

## WARNING: Two Repos Exist
- `~/Projects/boringbuilder` (Boring-Works/boringbuilder) -- THIS IS PRODUCTION
- `~/CodyML/projects/BoringTooling/boringbuild` (Boring-Works/vibesdk) -- STALE FORK, DO NOT USE
- Both deploy to the same CF worker name. Using the wrong one overwrites production.

## Project Structure

**Frontend (`/src`):**
- 90 components in `src/components/`
- 30 route files in `src/routes/`
- 16 hooks in `src/hooks/`
- Single source of truth for types: `src/api-types.ts`
- All API calls in `src/lib/api-client.ts` (1199 lines)

**Backend (`/worker`):**
- Entry point: `worker/index.ts` (216 lines) -- exports DOs, CORS, domain routing
- Agent system: `worker/agents/` (118 files)
  - Core: `codingAgent.ts` (817 lines) -- CodeGeneratorAgent Durable Object
  - Behaviors: `core/behaviors/base.ts` (1901 lines), `phasic.ts` (742), `agentic.ts` (393)
  - Operations: `DeepDebugger.ts` (238), `PhaseGeneration.ts`, `PhaseImplementation.ts`, `UserConversationProcessor.ts`
  - Inference: `inferutils/config.ts` (model selection), `core.ts` (1020 lines), `schemaFormatters.ts` (1311)
  - Tools: `tools/toolkit/` (read-files, run-analysis, regenerate-file, deep-debugger, wait-for-debug)
  - Git: `git/` (SQLite fs adapter, git protocol handler)
  - Prompts: `prompts.ts` (1108 lines)
- Database: `worker/database/` (Drizzle ORM, D1, 19 tables)
- Services: `worker/services/` (12 services: aigateway-proxy, analytics, cache, code-fixer, csrf, deployer, github, oauth, rate-limit, sandbox, secrets, static-analysis)
- API: `worker/api/` (routes, controllers, handlers, Hono adapter)

**Other:**
- `/shared/types/` -- Shared types between frontend/backend
- `/migrations/` -- 5 D1 migrations
- `/container/` -- Sandbox container tooling
- `/sdk/` -- SDK package
- `/debug-tools/` -- AI gateway analytics testing
- `/scripts/` -- deploy.ts (2128 lines), setup.ts (2121 lines)

## Bindings (wrangler.jsonc)

| Type | Binding | Resource |
|------|---------|----------|
| D1 | `DB` | `boringbuilder-db` (1b935239) |
| KV | `VibecoderStore` | d0312f79... |
| R2 | `TEMPLATES_BUCKET` | `boringbuilder-templates` |
| AI | `AI` | Workers AI (remote) |
| DO | `CodeGenObject` | CodeGeneratorAgent |
| DO | `Sandbox` | UserAppSandboxService |
| DO | `DORateLimitStore` | DORateLimitStore |
| DO | `UserSecretsStore` | UserSecretsStore |
| Container | UserAppSandboxService | standard-4 (4 vCPU / 12GB / 10GB disk) |
| Dispatch | `DISPATCHER` | `boringbuilder-apps` (WfP) |
| Rate Limit | `API_RATE_LIMITER` | 10K/min |
| Rate Limit | `AUTH_RATE_LIMITER` | 1K/min |

## Database Tables (19 in D1)

users, sessions, api_keys, apps, favorites, stars, app_likes, comment_likes, app_comments, app_views, oauth_states, auth_attempts, password_reset_tokens, email_verification_tokens, verification_otps, audit_logs, user_model_configs, user_model_providers, system_settings

## AI Model Configuration

Config at `worker/agents/inferutils/config.ts`. Two tiers selected by `PLATFORM_MODEL_PROVIDERS` env var:

**Platform Config (active in production, `PLATFORM_MODEL_PROVIDERS=workers-ai`):**

6-model maximum-quality tier (April 2026):

| Operation | Model | Handle | Reasoning | Max Tokens | Temp | Fallback |
|-----------|-------|--------|-----------|------------|------|----------|
| templateSelection | QwQ-32B | `@cf/qwen/qwq-32b` | (native) | 2000 | 0.15 | GPT-OSS-120B |
| blueprint | Kimi K2.5 | `@cf/moonshotai/kimi-k2.5` | high | 32000 | 0.7 | GPT-OSS-120B |
| projectSetup | GPT-OSS-120B | `@cf/openai/gpt-oss-120b` | medium | 16000 | 0.6 | Kimi K2.5 |
| phaseGeneration | GPT-OSS-120B | `@cf/openai/gpt-oss-120b` | high | 8000 | 0.7 | Kimi K2.5 |
| firstPhaseImpl | Kimi K2.5 | `@cf/moonshotai/kimi-k2.5` | medium | 64000 | 0.6 | Qwen2.5-Coder-32B |
| phaseImpl | Kimi K2.5 | `@cf/moonshotai/kimi-k2.5` | low | 64000 | 0.5 | Qwen2.5-Coder-32B |
| fileRegeneration | Qwen2.5-Coder-32B | `@cf/qwen/qwen2.5-coder-32b-instruct` | -- | 32000 | 0.1 | GLM 4.7 Flash |
| screenshotAnalysis | Gemma 4 26B | `@cf/google/gemma-4-26b-a4b-it` | medium | 8000 | 0.3 | Kimi K2.5 |
| realtimeCodeFixer | QwQ-32B | `@cf/qwen/qwq-32b` | (native) | 16000 | 0.25 | GLM 4.7 Flash |
| fastCodeFixer | GLM 4.7 Flash | `@cf/zai-org/glm-4.7-flash` | low | 64000 | 0.0 | Qwen3-30B |
| conversational | Kimi K2.5 | `@cf/moonshotai/kimi-k2.5` | low | 4000 | 0.8 | GLM 4.7 Flash |
| deepDebugger | GPT-OSS-120B | `@cf/openai/gpt-oss-120b` | high | 16000 | 0.3 | Kimi K2.5 |
| agenticBuilder | Kimi K2.5 | `@cf/moonshotai/kimi-k2.5` | high | 48000 | 0.7 | GPT-OSS-120B |

**Default Config (no env var):** Budget tier using Qwen3-30B as backbone, Granite 4.0 Micro for template selection, Gemma 4 26B for vision. All Workers AI, no API keys needed.

**Model API Notes (Critical):**
- **QwQ-32B**: Different inference backend. No `reasoning_effort` param. Uses `guided_json` not `response_format`. Default temp 0.15. Has `nonReasoning: true` flag in config.types.ts.
- **Kimi K2.5, GPT-OSS-120B, DeepSeek R1 Distill**: Full OpenAI-compatible API with `response_format`, `tools`, `reasoning_effort`, `max_completion_tokens`.
- **Structured output whitelist** (core.ts lines 630-636): Only Kimi K2.5, GPT-OSS-120B, DeepSeek R1 Distill get `response_format`. All others use markdown format instructions via `schemaFormatters.ts`.

Provider: `workers-ai` (no external API keys needed, runs on CF GPUs)

## Workers AI Routing (Critical)
- Workers AI models use /compat gateway endpoint via AI Gateway
- Model IDs keep full prefix: `workers-ai/@cf/moonshotai/kimi-k2.5` (no stripping)
- Session affinity header (`x-session-affinity`) set automatically in core.ts for prompt caching (Kimi K2.5: $0.60/M input drops to $0.10/M cached)
- Inference fallback: On InferError with partial response >1000 chars, retries with GLM 4.7 Flash; on other errors, uses fallbackModel from config; exponential backoff (500ms * 2^attempt, max 10s, retryLimit: 5)
- All cheap retry fallbacks use WAI_GLM_47_FLASH (never Gemini; no API key)

## Core Architecture

**Durable Objects Pattern:**
- Each chat session = Durable Object instance (CodeGeneratorAgent)
- Persistent state in SQLite (blueprint, files, history)
- Ephemeral state in memory (abort controllers, active promises)
- Single-threaded per instance

**State Machine:**
IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING -> IDLE

**WebSocket Communication:**
- Real-time streaming via PartySocket
- State restoration on reconnect (agent_connected message)
- Message deduplication (tool execution causes duplicates)

**Git System:**
- isomorphic-git with SQLite filesystem adapter (`worker/agents/git/`)
- Full commit history in Durable Object storage
- Git clone protocol support (rebase on template)
- FileManager auto-syncs from git via callbacks

## Common Development Tasks

**Change LLM Model for Operation:**
Edit `worker/agents/inferutils/config.ts` -> `PLATFORM_AGENT_CONFIG` or `DEFAULT_AGENT_CONFIG`

**Modify Conversation Agent Behavior:**
Edit `worker/agents/operations/UserConversationProcessor.ts`

**Add New WebSocket Message:**
1. Add type to `worker/api/websocketTypes.ts`
2. Handle in `worker/agents/core/websocket.ts`
3. Handle in `src/routes/chat/utils/handle-websocket-message.ts`

**Add New LLM Tool:**
1. Create `worker/agents/tools/toolkit/my-tool.ts`
2. Export `createMyTool(agent, logger)` function
3. Import in `worker/agents/tools/customTools.ts`
4. Add to `buildTools()` (conversation) or `buildDebugTools()` (debugger)

**Add API Endpoint:**
1. Define types in `src/api-types.ts`
2. Add to `src/lib/api-client.ts`
3. Create service in `worker/database/services/`
4. Create controller in `worker/api/controllers/`
5. Add route in `worker/api/routes/`
6. Register in `worker/api/routes/index.ts`

## Important Context

**Deep Debugger:**
- Location: `worker/agents/operations/DeepDebugger.ts` (238 lines)
- Tool: `worker/agents/tools/toolkit/deep-debugger.ts`
- Platform model: Nemotron 3 120B (reasoning_effort: high, 8k tokens)
- Fallback: DeepSeek R1 Distill
- Cannot run during code generation (checked via isCodeGenerating())

**User Secrets Store (Durable Object):**
- Location: `worker/services/secrets/`
- Purpose: Encrypted storage for user API keys with key rotation
- Architecture: One DO per user, XChaCha20-Poly1305 encryption, SQLite backend
- Key derivation: MEK -> UMK -> DEK (hierarchical PBKDF2)
- Tests: `worker/services/secrets/UserSecretsStore.test.ts`

**Abort Controller Pattern:**
- `getOrCreateAbortController()` reuses controller for nested operations
- Cleared after top-level operations complete
- User abort cancels entire operation tree

**Message Deduplication:**
- Tool execution causes duplicate AI messages
- Backend skips redundant LLM calls (empty tool results)
- Frontend utilities deduplicate live and restored messages

**Capabilities (wrangler.jsonc):**
- app: enabled
- presentation: enabled
- general: enabled

**Auth:**
- Email whitelist: `ALLOWED_EMAILS` env var (comma-separated)
- Current: codyboring@me.com, barbstreet@jastreet.com, stevenhobbs76@yahoo.com

**Screenshots:**
- Uses CF Browser Rendering REST API (not binding) at /browser-rendering/snapshot
- Requires CLOUDFLARE_API_TOKEN secret with "Browser Rendering - Edit" permission
- Screenshot analysis wired to Kimi K2.5 vision (runs in background after capture)
- Analysis broadcasts SCREENSHOT_ANALYSIS_RESULT via WebSocket

**Stuck App Recovery:**
- Apps stuck in "generating" = DO crashed before finally block ran
- `AppService.cleanupStaleGenerating(60)` marks old generating apps as completed
- Manual: `UPDATE apps SET status = 'completed' WHERE status = 'generating'`

## Commit Message Rules
- Commitlint rejects sentence-case subjects ("AI" triggers it -- use "ai" lowercase)
- Max header: 200 chars
- Pre-commit runs typecheck + related vitest tests (can be slow with fuzz tests)

## Core Rules (Non-Negotiable)

**1. Strict Type Safety**
- NEVER use `any` type (ESLint rule is off but this rule stands -- 33 existing violations in worker/, clean these up over time)
- Frontend imports types from `@/api-types` (single source of truth)
- Search codebase for existing types before creating new ones

**2. DRY Principle**
- Search for similar functionality before implementing
- Extract reusable utilities, hooks, and components

**3. Follow Existing Patterns**
- Frontend APIs: All in `src/lib/api-client.ts`
- Backend Routes: Controllers in `worker/api/controllers/`, routes in `worker/api/routes/`
- Database Services: In `worker/database/services/`
- Types: Shared in `shared/types/`, API in `src/api-types.ts`

**4. Code Quality**
- Production-ready code only
- No hacky workarounds
- Comments explain purpose, not narration

**5. File Naming**
- React Components: PascalCase.tsx
- Utilities/Hooks: kebab-case.ts
- Backend Services: PascalCase.ts

## File Size Hotspots

| File | Lines | Note |
|------|-------|------|
| `worker/agents/core/behaviors/base.ts` | 1978 | Largest agent file (includes screenshot analysis) |
| `worker/agents/inferutils/schemaFormatters.ts` | 1311 | Data transforms |
| `src/lib/api-client.ts` | 1199 | Centralized API layer |
| `src/routes/app/index.tsx` | 1113 | App route |
| `worker/agents/prompts.ts` | 1108 | Prompt storage |
| `src/routes/chat/utils/handle-websocket-message.ts` | 1037 | WS handler |
| `worker/agents/inferutils/core.ts` | 1058 | Inference engine (Workers AI /compat routing) |
| `scripts/deploy.ts` | 2128 | Deploy orchestrator |
