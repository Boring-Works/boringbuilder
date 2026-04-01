# Technical Debt Log

## Active Debt

### D1: `openai/streaming` import path deprecated in v6
**File:** `worker/agents/inferutils/core.ts:2`
**Why carrying:** openai v6 ships a backwards-compat shim at `openai/streaming` so it works. Upstream vibesdk uses the same path. Fixing it would diverge from upstream unnecessarily.
**Resolve when:** Next upstream sync that updates the import path, or when we bump to openai v6.

### D2: `x-session-affinity` header may not pass through AI Gateway
**File:** `worker/agents/inferutils/core.ts`
**Why carrying:** CF docs only show this header for direct Workers AI API calls, not through AI Gateway. The header is harmless if ignored (no error, no side effect). If it works, we get prompt caching. If not, it's a no-op.
**Resolve when:** Cloudflare documents AI Gateway support for session affinity, or we verify via observability.

### D3: `addConversationMessage` full read-modify-write per message
**File:** `worker/agents/core/codingAgent.ts`
**Why carrying:** Requires DO SQLite schema migration. High effort, medium risk. Performance impact is real but not user-facing (SQLite is fast for single-tenant DO).
**Resolve when:** Conversation history exceeds 500 messages in typical sessions.

### D4: `handleWebSocketMessage` recreated on every state update
**File:** `src/routes/chat/hooks/use-chat.ts`
**Why carrying:** Fixing requires converting 17 state deps to refs. High risk of introducing stale closure bugs. The current approach works, just burns more GC cycles.
**Resolve when:** Profiling shows this as a measurable bottleneck in Chrome DevTools.

### D5: `appViews` table has no unique index on (userId, appId)
**File:** `worker/database/schema.ts`
**Why carrying:** Requires D1 migration + data deduplication of existing rows. View counts are currently inflated for repeat visitors.
**Resolve when:** View counts are used for monetization or public ranking.

### D6: Vault WebSocket has no reconnection logic
**File:** `src/contexts/vault-context.tsx`
**Why carrying:** Vault operations fail silently if WS drops. Low frequency feature.
**Resolve when:** Vault is used in production for BYOK key management.

### D7: `void this.sql` in DO constructor swallows table creation errors
**File:** `worker/agents/core/codingAgent.ts`
**Why carrying:** Constructor cannot be async. Moving to onStart requires restructuring initialization order. Risk of breaking existing DO instances.
**Resolve when:** DO storage errors are observed in production logs.

### D8: `AgentContext` import deprecated in agents SDK 0.8
**File:** `worker/agents/core/codingAgent.ts:1`
**Why carrying:** The `AgentContext` type is still exported by the agents package (backwards compat) but the docs now use `getCurrentAgent()` pattern. This is upstream vibesdk code.
**Resolve when:** We bump agents SDK to ^0.8 or upstream updates their usage.

## Resolved

- **D10 (compat date):** Bumped to 2026-02-01 (was 2025-08-10)
- Workers AI provider slug `workersai/` -> `workers-ai/` (scrap session fix, not applicable to BoringForge multi-provider setup)
- `ALLOWED_EMAILS` singular/plural mismatch fixed in initial fork
- AI proxy origin check restored in initial fork
- Duplicate `AgentConstraintConfig` interface removed (Mar 31)
- Dead `'gemini'` provider check fixed (Mar 31)
- `DISABLED` model early-return guard added (Mar 31)
- `google-vertex-ai` added to byokHelper providerList (Mar 31)
- `openai` added to directOverride switch (Mar 31)
