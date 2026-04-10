# BoringBuilder — Architectural Decisions

This document records key architectural choices made for BoringBuilder that differ from the upstream VibeSdk. Future maintainers should read this before pulling upstream changes.

---

## 1. Model Provider: Workers AI (not external APIs)

**Decision**: Use Cloudflare Workers AI exclusively for all inference.

**Upstream behavior**: VibeSdk pivoted to external APIs (Gemini, Grok, OpenAI).

**Why we diverged**:
- BoringBuilder runs on Cloudflare infrastructure with unified AI Gateway billing
- Workers AI eliminates per-API key management for 6+ providers
- Session affinity for Kimi K2.5 prompt caching is implemented in `core.ts`
- Cost predictability: Workers AI pricing is fixed, external APIs are variable

**Models in use** (see `worker/agents/inferutils/config.ts`):
| Operation | Model | Reason |
|-----------|-------|--------|
| `templateSelection` | `WAI_QWQ_32B` | #1 BFCL, FC support, reasoning |
| `blueprint` | `WAI_KIMI_K2_5` | 256K context + vision + thinking |
| `screenshotAnalysis` | `WAI_GEMMA_4_27B` | Vision specialist, 1/5th Kimi cost |
| `phaseGeneration` / `phaseImplementation` | `WAI_GPT_OSS_120B` | Dense reasoning, cheaper output |
| `firstPhaseImplementation` | `WAI_KIMI_K2_5` | Highest quality for first phase |
| `realtimeCodeFixer` | `WAI_QWQ_32B` | FC + reasoning, confirmed pricing |

**If upstream adds multi-provider support**: Evaluate whether to wrap it around Workers AI or keep our single-provider approach.

---

## 2. Prompt Variants Architecture

**Decision**: Keep 4 prompt variant files instead of upstream's 2-mode inline conditionals.

**Upstream behavior**: Consolidated to `isPresentationProject` boolean flag (2 modes).

**Why we diverged**:
- BoringBuilder supports `renderMode: 'browser'` — a pure browser rendering mode with no sandbox container
- This requires 2 additional variants: `browser` and `browser-generate-only`
- Upstream removed browser rendering support entirely

**Files**:
- `worker/agents/operations/prompts/variants/interactive.ts` — sandbox + Bun/Vite
- `worker/agents/operations/prompts/variants/presentation.ts` — JSON slide decks
- `worker/agents/operations/prompts/variants/browser.ts` — vanilla HTML/CSS/JS, browser-only
- `worker/agents/operations/prompts/variants/browser-generate-only.ts` — read-only browser mode

**Do not remove the variants directory** — it is an active code path.

---

## 3. Security Hardening

**Decision**: Strict origin validation, active JWT validation, multi-email whitelist.

**Upstream behavior**: Single `ALLOWED_EMAIL`, JWT validation commented out, permissive origins.

**Changes in BoringBuilder**:
- `worker/api/controllers/auth/controller.ts`: `ALLOWED_EMAILS` array with `isEmailAllowed()`
- `worker/index.ts`: `isOriginAllowed()` returns 403 (not just warning) for unauthorized origins
- `worker/app.ts`: WebSocket CORS bypass to prevent WS connection breaks
- `validateJWTSecret()` is active (upstream has it commented out)

---

## 4. Compactify Interval: 4 (upstream: 9)

**Decision**: Context compactification every 4 tool calls instead of 9.

**Why**: Aggressive compaction reduces context bloat in long sessions. Workers AI models have lower effective context windows than claimed; early compaction prevents quality degradation.

**File**: `worker/agents/core/behaviors/agentic.ts` line ~48.

---

## 5. Preflight Questions System

**Decision**: Gate agent execution on user answering setup questions before build starts.

**Upstream behavior**: Removed entirely from `agentic.ts`.

**Why we kept it**: Better UX for complex projects. Users configure key decisions upfront rather than mid-build.

**Implementation**: `pendingInputResolver` promise in `agentic.ts`, `preflightQuestions`/`preflightCompleted` state fields.

---

## 6. Memory and Instance Configuration

**Decision**: `standard-4` instance type, 12GB memory, 10 max sandbox instances.

**Upstream behavior**: `standard-3`, 8GB memory, 10 max instances.

**Why**: Higher-tier instances reduce OOM errors during complex TypeScript compilation and large dependency installs.

**File**: `wrangler.jsonc`, `scripts/deploy.ts`.

---

## 7. D1 Read Replicas

**Decision**: Enabled (`ENABLE_READ_REPLICAS: "true"`).

**Status**: Enabled as of the sync. Implementation in `worker/database/database.ts` uses D1's `withSession` API for replica routing.

**Routing strategy**: `getReadDb('fast')` for low-latency reads, `getReadDb('fresh')` for queries needing latest data.

---

## 8. Dependency Versions (Ahead of Upstream)

| Package | BoringBuilder | Upstream |
|---------|---------------|----------|
| `wrangler` | 4.78.0 | 4.50.0 |
| `drizzle-orm` | 0.45.2 | 0.44.7 |
| `compatibility_date` | 2026-02-01 | 2025-08-10 |

**Do not downgrade** these to match upstream.

---

## 9. Template Coverage

**Decision**: Presentation mode enabled, general/workflow templates all active.

**Upstream behavior**: Presentation disabled by default, some feature flags off.

**Why**: BoringBuilder targets a broader audience including presentation creators. All major template categories are active.

---

## Last Updated
April 2026 — synced against upstream `cloudflare/vibesdk@bdbf48a`.
