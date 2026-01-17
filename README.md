# Figma to Klaviyo

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
