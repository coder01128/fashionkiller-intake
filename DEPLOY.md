# FashionKiller Intake — Deployment Guide

## What you're deploying

A single-page web app (the same HTML Dommie is already using) backed by:
- **Supabase** for data storage + image hosting + auth
- **Vercel** for hosting the app at a real URL

After deployment: Dommie opens a URL, logs in with her email, and all her product data syncs across devices. App updates never delete her data.

---

## Step 1: Create Supabase project (5 min)

1. Go to [supabase.com](https://supabase.com) → Sign in with GitHub
2. Click **New Project**
   - Name: `fashionkiller-intake`
   - Database password: something strong (save it)
   - Region: pick the closest to SA (eu-west works)
3. Wait ~2 min for project to spin up

### Run the database migration

4. In your Supabase dashboard → **SQL Editor**
5. Click **+ New query**
6. Copy-paste the ENTIRE contents of `supabase/migrations/001_initial.sql`
7. Click **Run** → should say "Success. No rows returned" (that's correct)

### Get your API credentials

8. Go to **Settings → API**
9. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Enable email auth

10. Go to **Authentication → Providers**
11. Make sure **Email** is enabled
12. Under **Email Auth**: disable "Confirm email" for now (simpler for Dommie — she's the only user)

---

## Step 2: Configure the app (2 min)

Open `src/supabase-config.js` and replace:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...YOUR_ANON_KEY...';
```

---

## Step 3: Deploy to Vercel (3 min)

### Option A: Vercel CLI (if you have it)

```bash
cd fashionkiller-intake
npx vercel --prod
```

### Option B: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. Push this repo to GitHub:
   ```bash
   cd fashionkiller-intake
   git init
   git add .
   git commit -m "Initial deploy"
   gh repo create fashionkiller-intake --public --push
   ```
3. In Vercel → **Import Project** → select `fashionkiller-intake`
4. Deploy settings will auto-detect from `vercel.json`
5. Click **Deploy**

Your app will be live at: `https://fashionkiller-intake.vercel.app`

### Custom domain (optional)

If you want `intake.fashionkiller.co.za`:
1. In Vercel → Project Settings → Domains
2. Add `intake.fashionkiller.co.za`
3. Add a CNAME record in your DNS: `intake` → `cname.vercel-dns.com`

---

## Step 4: Import Dommie's existing data (5 min)

When the hosted version is live:
1. Dommie opens the new URL
2. Signs in with her email
3. Uses **Settings → Restore from backup** to upload her `.zip` backup from the standalone version
4. Data loads into cloud storage — synced permanently

---

## Architecture overview

```
Browser (Dommie's laptop/phone)
  ├── IndexedDB (local cache — fast, works offline)
  └── Supabase (cloud sync)
        ├── PostgreSQL: products, settings, profiles
        ├── Storage: product images (JPEG, compressed)
        └── Auth: email magic link login
```

- App always works offline (IndexedDB first)
- When online: auto-syncs to Supabase in background
- Multiple devices: changes sync within seconds
- App updates: we update the HTML on Vercel; her data stays in Supabase untouched
- Backup: still available as a safety net, but no longer critical
```
