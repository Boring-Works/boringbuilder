# VibeSDK Master Guide -- The Complete Playbook

**For:** Cody Boring / Boring Works
**Date:** 2026-02-24
**Platform:** BoringBuilder (fork of Cloudflare VibeSDK)
**Deploy:** boringbuilder.codyboring.workers.dev / getboring.io

---

## What This Document Is

Everything you need to know about VibeSDK to run it, extend it, and exploit it. Based on a full source code audit of 88+ agent files, 80+ frontend components, the SDK package, the template system, and 80+ community/web sources.

---

## Part 1: How It Actually Works (The Engine)

### The Generation Pipeline

When a user types a prompt and hits enter, here's the exact sequence:

```
User Prompt
  |
  v
[1] Template Selection (Gemini 2.5 Flash Lite -- cheapest model)
    - AI classifies: app / workflow / presentation / general
    - Matches against template catalog from R2 bucket
    - Downloads + extracts template zip in memory
  |
  v
[2] Blueprint Generation (Gemini 3 Pro Preview -- most expensive model)
    - System prompt: "You are a meticulous senior software architect"
    - Outputs: project name, features, file list, phases, dependencies
    - Streamed to client as NDJSON chunks
  |
  v
[3] Phase Generation (Gemini 3 Flash Preview)
    - Breaks blueprint into ordered phases
    - Each phase: name, description, files to generate
  |
  v
[4] Phase Implementation (Gemini 3 Flash Preview -- per phase)
    - Generates actual code file by file
    - Files streamed via WebSocket in real-time
    - Template "donttouch" files are protected
  |
  v
[5] Sandbox Deployment
    - Files written to container via sandbox service
    - `bun install && bun run dev` starts preview
    - Preview URL sent back to client
  |
  v
[6] Lint + Debug Cycle (if errors found)
    - Static analysis runs in sandbox
    - Deep Debugger (high reasoning model) diagnoses
    - Regenerates broken files
    - Loops until clean or max retries
```

### Two Behavior Modes

**Phasic Mode** (default for web apps):
- Structured, predictable, phase-by-phase
- Blueprint -> Phases -> Implementation -> Review
- Best for: complete app generation from scratch
- State machine: IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING -> REVIEWING

**Agentic Mode** (conversational):
- Free-form, tool-calling agent
- Can read files, run commands, regenerate files interactively
- Best for: iterative refinement, debugging, follow-up changes
- Has access to: `read_files`, `run_analysis`, `exec_commands`, `regenerate_file`, `run_npm_install`, etc.

### The Tool System (What the AI Can Do)

**During Code Generation (Phasic):**
- Generate files one at a time
- Read existing template files for context
- The LLM has no direct tool access -- it just outputs code

**During Agentic/Debug Mode:**
| Tool | Purpose |
|------|---------|
| `read_files` | Read multiple project files |
| `regenerate_file` | Rewrite a specific file |
| `run_analysis` | Run static analysis (lint) |
| `get_runtime_errors` | Get errors from running app |
| `get_logs` | Get server/build logs |
| `exec_commands` | Run shell commands in sandbox |
| `run_npm_install` | Install packages |
| `mark_debugging_complete` | Signal task completion |
| `init_suitable_template` | Select and import a template |
| `generate_blueprint` | Create project blueprint |

Tools declare resource dependencies (reads/writes) and the execution engine automatically parallelizes non-conflicting tool calls using topological sort.

### The Multi-Model Architecture

The system doesn't use one model for everything. Each operation is tuned:

| Operation | Why This Model |
|-----------|---------------|
| Template Selection | Cheapest (classification task) |
| Blueprint | Most powerful (architectural thinking) |
| Code Implementation | Fast + cheap (mechanical code output) |
| Conversation | Mid-tier, fast (user-facing latency) |
| Deep Debugging | Powerful + high reasoning (analysis) |
| File Regeneration | Fast, no reasoning (quick fixes) |

**Fallback chain:** Primary model fails -> append partial response as context -> retry with cheaper model -> if still fails -> switch to configured fallback model -> exponential backoff up to 5 retries.

**Loop detection:** Every 50 characters of streaming output, a `LoopDetector` checks the last 1000 chars for repetition. Kills the stream immediately if detected. Saves tokens and money.

### The Git System

Every project has a full git history stored in SQLite inside the Durable Object:

- `isomorphic-git` with a custom SQLite filesystem adapter
- Files >1.8MB are chunked across multiple SQLite rows
- Full `git clone` protocol support (users can clone their projects)
- Commits track every generation phase
- Reset capability for undo operations

### The Vault (Encrypted Secrets)

Client-side zero-knowledge encryption for user API keys:

- Password: Argon2id key derivation
- Passkey: WebAuthn PRF key derivation
- Encryption: XChaCha20-Poly1305
- Server never sees plaintext secrets
- Recovery codes (8 codes, encrypted with vault master key)
- Agent can request vault unlock via WebSocket when it needs a secret

---

## Part 2: The Template System

### How Templates Work

Templates live in a separate GitHub repo (`cloudflare/vibesdk-templates`) and are deployed to an R2 bucket as zip files.

**Template Catalog Flow:**
1. `template_catalog.json` in R2 lists all available templates
2. AI selects best match based on user prompt
3. Template zip downloaded and extracted in memory
4. Template files become the project foundation
5. AI generates new files on top of the template

### Template Types Available

| Template | Framework | Use Case |
|----------|-----------|----------|
| `c-code-react-runner` | React + Vite | General web apps |
| `vite-cfagents-runner` | React + CF Agents SDK | Apps with MCP tools |
| `vite-cf-DO-runner` | React + Durable Objects | Stateful apps |
| `vite-cf-DO-KV-runner` | React + DO + KV | Stateful with cache |
| `minimal-vite` | Minimal Vite | Lightweight apps |
| `reveal-presentation-dev` | Reveal.js | Slide presentations |

Next.js templates exist but are **currently filtered out** in the code.

### Template Structure

A valid template has:
- `package.json` (dependencies, scripts)
- `wrangler.jsonc` (Cloudflare config)
- `vite.config.ts` (build config)
- `.important_files.json` (files the AI should read)
- `.donttouch_files.json` (files the AI must not modify)
- `.redacted_files.json` (files hidden from AI context)

### Custom Templates

Your `TEMPLATES_REPOSITORY` var points to the template source. You can:
1. Fork `cloudflare/vibesdk-templates`
2. Add your own templates following the structure
3. Point `TEMPLATES_REPOSITORY` to your fork
4. Run the deploy script to push to R2

**NOTE:** Your deployment still points to `https://github.com/cloudflare/vibesdk-templates`. You should fork this and point to your own repo.

---

## Part 3: The SDK (Programmatic Access)

### `@cf-vibesdk/sdk` (TypeScript)

The SDK lets you interact with the platform without the web UI:

```typescript
import { PhasicClient } from '@cf-vibesdk/sdk';

const client = new PhasicClient({
    baseUrl: 'https://boringbuilder.codyboring.workers.dev',
    apiKey: 'your-api-key',
});

// Build an app programmatically
const session = await client.build("Build a dashboard for tracking inventory", {
    projectType: 'app',
    autoConnect: true,
    autoGenerate: true,
});

// Wait for completion
await session.wait.generationComplete({ timeoutMs: 600_000 });

// Get all generated files
const files = session.files.snapshot(); // Record<string, string>

// Get preview URL
const previewUrl = session.state.previewUrl;

// Deploy to Cloudflare
session.deployCloudflare();
await session.wait.cloudflareDeployed();
```

### SDK Capabilities

- `client.build(prompt, options)` -- Create new app
- `client.connect(agentId)` -- Resume existing session
- `client.apps.listPublic()` -- Browse public apps
- `client.apps.getGitCloneToken(appId)` -- Get git clone auth
- `session.followUp(message)` -- Send follow-up instructions
- `session.files.read(path)` -- Read specific file
- `session.phases.list()` -- Get phase timeline
- `session.on('file', cb)` -- React to file changes in real-time

### `@cf-vibesdk/cli` (Command Line)

v0.0.1 available on npm. Wraps the SDK for terminal usage. Early stage.

---

## Part 4: The Frontend (What Can Be Decoupled)

### Immediately Reusable Components

| Component | Path | Dependencies |
|-----------|------|-------------|
| `FileExplorer` | `src/routes/chat/components/file-explorer.tsx` | None (pure) |
| `MonacoEditor` | `src/components/monaco-editor/` | None (pure, read-only) |
| `PreviewIframe` | `src/routes/chat/components/preview-iframe.tsx` | WebSocket optional |
| `Blueprint` | `src/routes/chat/components/blueprint.tsx` | None |

### What You Can Build Without the Chat

1. **Preview-only embedding** -- Just use PreviewIframe with a URL
2. **Code viewer widget** -- FileExplorer + MonacoEditor, no chat needed
3. **Headless build pipeline** -- SDK only, no frontend at all
4. **Custom chat UI** -- Use the WebSocket protocol directly
5. **App gallery** -- Use the apps API (`listPublic`, `getAppDetails`)

### The Feature Registry

The frontend has a pluggable feature system:
- Register project types: app, presentation, general
- Each type can have custom preview components
- Each type can have custom file processors
- Lazy-loaded via React.lazy()
- You could add a "real estate listing" or "auction site" project type

---

## Part 5: Costs & Infrastructure

### Minimum Monthly Cost

| Service | Cost |
|---------|------|
| Workers Paid Plan | $5/mo |
| Workers for Platforms | $25/mo |
| D1 (database) | Free tier usually covers it |
| R2 (template storage) | Free tier usually covers it |
| KV (sessions) | Free tier usually covers it |
| AI Gateway | Free |
| **Subtotal infrastructure** | **~$30/mo** |
| LLM API costs | Variable (biggest expense) |

### LLM Cost Per App Generation

Rough estimate for a typical app generation (blueprint + 5 phases + lint):
- ~50K-200K input tokens across all calls
- ~10K-50K output tokens
- With Gemini models: **$0.05-0.50 per generation**
- With GPT/Claude models: **$0.50-5.00 per generation**

### Zero Egress Advantage

R2 and D1 have **zero egress fees**. This is significant for a platform that serves generated files, template zips, and preview assets to users. On AWS S3, this would add up fast.

---

## Part 6: The 7 Unfair Advantages (Ranked)

### #1: White-Label AI App Builder as a Service

**The opportunity:** You own the infrastructure. Charge others to build apps through YOUR branded platform.

**Why it's unfair:** Bolt.new, Lovable, and v0 are SaaS you pay for. With VibeSDK, you ARE the SaaS. MIT license means full commercial rights. No revenue share. No usage restrictions. No dependency on someone else's platform staying alive.

**How to execute:**
- Brand it (done -- BoringBuilder)
- Add Stripe billing via the API client
- Sell subscriptions: $29/mo for 50 app generations, $99/mo unlimited
- Target: non-technical founders, agencies, small businesses
- Your cost per generation: $0.05-0.50 (Gemini). Your revenue per generation: $2-10+

**Risk level:** Low. You already have it deployed.

---

### #2: Domain-Specific Template Packs

**The opportunity:** Create custom templates for specific industries. The template selection AI automatically routes users to the right one.

**Why it's unfair:** Generic AI builders generate generic apps. A template pre-loaded with industry-specific components, data models, and integrations produces dramatically better results with less AI effort.

**Vertical template ideas:**
- **Real estate** (for SPE): Property listing sites, auction platforms, seller dashboards
- **Restaurants**: Menu sites, ordering systems, reservation pages
- **Events**: Registration, ticketing, agenda pages
- **Nonprofits/Historic sites** (for Rocky Mount): Donation pages, event calendars, exhibit browsers
- **Local government**: Public meeting portals, permit applications

**How to execute:**
1. Fork `vibesdk-templates`
2. Create templates with pre-built components for each vertical
3. Include `.important_files.json` guiding the AI on the domain
4. Deploy to your R2 bucket
5. Charge premium for industry packs

---

### #3: Headless App Factory via SDK

**The opportunity:** Use the SDK to programmatically generate apps at scale without any human interaction.

**Why it's unfair:** While everyone else is manually prompting AI builders one-at-a-time, you can batch-generate hundreds of apps from a CSV or database.

**Use cases:**
- Generate a landing page for every property listing in SPE
- Generate a portfolio page for every client in an agency roster
- Generate dashboards from database schemas
- A/B test different app variants by generating multiple versions from the same brief

**How to execute:**
```typescript
const properties = await getPropertiesFromSPE();
for (const property of properties) {
    const session = await client.build(
        `Build a single-page property listing for: ${property.address}.
         Price: ${property.price}. Features: ${property.features.join(', ')}.
         Include photo gallery, map, and contact form.`,
        { projectType: 'app', selectedTemplate: 'real-estate-listing' }
    );
    await session.wait.cloudflareDeployed();
    console.log(`Deployed: ${session.state.deploymentUrl}`);
}
```

---

### #4: The Preview System as an Embeddable Widget

**The opportunity:** The PreviewIframe component is nearly standalone. You can embed live app previews anywhere -- in emails, product pages, pitch decks.

**Why it's unfair:** Instead of screenshots or mockups, show a LIVE, interactive demo of what was built. No one else in the AI builder space offers embeddable live previews that you control.

**How to execute:**
- Extract PreviewIframe component
- Create a `<boring-preview>` web component wrapper
- Embed script: `<script src="https://getboring.io/embed.js"></script>`
- Usage: `<boring-preview app-id="abc123"></boring-preview>`
- Charge for embed usage or include in premium tier

---

### #5: AI Agents Integration Hub

**The opportunity:** The `vite-cfagents-runner` template already supports the Cloudflare Agents SDK with MCP tool support. You can create apps that are themselves AI agents.

**Why it's unfair:** Most AI builders make static websites. VibeSDK can build apps that USE AI — chatbots, document processors, data analyzers. It's AI building AI tools.

**How to execute:**
- Build specialized agent templates (customer support bot, document analyzer, data dashboard with AI insights)
- Users describe their agent's purpose
- VibeSDK generates a full app with the agent embedded
- Deploy as a Cloudflare Worker with Durable Objects
- The generated app has its own AI capabilities

---

### #6: Git Clone as Distribution Channel

**The opportunity:** Every generated app supports `git clone`. Users can clone projects, modify them locally, and push updates. This creates a unique distribution model.

**Why it's unfair:** Other AI builders lock you in -- you can only edit in their UI. VibeSDK generates REAL projects with REAL git history that work in any IDE. This makes it a code generator, not a walled garden.

**How to execute:**
- Generate starter projects for common use cases
- Publish as a "project marketplace" where users can browse, preview, and clone
- Premium templates generate more sophisticated starting points
- Users modify locally and re-deploy to Cloudflare
- Charge for the generation, not the ongoing hosting

---

### #7: Internal Tool Builder for Your Ventures

**The opportunity:** Use BoringBuilder internally across all Boring Works ventures to rapidly prototype and deploy tools.

**Why it's unfair:** Instead of hiring developers or spending weeks building internal tools, generate them in minutes.

**Specific opportunities:**
- **SPE**: Generate seller onboarding wizards, property comparison tools, auction countdown pages
- **Rocky Mount**: Generate exhibit browsers, event registration pages, donation campaigns
- **Holston Partners**: Generate data dashboards, constituency maps, report generators
- **GameVault**: Generate game authentication portals, flip scanner UIs, vault interfaces

**How to execute:**
- Create private templates for each venture's tech stack
- Use the SDK to integrate app generation into your existing workflows
- Build once, deploy to each venture's domain via Cloudflare

---

## Part 7: Remaining Fix List

Items still pending from the review:

| Item | Status | Priority |
|------|--------|----------|
| TEMPLATES_REPOSITORY points to Cloudflare's repo | FIXED -- forked to Boring-Works/vibesdk-templates | DONE |
| Rate limiter namespace IDs 2101/2102 | FIXED -- migrated from unsafe to GA ratelimits config | DONE |
| Sandbox container not starting for some sessions | Infrastructure issue | MONITOR -- Cloudflare Containers beta |
| HKDF info string `vibesdk-vault-vmk` | Intentionally kept -- changing breaks existing vaults | CLOSED |
| Rotate exposed secrets from chat history | Not done | HIGH -- API token and keys were in plain text |
| SandboxDockerfile rebrand | Changed but not rebuilt | LOW -- needs `colima start` then docker build/push |

---

## Quick Reference

| What | Where |
|------|-------|
| Agent config (models) | `worker/agents/inferutils/config.ts` |
| System prompts | `worker/agents/operations/*.ts` |
| Template config | `TEMPLATES_REPOSITORY` var in wrangler.jsonc |
| Available tools | `worker/agents/tools/toolkit/` |
| Frontend components | `src/routes/chat/components/` |
| API endpoints | `src/lib/api-client.ts` |
| SDK | `/sdk/src/` |
| WebSocket protocol | `worker/api/websocketTypes.ts` |
| Git system | `worker/agents/git/` |
| Vault crypto | `src/contexts/vault-context.tsx` |
| Debug tools | `/debug-tools/` |
| Community research | `VIBESDK-RESEARCH.md` (same directory) |

---

*Compiled from 4 parallel deep research agents analyzing: core architecture (88+ agent files), template system, community sources (80+ URLs), and frontend (80+ components).*
