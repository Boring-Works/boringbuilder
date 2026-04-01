# Technical Debt Log

## Active Debt

### D1: `openai/streaming` import path deprecated in v6
**File:** `worker/agents/inferutils/core.ts:2`
**Why carrying:** openai v6 ships a backwards-compat shim at `openai/streaming` so it works. Upstream vibesdk uses the same path.
**Resolve when:** Bump to openai v6 or upstream updates the import.

### D2: `x-session-affinity` header may not pass through AI Gateway
**File:** `worker/agents/inferutils/core.ts`
**Why carrying:** CF docs show this header for direct Workers AI calls only. Harmless no-op if ignored through gateway.
**Resolve when:** Verify via AI Gateway observability or CF documents support.

### D3: `addConversationMessage` full read-modify-write per message
**File:** `worker/agents/core/codingAgent.ts`
**Why carrying:** Requires DO SQLite schema migration. Low user impact (single-tenant DO).
**Resolve when:** Conversation history exceeds 500 messages.

### D4: `handleWebSocketMessage` recreated on every state update
**File:** `src/routes/chat/hooks/use-chat.ts`
**Why carrying:** 17 state deps need converting to refs. High stale closure risk.
**Resolve when:** Profiling shows measurable bottleneck.

### D5: `appViews` table has no unique index on (userId, appId)
**File:** `worker/database/schema.ts`
**Why carrying:** Requires D1 migration + dedup. View counts inflated for repeat visitors.
**Resolve when:** Views used for ranking or monetization.

### D6: Vault WebSocket has no reconnection logic
**File:** `src/contexts/vault-context.tsx`
**Why carrying:** Vault operations fail silently if WS drops. Low frequency feature.
**Resolve when:** BYOK is in production use.

### D7: `void this.sql` in DO constructor swallows table creation errors
**File:** `worker/agents/core/codingAgent.ts`
**Why carrying:** Constructor cannot be async. Moving to onStart risks breaking existing DOs.
**Resolve when:** DO storage errors observed in logs.

### D8: `AgentContext` import deprecated in agents SDK 0.8
**File:** `worker/agents/core/codingAgent.ts:1`
**Why carrying:** Still exported for backwards compat. Upstream vibesdk code.
**Resolve when:** Bump agents SDK to ^0.8 or upstream updates.

### D9: Workers AI /compat endpoint -- builds stalling
**File:** `worker/agents/inferutils/core.ts`
**Why carrying:** Workers AI model calls through /compat endpoint are stalling on some builds. Models selected (Kimi K2.5, Nemotron 3, GLM 4.7 Flash) may not all support OpenAI-compatible chat completions format through the gateway. Need to verify each model works individually.
**Resolve when:** Live test each model through /compat, swap any that fail.

### D10: Module-level `env` import evaluated at parse time
**File:** `worker/agents/inferutils/config.ts:184`
**Why carrying:** `env.PLATFORM_MODEL_PROVIDERS` checked at module scope. Safe because it's a wrangler var, but fragile if moved to secret.
**Resolve when:** Refactor to lazy evaluation or move to per-request context.

### D11: Template R2 bucket frozen since Feb 25
**File:** `wrangler.jsonc` TEMPLATES_BUCKET binding
**Why carrying:** Templates uploaded manually from GitHub fork. Dependencies stale. No auto-sync pipeline.
**Resolve when:** Build boringforge-templates monorepo with Renovate + auto-deploy to R2.

### D12: BYOK `getUserProviderStatus` always returns false
**File:** `worker/api/controllers/modelConfig/byokHelper.ts:5-20`
**Why carrying:** BYOK intentionally disabled. But validation code still runs and will produce misleading 403 errors if re-enabled.
**Resolve when:** BYOK re-enabled for multi-user deployment.

### D13: `agentConfigs` state missing `constraint` field in settings UI
**File:** `src/routes/settings/index.tsx:397-415`
**Why carrying:** Constraint data exists on backend but never sent in full to frontend. Config modal constraint alert never renders.
**Resolve when:** Settings page refactored to use full AgentDisplayConfig from WebSocket.

### D14: Screenshot analysis has no consumer
**File:** `worker/agents/core/behaviors/base.ts`
**Why carrying:** `analyzeScreenshot()` runs in background after capture but results are only broadcast via WebSocket. No tool or operation reads the analysis to auto-fix issues.
**Resolve when:** Wire analysis results back into the agentic loop as context for next tool call.

## Resolved (April 1 2026)

- **D10 (old, compat date):** Bumped to 2026-02-01
- Duplicate `AgentConstraintConfig` interface removed
- Dead `'gemini'` provider check fixed
- `DISABLED` model early-return guard added
- `google-vertex-ai` added to byokHelper providerList
- `openai` added to directOverride switch
- All hardcoded Gemini fallbacks replaced with Workers AI
- DO lock bug in buildWrapper finally block fixed (generationPromise cleared before DB call)
- Last Gemini fallback in unstructured retry path fixed
- CORS subdomain restriction added (requires `-` in hostname)
- Partial config save rejection fixed (temperature-only 400 error)
- Duplicate `resetAllConfigs` API method deleted
- Dead WS type guard removed
- Debug `console.log("Came here")` removed
- `workers-ai` added to fallback providerList
- Workers AI /compat endpoint routing fixed (was using provider-specific endpoint)
- Structured output blocklist updated for workers-ai
- Workers AI max_tokens handling added (was sending max_completion_tokens)
- Compactification interval reduced from 9 to 4 tool calls
- General chat mode enabled
- Presentation run_analysis unlocked
- Screenshot analysis pipeline wired up (Kimi K2.5 vision, background)
- Workers AI provider badge added to frontend
- Browser Rendering 401 error message improved
