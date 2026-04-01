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
- AI/LLM: Workers AI free tier (Nemotron 3, Kimi K2.5, Qwen3, GLM 4.7, Granite 4, DeepSeek R1 Distill)
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
- CF Account: `94bdc287cd4e0622b68f9e18e406ae66`

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
| Container | UserAppSandboxService | 4 vCPU / 12GB / 10GB disk |
| Dispatch | `DISPATCHER` | `boringbuilder-apps` (WfP) |
| Rate Limit | `API_RATE_LIMITER` | 10K/min |
| Rate Limit | `AUTH_RATE_LIMITER` | 1K/min |

## Database Tables (19 in D1)

users, sessions, api_keys, apps, favorites, stars, app_likes, comment_likes, app_comments, app_views, oauth_states, auth_attempts, password_reset_tokens, email_verification_tokens, verification_otps, audit_logs, user_model_configs, user_model_providers, system_settings

## AI Model Configuration

Config at `worker/agents/inferutils/config.ts`. Two modes selected by `PLATFORM_MODEL_PROVIDERS` env var:

**Platform Config (active in production -- Workers AI free tier):**

| Operation | Model | Reasoning | Max Tokens | Temp | Fallback |
|-----------|-------|-----------|------------|------|----------|
| blueprint | Nemotron 3 120B | high | 20000 | 1.0 | Kimi K2.5 |
| projectSetup | Qwen3 30B | medium | 8000 | 1 | GLM 4.7 Flash |
| phaseGeneration | Kimi K2.5 | medium | 8000 | 1 | Nemotron 3 120B |
| phaseImplementation | Kimi K2.5 | low | 48000 | 0.6 | Qwen2.5 Coder 32B |
| conversationalResponse | GLM 4.7 Flash | low | 4000 | 0.8 | Qwen3 30B |
| deepDebugger | Nemotron 3 120B | high | 8000 | 0.2 | DeepSeek R1 Distill |
| fileRegeneration | Qwen2.5 Coder 32B | low | 16000 | 0.0 | GLM 4.7 Flash |
| agenticProjectBuilder | Nemotron 3 120B | medium | 8000 | 1 | Kimi K2.5 |
| realtimeCodeFixer | GLM 4.7 Flash | low | 32000 | 0.2 | Qwen3 30B |
| templateSelection | GLM 4.7 Flash | -- | 2000 | 0.0 | Granite 4.0 Micro |
| fastCodeFixer | GLM 4.7 Flash | low | 64000 | 0.0 | Qwen2.5 Coder 32B |

**Default Config (no env var -- Gemini only):** All operations use Gemini 3 Flash Preview or Gemini 2.5 Flash.

Provider: `workers-ai` (no external API keys needed, runs on CF GPUs)

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
- Platform model: Grok 4.1 Fast (reasoning_effort: high, 8k tokens)
- Fallback: Gemini 2.5 Pro
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
- general: disabled

**Auth:**
- Email whitelist: `ALLOWED_EMAILS` env var (comma-separated)
- Current: codyboring@me.com, barbstreet@jastreet.com, stevenhobbs76@yahoo.com

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
| `worker/agents/core/behaviors/base.ts` | 1901 | Largest agent file |
| `worker/agents/inferutils/schemaFormatters.ts` | 1311 | Data transforms |
| `src/lib/api-client.ts` | 1199 | Centralized API layer |
| `src/routes/app/index.tsx` | 1113 | App route |
| `worker/agents/prompts.ts` | 1108 | Prompt storage |
| `src/routes/chat/utils/handle-websocket-message.ts` | 1037 | WS handler |
| `worker/agents/inferutils/core.ts` | 1020 | Inference engine |
| `scripts/deploy.ts` | 2128 | Deploy orchestrator |
