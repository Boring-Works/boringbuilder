# VibeSDK Master Guide -- The Complete Playbook

**For:** Cody Boring / Boring Works
**Date:** 2026-02-24 (updated with external AI research synthesis)
**Platform:** BoringBuilder (fork of Cloudflare VibeSDK)
**Deploy:** boringbuilder.codyboring.workers.dev / getboring.io

---

## What This Document Is

Everything you need to know about VibeSDK to run it, extend it, and exploit it. Based on a full source code audit of 88+ agent files, 80+ frontend components, the SDK package, the template system, 80+ community/web sources, and cross-referenced against independent analyses from multiple AI systems.

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

### Typical Phase Breakdown

Most generated apps follow this phase pattern:
1. **Project Setup** -- package.json, configs, wrangler.jsonc
2. **Core Components** -- shared UI, layouts, base components
3. **Pages & Routing** -- route structure, page components
4. **Styling & UI** -- Tailwind theming, responsive layout
5. **API Integration** -- data fetching, server communication

Each phase emits telemetry and file updates in real-time. The phase timeline is a first-class UI element the user watches progress through.

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

**BYOK (Bring Your Own Key):** Users can provide their own API keys for OpenAI, Anthropic, or Google Gemini. The vault system stores these encrypted client-side. The agent requests vault unlock via WebSocket when it needs a key. This enables:
- Users paying for their own LLM usage
- Provider flexibility per user
- Cost optimization (route cheap tasks to cheap providers, hard tasks to expensive ones)

### The WebSocket Protocol

10+ message types power the real-time communication:

**Client -> Server:** `chat.message`, `file.update`, `apply.edits`, `error`
**Server -> Client:** `chat.response`, `file.create`, `file.delete`, `phase.change`, `preview.update`, `error`, `ping`/`pong`

Key patterns:
- Session persistence: reconnecting clients get full state restoration via `agent_connected` message
- Message deduplication: tool execution causes duplicate AI messages; both backend and frontend deduplicate
- Custom protocol extensions are supported for adding analytics, presence, etc.

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

### Container Instance Types

The sandbox runs in Cloudflare Containers with configurable specs:

| Type | vCPU | Memory | Use Case |
|------|------|--------|----------|
| `lite` | 1/16 | 256 MiB | Dev/testing |
| `standard-1` | 1/2 | 4 GiB | Light workloads |
| `standard-2` | 1 | 8 GiB | Standard apps |
| `standard-3` | 2 | 12 GiB | Default (recommended) |
| `standard-4` | 4 | 12 GiB | High-performance |
| Custom object | Any | Any | `{ vcpu, memory_mib, disk_mb }` |

BoringBuilder currently runs a custom spec: 4 vCPU, 12 GiB memory, 10 GB disk.

---

## Part 2: The Template System

### How Templates Work

Templates live in a separate GitHub repo and are deployed to an R2 bucket as zip files.

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
- `.important_files.json` (files the AI should read for context)
- `.donttouch_files.json` (files the AI must not modify)
- `.redacted_files.json` (files hidden from AI context to save tokens)

### The Overlay Pattern (Advanced)

Templates support a reference + overlay model:
- **Base reference** (read-only) provides the foundation
- **Overlay** contains customizations that deep-merge on top
- `package.json` uses deep merge strategy (add/remove dependencies)
- Exclude patterns prevent certain files from being included
- Template variables with types: `projectName: { type: string, required: true }`
- Overlays can be stacked: base -> industry -> client-specific

This is powerful for maintaining 1 base template + N overlays instead of N full templates. Change the base, all variants update.

### Custom Templates

Your `TEMPLATES_REPOSITORY` now points to `https://github.com/Boring-Works/vibesdk-templates` (forked). You can:
1. Add your own templates following the structure
2. Push to the fork
3. Run the deploy script to push to R2
4. Templates appear immediately in the AI's selection catalog

### Template YAML Definition (For Custom Templates)

```yaml
name: "my-template"
extends: vite-cfagents-runner

packageJson:
  dependencies:
    add:
      - package: lodash
        version: ^4.17.21
    remove:
      - old-dependency
  scripts:
    add:
      test: vitest

files:
  exclude:
    - src/components/OldComponent.tsx
  add:
    - path: src/components/NewFeature.tsx
      template: new-feature.tsx.hbs
    - path: .github/workflows/ci.yml
      content: |
        # CI workflow YAML

variables:
  projectName:
    type: string
    required: true
    prompt: "What is your project name?"
```

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

### Image-to-Code Prompts

The SDK supports multimodal prompts -- upload a design mockup and get matching code:

```typescript
const session = await client.build({
  prompt: [
    { type: 'text', content: 'Recreate this UI exactly:' },
    { type: 'image', source: { type: 'base64', data: screenshotBase64 } }
  ]
});
```

Supported formats: JPEG, PNG, WebP, GIF. This is a massive shortcut for design-to-code workflows.

### GitHub Export

Generated apps can be exported directly to GitHub:

```typescript
await session.export({
  format: 'github',
  repo: 'username/new-repo',
  private: true,
  createPR: true,
  prTitle: 'Initial commit from BoringBuilder',
  branch: 'generated'
});
```

### Debug Mode

Enable verbose logging for development and troubleshooting:

```typescript
const session = await client.build('...', {
  debug: {
    logWebSocket: true,   // Raw WebSocket message inspection
    logPrompts: true,     // See exact prompts sent to LLMs
    logTokens: true,      // Token counting per call
    saveToFile: './debug-session.json'  // Full session replay
  }
});
```

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

### The ChatWrapper (779 Lines, Repurposable)

The chat component is a comprehensive state machine, not just a chat box. Key properties:
- `messages`, `input`, `isLoading`, `append`, `reload`, `stop`, `data`, `error`
- Session persistence via `id: 'session-123'` enables cross-reload state recovery
- Custom `data` channel for streaming arbitrary values alongside chat
- Can be repurposed as a command interface, progress dashboard, or form wizard

### What You Can Build Without the Chat

1. **Preview-only embedding** -- Just use PreviewIframe with a URL
2. **Code viewer widget** -- FileExplorer + MonacoEditor, no chat needed
3. **Headless build pipeline** -- SDK only, no frontend at all
4. **Custom chat UI** -- Use the WebSocket protocol directly
5. **App gallery** -- Use the apps API (`listPublic`, `getAppDetails`)
6. **Conversational command interface** -- ChatWrapper as natural language shell for any backend

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

### AI Arbitrage Opportunity

Since VibeSDK supports BYOK and multi-model routing, you can optimize costs per operation:

| Provider | Cost/1M input tokens | Best for |
|----------|---------------------|----------|
| Gemini Flash | ~$0.10 | Code implementation, classification |
| GPT-4o Mini | ~$0.15 | Quick conversational responses |
| Gemini Pro | ~$0.50 | Blueprint generation |
| Claude Sonnet | ~$3.00 | Complex debugging, analysis |

**Strategy:** Route each operation to the cheapest provider that meets quality requirements. Template selection and code gen use Gemini Flash. Only blueprint and deep debugging use expensive models. This is how you get $0.05/generation instead of $5.00.

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

**Competitive edge vs. alternatives:**

| Feature | BoringBuilder | Vercel v0 | GitHub Copilot | Bolt.new |
|---------|--------------|-----------|----------------|----------|
| Real-time preview | Yes | No | No | Yes |
| Sandboxed execution | Yes | No | No | Yes |
| BYOK (multi-provider) | Yes | No | No | No |
| Phase timeline | Yes | No | No | No |
| Git clone export | Yes | Limited | No | No |
| Self-hosted option | Yes | No | No | No |
| White-label capable | Yes | No | No | No |

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
1. Templates repo already forked to `Boring-Works/vibesdk-templates`
2. Create templates with pre-built components for each vertical
3. Use the overlay pattern: one base + industry overlays = maintainable at scale
4. Include `.important_files.json` guiding the AI on the domain
5. Deploy to your R2 bucket
6. Charge premium for industry packs

**Template inheritance strategy:** Maintain 1 base + 10 overlays instead of 10 full templates. When you improve the base, all verticals improve automatically.

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

**Image-to-code variant:** Upload a design mockup per client and generate matching implementations:
```typescript
const session = await client.build({
  prompt: [
    { type: 'text', content: `Build ${client.name}'s website matching this design:` },
    { type: 'image', source: { type: 'base64', data: client.mockupBase64 } }
  ]
});
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

**Why it's unfair:** Most AI builders make static websites. VibeSDK can build apps that USE AI -- chatbots, document processors, data analyzers. It's AI building AI tools.

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

## Part 7: Advanced Patterns & Techniques

### The Phase System as a Universal Progress Tracker

The phase timeline isn't just for code generation. It can be adapted for ANY multi-step process:

```typescript
// Example: Data pipeline with phase-style progress
const phases = [
  { id: 'extract', name: 'Extracting Data', status: 'pending' },
  { id: 'transform', name: 'Transforming', status: 'pending' },
  { id: 'load', name: 'Loading to Warehouse', status: 'pending' },
  { id: 'validate', name: 'Validating Results', status: 'pending' }
];
```

Each phase broadcasts real-time progress via WebSocket. The same UI that shows "Building Phase 3/5" can show "Processing Step 3/5" for video rendering, ML training, ETL jobs -- anything with sequential stages.

### Chat-as-Interface Pattern

The ChatWrapper can be repurposed as a natural language command interface for any application:

```typescript
// Intent routing: parse natural language into structured actions
const intents = [
  { pattern: /show (.*) sales (?:for|in)? (.*)/i, handler: 'showSales' },
  { pattern: /export (.*) to (csv|json|pdf)/i, handler: 'exportData' },
  { pattern: /schedule (.*) for (tomorrow|next week|.*)/i, handler: 'scheduleTask' }
];
```

Instead of building traditional forms and dashboards, give users a chat box that routes to your backend. Rich message components (charts, tables, forms, confirmations) render inline in the chat.

### Sandbox-as-a-Service

The container sandbox can execute arbitrary user code safely:

| Profile | Container | Timeout | Use Case |
|---------|-----------|---------|----------|
| Quick script | lite | 5s | JS validation, formatting |
| Plugin runner | standard-1 | 30s | User plugins, webhooks |
| Automation | standard-2 | 60s | Workflow automation |
| Data processing | standard-4 | 300s | Heavy compute |

Key safety features:
- Domain-whitelisted `fetch` (restrict which APIs user code can call)
- Captured `console` for output logging
- Timeout enforcement per profile
- Isolated filesystem per session

### Build Pipeline as Content Generator

The code generation pipeline isn't limited to apps. Repurpose it for:
- **Documentation** from descriptions
- **Test suites** from API specs
- **Email templates** from briefs
- **Landing pages** from product descriptions
- **Database schemas** from natural language

The same blueprint -> phase -> implementation flow works for any structured content.

### Structured Intake Form (Replace the Free-Text Box)

The default "What should we build today?" single textbox is fine for developers but terrible for non-technical users. Replace it with a structured form that captures exact intent:

**Multi-step wizard approach:**
1. **Project Type** -- checkboxes/chips: Marketing Website, Real Estate Platform, Campaign Tool, Copy Studio, Dashboard, etc.
2. **Features & Requirements** -- dynamic checkbox grid that populates based on project type (e.g. Real Estate shows: MLS import, virtual tour, mortgage calculator, lead forms)
3. **Design & Branding** -- color pickers, logo upload, reference images, tone-of-voice selector (Warm, Urgent, Professional, Playful)
4. **Extra Context** -- file uploads (brand guidelines, existing assets), special instructions, target audience

The form compiles all selections into an optimized prompt that produces dramatically better first-generation results. Non-technical users get 3-5x improvement in output quality because the AI gets structured intent instead of vague descriptions.

**Implementation path:** Build this as a React component that replaces the home screen, or build it as a standalone app using VibeSDK itself (meta: vibe the tool that improves vibing).

### Cheap Model Strategy (Verified Provider Support)

VibeSDK's codebase natively supports these platform providers (verified in `worker/api/controllers/modelConfig/byokHelper.ts`):

| Provider | Platform Key | BYOK Key | Notes |
|----------|-------------|----------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY_BYOK` | Claude models |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_API_KEY_BYOK` | GPT models |
| Google AI Studio | `GOOGLE_AI_STUDIO_API_KEY` | `GOOGLE_AI_STUDIO_API_KEY_BYOK` | Gemini models |
| Groq | `GROQ_API_KEY` | -- | Fast inference |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_API_KEY_BYOK` | High-performance (models commented out) |
| OpenRouter | `OPENROUTER_API_KEY` | -- | Gateway to 100+ models (DeepSeek, Kimi, Qwen, etc.) |

**The cheap strategy:** Use OpenRouter to access DeepSeek-V3/R1 (~$0.14-0.27/M tokens) for 90% of operations. Only route blueprint generation and deep debugging to expensive models. Configure in `worker/agents/inferutils/config.ts`.

**Additional BYOK secrets** users can store: Stripe keys, GitHub token, Vercel token, Supabase URL/key (all defined in `worker/types/secretsTemplates.ts`).

### Non-Coding Use Cases (The Meta-Play)

VibeSDK's real power for non-developers isn't "writing text" -- it's **building interactive tools that generate, host, and deploy content at scale**. The reframe: "I need marketing copy" becomes "I now own a professional marketing copy studio."

**Marketing Copy Studio:** Vibe an app with product description input, tabs for Hero/Email/Social/Ad variants, live preview pane rendering copy in actual Tailwind layouts, A/B test export. The agent writes sample copy during generation, then you iterate via chat.

**Press Release Generator:** Form inputs (company, headline, key points, quotes) with professional newspaper-style preview, format variations (formal/casual/viral), PDF/Word export, SEO meta generator.

**Political Campaign Command Center:** Self-hosted for privacy. Candidate profile + slogan generator, volunteer signup with map, donation flow, policy cards with social graphics generator, press section. Deploy in under 10 minutes, iterate live with campaign manager, deploy to custom domain. No dev team, no data leaks.

**Real Estate Marketing Site:** Luxury hero, interactive map with listings, property detail modals, AI description generator for new listings, lead capture, mortgage calculator, brochure PDF generator. Use the SDK to batch-generate one per listing.

**Prompt Engineering Playground:** Prompt input with variables, live test against multiple models via AI Gateway, scorecards (clarity, specificity, chain-of-thought), version history, A/B comparison, "Optimize" button that rewrites using meta-prompting. A tool that makes every other LLM better.

**The pattern:** Don't use VibeSDK to write content directly. Use it to build the *tool* that generates and manages that content. The tool persists, scales, and can be given to a team.

---

## Part 8: Google Jules SDK Integration Opportunities

### What Jules Adds to the Stack

Google Jules is an autonomous coding agent with its own SDK. Where VibeSDK generates apps interactively, Jules executes coding tasks autonomously against GitHub repos. They complement each other:

| VibeSDK Strength | Jules Strength | Combined |
|-----------------|----------------|----------|
| Real-time interactive generation | Autonomous background execution | 24-hour dev cycle |
| Live preview in browser | Full VM with git/npm/test | Prototype then harden |
| Chat-driven iteration | Plan-first autonomous execution | Design then delegate |
| Template-based scaffolding | Code modification across repos | Generate then maintain |

### The Day-Night Development Cycle

**Day (VibeSDK):** Interactive prototyping, stakeholder collaboration, design iteration
**Night (Jules):** Autonomous test generation, security scanning, documentation updates, code refactoring
**Morning:** Review Jules-generated PRs, merge, deploy

### Jules Fleet Processing

Jules can process multiple repos simultaneously:

```typescript
await jules.all(repos, async (repo) => {
  return jules.run({
    github: repo.full_name,
    goal: 'Security audit: find and fix SQL injection, XSS, hardcoded secrets',
    config: { mode: 'automated', max_iterations: 50 }
  });
}, { concurrency: 10, stopOnError: false });
```

Use cases for BoringBuilder:
- **Security scanning** across all generated apps
- **Dependency updates** across template repos
- **Test generation** for generated code
- **Documentation sync** when templates change

### Jules Session Archaeology

Jules caches session history locally with a three-tier system:
- **Frozen** (>30 days): Zero API calls, instant retrieval
- **Warm** (<24h, verified): One API call to check freshness
- **Hot** (active): Real-time streaming

Mine past sessions to improve future prompts:

```typescript
// Find patterns from successful sessions
const patterns = await jules.select({
  from: 'sessions',
  where: { status: 'completed', success_rate: { $gt: 0.9 } }
});

// Use patterns to enhance new VibeSDK templates
const template = createTemplateFromPatterns(patterns);
```

Your AI gets smarter with every session. Competitors start blind each time.

### Jules MCP Tools (Available Now)

Jules exposes these via MCP -- usable from any MCP-compatible client:
- `create_session` -- Start autonomous coding task
- `get_session_state` -- Dashboard view of progress
- `send_reply_to_session` -- Guide execution mid-flow
- `query_cache` -- JQL queries against local session cache
- `get_code_review_context` -- Structured PR analysis
- `show_code_diff` -- Formatted unified diffs
- `get_bash_outputs` -- Extract command execution results

---

## Part 9: Remaining Fix List

Items still pending from the review:

| Item | Status | Priority |
|------|--------|----------|
| TEMPLATES_REPOSITORY points to Cloudflare's repo | FIXED -- forked to Boring-Works/vibesdk-templates | DONE |
| Rate limiter namespace IDs 2101/2102 | FIXED -- migrated from unsafe to GA ratelimits config | DONE |
| Sandbox container not starting for some sessions | Infrastructure issue | MONITOR -- Cloudflare Containers beta |
| HKDF info string `vibesdk-vault-vmk` | Intentionally kept -- changing breaks existing vaults | CLOSED |
| Rotate exposed secrets from chat history | Not done | HIGH -- API token and keys were in plain text |
| SandboxDockerfile rebrand | Changed but not rebuilt | LOW -- cosmetic only, defer |

---

## Part 10: Pro Tips & Gotchas

### What Works Well

1. **Debug mode** (`debug.logWebSocket`) -- enable it to understand message flow during development
2. **Image prompts** -- uploading design mockups dramatically improves output quality
3. **Template overlays** -- create 5 overlays instead of 5 full templates, maintain one base
4. **Container sizing** -- use `lite` for dev/test, `standard-3`+ for production previews
5. **Phase timeline streaming** -- subscribe to phase events for real-time progress UIs
6. **The `.important_files.json`** -- this is how you steer the AI toward domain-specific patterns. Invest time here.

### Known Gotchas

1. **WebSocket reconnection** -- the auto-reconnect buffer can lose messages during network blips. Subscribe to `onMessage` handler, not raw WebSocket events
2. **Template deep merge** -- smart but can cause unexpected property inheritance across overlay layers. Test overlay combinations.
3. **Container timeouts** -- jobs exceeding the timeout get hard-killed with no graceful degradation. Size timeouts generously.
4. **`cn()` utility** -- the AI frequently generates code using `cn()` (clsx/tailwind-merge) without importing it. This is the most common lint failure. Consider adding it to template base files.
5. **Sandbox provisioning** -- Cloudflare Containers is still beta. Containers occasionally fail to start for individual sessions. Not fixable from application code.
6. **Token limits** -- large blueprints can exceed context windows. The system handles this with chunking, but very complex apps may lose context between phases.
7. **Session isolation** -- each Durable Object instance is single-threaded. Heavy sessions don't affect others, but a single session can't parallelize internally.

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
| External AI analyses | `~/CodyML/VibeSDK & Google Jules Analysis/` |

---

*Compiled from 4 parallel deep research agents analyzing: core architecture (88+ agent files), template system, community sources (80+ URLs), frontend (80+ components), and cross-referenced against independent analyses from multiple AI systems covering VibeSDK and Google Jules SDK.*
