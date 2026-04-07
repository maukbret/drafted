# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mauk.AI** transforms Figma email designs into Klaviyo email campaign drafts. It's a full-stack SaaS app with team collaboration, Stripe billing, and AI-powered analytics.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
npm start        # Start production server
```

No test framework is configured.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL) with Row-Level Security throughout
- **Auth**: Supabase Auth (email/password) + OAuth for Figma (PKCE) and Klaviyo (PKCE)
- **UI**: Radix UI primitives + shadcn/ui pattern, Tailwind CSS, Lucide icons
- **Payments**: Stripe subscriptions
- **AI**: Anthropic Claude / Google Gemini (pluggable via `src/lib/ai/index.ts`)
- **External APIs**: Figma API, Klaviyo API

## Architecture

### Routing & Auth Flow

`src/middleware.ts` enforces the auth/onboarding/billing flow:
- Unauthenticated → `/login`
- No onboarding → `/onboarding`
- No subscription (and not a team member) → `/billing`
- Feature flags gate Reports and Product Feed access

Authenticated pages live under `src/app/(app)/` (route group with sidebar layout).

### Supabase Clients

Three client types in `src/lib/supabase/`:
- `client.ts` — browser-side client (uses `createBrowserClient`)
- `server.ts` — server component/action client (uses cookies, respects RLS)
- `service.ts` — service role client (bypasses RLS, for admin/webhook operations)

Every API route authenticates via `supabase.auth.getUser()` at the top.

### API Route Patterns

Routes are in `src/app/api/`. Standard REST convention: GET (list/fetch), POST (create), PATCH (update), DELETE.

The campaign send route (`/api/campaigns/[id]/send`) uses `ReadableStream` to stream real-time progress updates as JSON lines to the client.

### Campaign Wizard

The core workflow is a 4-step wizard in `src/components/campaign-wizard/`:
1. **Import** (`step-1-import.tsx`) — Figma URL + single-frame extract for slicing
2. **Slice & links** (`email-slicer.tsx`) — cut the email image, set links per section, optional Klaviyo hybrid block
3. **Settings** (`step-3-settings.tsx`) — audience, scheduling, footer config
4. **Export** (`step-4-export.tsx`) — final export to Klaviyo

Orchestrated by `index.tsx` which manages step state and campaign data.

### Klaviyo Integration

`src/lib/klaviyo.ts` handles OAuth token management with automatic refresh and race-condition safety. All Klaviyo API calls go through this module which manages token lifecycle.

### Feature Flags

`src/lib/feature-access.ts` — environment-variable-based feature gating:
- `FEATURE_*_ENABLED=true` enables for all users
- `FEATURE_*_ALLOWED_USER_IDS` enables for specific UUIDs (comma-separated)
- Features: `REPORTS`, `ANALYTICS`

### Realtime

Custom hooks in `src/hooks/` use Supabase Postgres Changes subscriptions for live data sync (campaigns, team members) with debouncing.

### Database

48 migration files in `supabase/migrations/`. Key tables: `profiles`, `teams`, `team_members`, `klaviyo_connections`, `figma_connections`, `campaigns`, `projects`, `frames`, `subscriptions`, `klaviyo_footers`, `analytics_reports`.

All tables use RLS policies — team members inherit the admin's Klaviyo connections.

## Conventions

- **Path alias**: Always use `@/` for imports (maps to `src/`)
- **UI components**: `src/components/ui/` follows shadcn/ui pattern (Radix + CVA + Tailwind)
- **Custom CSS classes**: `.black-button`, `.grey-button`, `.red-button`, `.shadow-sm-custom`, `.status-badge` (defined in `globals.css`)
- **Styling**: Tailwind with HSL CSS variable theme; dark mode via `dark` class
