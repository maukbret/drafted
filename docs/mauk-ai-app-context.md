# Mauk.ai — Product & Technical Context for AI Assistants

Use this document as **persistent context** when building prompts, specs, or code around Mauk.ai. It describes what the product is, who it serves, how the workflow works, and how the app is structured in this repository.

---

## Elevator pitch

**Mauk.ai** turns **Figma email designs** into **Klaviyo email campaign drafts** (and sends/schedules them). Teams authenticate once, connect Figma and Klaviyo, slice a frame into linked images, configure send settings, and export—without manually rebuilding the email in Klaviyo’s builder.

**Tagline (from app metadata):** “Transform Figma designs into Klaviyo email drafts.”

---

## Who this is for

- **E-commerce and DTC brands** that design marketing emails in **Figma** and deploy through **Klaviyo**.
- **Agencies and email producers** who need a repeatable handoff from design tools to ESP-ready campaigns.
- **Teams** where a **billing admin** subscribes while **members** collaborate using shared Klaviyo connections (see [Teams & billing](#teams--billing)).

---

## Problem it solves

- **Design-to-ESP gap:** Recreating pixel-perfect or section-based layouts in Klaviyo from Figma is slow and error-prone.
- **Link management:** Turning static comps into correct clickable regions across many slices is tedious.
- **Operational friction:** Subject lines, preview text, audiences, scheduling, and footers need to stay consistent with the design and account setup.

Mauk.ai **extracts the frame from Figma**, lets you **define slices and URLs**, optionally reserves a **hybrid drag-and-drop region** in Klaviyo for product feeds or extra blocks, generates **table-based campaign HTML**, and **creates/updates Klaviyo campaigns** with streaming progress feedback.

---

## Why use Mauk.ai (differentiators)

- **Figma-native input:** Work stays in the design file; import via frame URL and re-sync when the design changes (“replace design,” “refresh from Figma”).
- **Purpose-built Klaviyo path:** OAuth to Klaviyo, audience selection, scheduling, UTMs, footer handling, and campaign/template creation are first-class—not a generic “export HTML” tool.
- **Hybrid email pattern:** Optional **Klaviyo hybrid block** between image slices and footer so marketers can add product feeds or DnD content **in Klaviyo** after export.
- **AI-assisted copy (where enabled):** Subject line and preview text can be **suggested from text extracted from the Figma frame**, with guardrails in prompts (grounded in copy, length limits, no invented offers).
- **Analytics reports (gated):** Pull Klaviyo performance into **reports** with charts and optional **AI insights** (feature access is controlled by environment; see [Feature flags](#feature-flags)).
- **Teams & shared connections:** Team members can use the admin’s Klaviyo setup; **invited members skip solo billing** when the product gate is satisfied by membership.
- **Realtime collaboration:** Supabase realtime is used for live updates (e.g. campaigns, team data) via hooks in the codebase.

---

## How it works (user journey)

### Access & onboarding

1. **Sign up / log in** (Supabase Auth: email/password; OAuth for Figma and Klaviyo with PKCE).
2. **Onboarding steps:** profile → **plan selection (Stripe)** → connect **Figma** → connect **Klaviyo**.
3. **Middleware-gated app:** Unauthenticated users go to `/login`. Users must complete onboarding. Users without an active subscription are sent to **billing** unless they are **team members** of a subscribed admin (see middleware + `profiles` / `subscriptions` / `team_members`).

Public routes include `/legal/*`, `/invite/*`, and auth callback paths.

### Core campaign workflow (wizard)

Campaigns are created from the **Campaigns** experience (e.g. quick start with a Figma URL). The wizard is roughly:

| Phase | What the user does |
|--------|---------------------|
| **1. Import** | Paste a **Figma frame URL**; the app processes the design (images/frames stored on the project). |
| **2. Slice & links** | **Cut the email image** into slices, assign **link URLs** per region, optional **Klaviyo hybrid DnD slot** for content between hero/footer. |
| **3. Send settings** | **Audiences** (include/exclude), **schedule** (with optional recipient timezone), **subject line** & **preview/preheader text** (manual or AI-suggested), **UTM** settings, footer configuration, etc. |
| **4. Export** | Push to Klaviyo as **draft or live send**; the send API can **stream JSON-lines progress** so the UI shows real-time status. |

**Resume & edit:** Campaigns support returning to a saved `wizard_step`. Users can **replace design** from Figma (dialog reusing import) or **refresh from Figma** so slices match an updated file.

### After export

- Campaigns may be linked to Klaviyo **template/campaign** identifiers stored on the campaign row for **updates** vs first-time creation.

### Connections & team

- **`/connections`:** Manage **Figma** and **Klaviyo** OAuth connections.
- **`/team`:** Invite and manage **team members**; Klaviyo connections can be inherited per RLS/data model patterns (team admin’s connections visible to members).

### Reports (feature-gated)

- **`/reports`:** Klaviyo analytics surfaced as **reports** (revenue, campaigns, flows, list growth, account overview charts, etc.).
- Reports can include **AI-generated summaries/insights** and **PDF export** (implementation lives under report components and `report-pdf`).

### Admin

- **`/admin`:** Restricted to users listed in `ADMIN_USER_IDS` (see environment variables).

---

## Major features (checklist for AI context)

- [x] Figma frame import & re-import / resync
- [x] Visual email slicer with per-slice links
- [x] Optional Klaviyo hybrid DnD region (product feeds / extra blocks in Klaviyo)
- [x] Klaviyo OAuth with **token refresh** and race-safe token handling
- [x] Audience targeting, scheduling, UTMs, footers
- [x] Subject + preview text with optional **AI** suggestions from Figma text
- [x] Streaming campaign send/export progress
- [x] Stripe **subscriptions** and billing page
- [x] **Teams**, invites, shared-connection model
- [x] **Reports** with analytics + AI (access gated)
- [x] Row-level security on Supabase throughout
- [x] Feature flags for phased rollouts (reports)

---

## Technical stack (repo facts)

| Layer | Choice |
|--------|--------|
| Framework | **Next.js 16** (App Router), **React 19**, **TypeScript** (strict) |
| Database / auth | **Supabase** (PostgreSQL + RLS + Auth) |
| UI | **Radix** + **shadcn-style** components, **Tailwind**, **Lucide** |
| Payments | **Stripe** subscriptions |
| AI | **Anthropic Claude** / **Google Gemini** (pluggable via `src/lib/ai/`) |
| Integrations | **Figma API**, **Klaviyo API** |

**Important paths:**

- App routes: `src/app/` — authenticated shell under `src/app/(app)/`
- API: `src/app/api/`
- Campaign wizard: `src/components/campaign-wizard/`
- Klaviyo client: `src/lib/klaviyo.ts`
- Feature access: `src/lib/feature-access.ts`
- Auth/middleware flow: `src/middleware.ts`
- Migrations: `supabase/migrations/`

**Conventions:** Prefer the `@/` path alias to `src/`.

---

## Feature flags

Controlled in **`src/lib/feature-access.ts`** (and environment variables):

- **`FEATURE_REPORTS_ENABLED`** — when truthy, Reports visible to all users.
- **`FEATURE_REPORTS_ALLOWED_USER_IDS`** — comma-separated Supabase user UUIDs when global flag is off.

**Admin allowlist:** `ADMIN_USER_IDS` for admin UI/API access.

The repository **README** also documents `FEATURE_ANALYTICS_*` variables; if present in deployment, treat them as environment-specific—**the TypeScript gate in `feature-access.ts` currently keys off `reports`** for the Reports product surface.

---

## Teams & billing (behavioral summary)

- **Solo users** complete onboarding, **select a plan**, and need an **active or trialing** Stripe subscription to use the app (middleware checks `subscriptions.status`).
- **Team members** (`team_members` row) **may use the app without their own subscription** when the profile gate would otherwise send a solo user to billing—shared Klaviyo access is modeled in the database/RLS.

---

## Data model (high level)

Tables include (non-exhaustive): `profiles`, `teams`, `team_members`, `klaviyo_connections`, `figma_connections`, `campaigns`, `projects`, `frames`, `subscriptions`, `klaviyo_footers`, `analytics_reports`, etc. All are protected by **RLS**.

---

## What this document is **not**

- It is not a legal or privacy policy; see `src/app/legal/` for published policies.
- It is not a substitute for `README.md` **local setup** steps (env files, Supabase URL config, Stripe webhooks, etc.)—use README + `CLAUDE.md` at repo root for developer onboarding.

---

## Suggested use in AI projects

- Paste or attach **`docs/mauk-ai-app-context.md`** (this file) to a project knowledge base or system prompt when you want the model to **propose features**, **write UX copy**, **name endpoints**, or **reason about Klaviyo/Figma workflows** consistently with Mauk.ai.
- For **implementation tasks**, pair this file with **`CLAUDE.md`** at the repository root for command-line and architecture conventions.

---

*Last updated to reflect the codebase as of the document’s creation date in-repo. Refresh sections when major features or flags change.*
