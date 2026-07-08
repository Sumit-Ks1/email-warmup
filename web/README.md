# Email Warm-Up Platform

Warm up custom-domain mailboxes with automated, AI-generated conversations between your domain mailboxes and a pool of "lead" inboxes — building sender reputation so real outreach lands in the inbox, not spam.

**Stack (100% free tier, no Docker, no separate backend server):**

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 16 (App Router + Route Handlers) on **Vercel Hobby** |
| Database | **Supabase Cloud** (free plan) via service-role key, server-side only |
| Scheduler | Supabase **pg_cron + pg_net** calling `/api/cron/tick` every minute |
| AI copy | Groq (optional) with a built-in template fallback |
| Mail | Nodemailer (SMTP) + ImapFlow (IMAP polling) |

## How it works

Because Vercel functions are short-lived, the warm-up engine is a **stateless state machine stored in Postgres**. Every minute, pg_cron calls the secured `/api/cron/tick` endpoint, which advances each due session one small step:

```
send_intro   domain ──AI email──▶ lead            (SMTP)
await_intro  poll lead inbox until it arrives      (IMAP, 10 min timeout → skip lead)
send_reply   lead ──AI reply, threaded──▶ domain   (SMTP, after a random 3–5 min delay)
await_reply  poll domain inbox until it arrives    (IMAP) → next lead after 3–5 min
```

One session per domain mailbox per day; sessions are pause/resume/stop-able and survive deploys, cold starts, and crashes because no state ever lives in memory.

## Security model (public app, no login)

- **Browser never touches the database.** All data flows browser → `/api/*` route handlers → Supabase with the service-role key. No `NEXT_PUBLIC_*` variables exist.
- **RLS lockdown:** every table has Row Level Security enabled with zero policies, and all privileges are revoked from the `anon`/`authenticated` roles. A leaked anon key reads nothing.
- **Per-IP rate limiting**, two layers: in-memory (burst) + durable counters in Postgres shared across all serverless instances. Mutating endpoints fail *closed* if the limiter is unreachable.
- **Credentials encrypted at rest** with AES-256-GCM (`ENCRYPTION_KEY`); passwords are write-only — no API response ever contains them.
- **SSRF protection:** user-supplied mail hosts must resolve to public IPs only (cloud-metadata/private ranges blocked) and only mail ports 143/465/587/993/2525 are allowed.
- **Zod validation** on every input, 64 KB body cap, strict security headers + CSP, `/api/cron/tick` guarded by a constant-time `CRON_SECRET` check.

---

## Deployment (free, ~15 minutes)

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) → **New project** (free plan).
2. Open **SQL Editor** → paste the contents of [`../supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. Note down from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Generate secrets

```bash
openssl rand -hex 32   # → ENCRYPTION_KEY
openssl rand -hex 32   # → CRON_SECRET
```

(Any long random strings work — e.g. from a password manager.)

### 3. Deploy to Vercel

1. Push this repository to GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Set **Root Directory** to `web`.
4. Add the environment variables from [.env.example](.env.example):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `CRON_SECRET`, and optionally `GROQ_API_KEY`.
5. **Deploy.** Note your production URL, e.g. `https://my-warmup.vercel.app`.

> `vercel.json` registers a once-daily cron as a backstop; Vercel automatically calls it with your `CRON_SECRET` as the bearer token.

### 4. Turn on the minute-level scheduler

Vercel's free plan only allows daily crons, so the every-minute heartbeat comes from Supabase itself:

1. Open [`../supabase/setup-cron.sql`](../supabase/setup-cron.sql).
2. Replace `YOUR_APP_URL` with your Vercel URL and `YOUR_CRON_SECRET` with your secret.
3. Run it in the Supabase **SQL Editor**.

Verify: `select * from cron.job_run_details order by start_time desc limit 5;` should show runs, and `select status_code from net._http_response order by id desc limit 5;` should show `200`s.

*(Alternative: a free [cron-job.org](https://cron-job.org) job hitting `https://your-app/api/cron/tick` every minute with header `Authorization: Bearer <CRON_SECRET>` works identically.)*

### 5. Use it

1. **Lead Mailboxes** → add 3–10 responder inboxes (Gmail: enable 2FA → create an [App Password](https://myaccount.google.com/apppasswords), use it for both SMTP and IMAP).
2. **Domain Mailboxes** → add the mailboxes you want to warm up (use *Test connection* for both SMTP and IMAP before saving).
3. **Warm-Up Sessions** → select a mailbox → **Start warm-up** — or enable **Auto warm-up** on the account to run a session automatically every day.

---

## Local development

```bash
cd web
cp .env.example .env.local   # fill in your Supabase values
npm install
npm run dev                  # http://localhost:3000
```

To drive the engine locally, call the tick manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/tick
```

## Free-tier notes

- **Supabase free** pauses projects after ~1 week of inactivity — the minute-level tick traffic keeps it active automatically.
- **Vercel Hobby** function limits are respected: the tick time-boxes itself (~40 s work budget, `maxDuration: 60`) and processes at most 6 sessions per run, so any backlog simply continues next minute.
- Groq's free tier is optional; without a key the built-in randomized templates keep warm-ups running.

## Warm-up guidance

Start slow: 2–3 leads per domain for the first week, then grow. Ensure SPF, DKIM and DMARC records exist for your domain before warming — reputation building works dramatically better with authenticated mail.
