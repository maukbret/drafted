# Mauk.ai - Figma to Klaviyo

Transform Figma email designs into Klaviyo drafts.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

You'll need:
- **Supabase**: Project URL and keys from your Supabase dashboard (Settings > API)
- **Klaviyo**: Client ID and secret from https://www.klaviyo.com/manage-apps
- **Figma**: Personal access token from https://www.figma.com/developers/api#access-tokens
- **Anthropic**: `ANTHROPIC_API_KEY` from https://console.anthropic.com/ (optional override: `ANTHROPIC_MODEL`, default is `claude-sonnet-4-20250514`)

### 3. Set up the database

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Paste the contents of `supabase-schema.sql` and run it

### 4. Configure Supabase Auth

In your Supabase dashboard:
1. Go to Authentication > URL Configuration
2. Set Site URL to `http://localhost:3000`
3. Add `http://localhost:3000/api/auth/callback` to Redirect URLs

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Feature flags (private rollouts)

Use these env vars to ship code without showing it to everyone yet:

```bash
FEATURE_ANALYTICS_ENABLED=false
FEATURE_ANALYTICS_ALLOWED_USER_IDS=your-user-uuid,another-user-uuid

FEATURE_REPORTS_ENABLED=false
FEATURE_REPORTS_ALLOWED_USER_IDS=your-user-uuid,another-user-uuid
```

Rules:
- If `FEATURE_*_ENABLED=true`, that feature is visible to all users.
- If `FEATURE_*_ENABLED=false` (or unset), only users in `FEATURE_*_ALLOWED_USER_IDS` can see it.
- `FEATURE_*_ALLOWED_USER_IDS` is a comma-separated list of Supabase `auth.users.id` UUIDs.
- If `FEATURE_*_ALLOWED_USER_IDS` is not set at all, it falls back to the legacy owner allowlist in code.

How to update access:
1. Local: edit `.env.local`, then restart `npm run dev`.
2. Production (Vercel): update project environment variables, then redeploy.
3. Add/remove a user by editing the UUID list for that feature.

How to find user IDs:
- Supabase dashboard: Authentication -> Users -> copy `id`.
- Or SQL:

```sql
select id, email
from auth.users
order by created_at desc;
```

## Project structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   └── auth/          # Auth callbacks (Supabase + Klaviyo)
│   ├── dashboard/         # Main app interface
│   └── login/             # Authentication
├── components/            # React components
├── lib/                   # Utilities
│   └── supabase/         # Supabase client setup
└── types/                 # TypeScript types
```

## Next steps

After basic setup is working:
1. Complete the Figma processing API route
2. Build the frame editor UI
3. Add HTML email generation
4. Integrate with Klaviyo's template API
