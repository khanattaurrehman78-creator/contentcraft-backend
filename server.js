# ContentCraft AI — Backend Setup Guide

## Step 1 — Supabase Database Setup

1. Go to: https://abwiarejyaadlissvedk.supabase.co
2. Click **SQL Editor** (left sidebar)
3. Copy everything from `database.sql`
4. Paste and click **Run**
5. You should see "Database setup complete!"

---

## Step 2 — Environment Variables

Create a `.env` file (copy from `.env.example`):

```
SUPABASE_URL=https://abwiarejyaadlissvedk.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_new_publishable_key
SUPABASE_SECRET_KEY=your_new_secret_key
ANTHROPIC_API_KEY=your_anthropic_key
JWT_SECRET=make_a_random_32_char_string_here
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-vercel-app.vercel.app
FREE_CREDITS=10
PRO_CREDITS=100
PRO_PRICE=29
```

---

## Step 3 — Deploy to Railway

1. Go to railway.app
2. Click **New Project** → **Deploy from GitHub**
3. Connect your GitHub and push this folder
4. In Railway project → **Variables** tab
5. Add ALL variables from your .env file
6. Railway will auto-deploy

Your backend URL will be: `https://contentcraft-backend.up.railway.app`

---

## Step 4 — Create Admin Account

After deploy, call this API once:

```bash
curl -X POST https://your-railway-url/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fname": "Admin",
    "lname": "User", 
    "email": "admin@contentcraft.ai",
    "password": "your_strong_password",
    "plan": "free"
  }'
```

Then in Supabase SQL Editor, run:
```sql
UPDATE public.users
SET role = 'admin', plan = 'admin', credits_limit = 999999
WHERE email = 'admin@contentcraft.ai';
```

---

## API Endpoints

### Auth
- POST `/api/auth/register` — Create account
- POST `/api/auth/login` — Login
- GET `/api/auth/me` — Get current user
- POST `/api/auth/logout` — Logout

### Generate (requires Bearer token)
- POST `/api/generate/article` — Write article (2 credits)
- POST `/api/generate/meta` — Meta tags (1 credit)
- POST `/api/generate/faq` — FAQ + Schema (2 credits)
- POST `/api/generate/humanize` — Humanize (2 credits, Pro only)
- POST `/api/generate/classify` — Keyword classifier (1 credit)
- POST `/api/generate/gap` — Content gap (1 credit)
- POST `/api/generate/cluster` — Topic cluster (2 credits)
- POST `/api/generate/snippet` — Snippet optimizer (1 credit)

### User (requires Bearer token)
- GET `/api/user/profile` — Get profile
- PUT `/api/user/profile` — Update profile
- GET `/api/user/history` — Content history
- GET `/api/user/stats` — Usage stats

### Admin (requires Bearer token + admin role)
- GET `/api/admin/users` — All users
- POST `/api/admin/users` — Add user
- PUT `/api/admin/users/:id/plan` — Change plan
- DELETE `/api/admin/users/:id` — Delete user
- POST `/api/admin/credits/grant` — Grant credits
- GET `/api/admin/credits/grants` — Grant log
- GET `/api/admin/analytics` — Analytics

---

## Local Development

```bash
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
```

Server runs on: http://localhost:3000
