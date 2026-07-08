-- ============================================================================
-- Email Warm-Up Platform — Supabase Cloud Schema
-- ============================================================================
-- Run this ONCE in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Security model:
--   * The Next.js server talks to the database exclusively with the
--     SERVICE ROLE key (which bypasses Row Level Security).
--   * RLS is ENABLED on every table with NO policies, and all privileges are
--     revoked from the public API roles (anon / authenticated). Even if the
--     anon key ever leaked, it cannot read or write a single row.
--   * SMTP/IMAP passwords are encrypted by the application (AES-256-GCM)
--     before they are stored — the database never sees plaintext credentials.
-- ============================================================================

-- Lift read-only mode for this session if the platform has it enabled.
-- (Fresh projects can sit in read-only briefly while provisioning, and
-- Supabase also flips it on for paused/over-quota projects — error 25006:
-- "cannot execute CREATE TABLE in a read-only transaction".)
set default_transaction_read_only = off;

-- ----------------------------------------------------------------------------
-- Domain accounts (the mailboxes being warmed up)
-- ----------------------------------------------------------------------------
create table if not exists public.domain_accounts (
    id uuid primary key default gen_random_uuid(),
    sender_name text not null,
    email text not null unique,
    smtp_host text not null,
    smtp_port integer not null default 587,
    smtp_secure boolean not null default true,
    smtp_password text not null, -- encrypted at application layer
    imap_host text not null,
    imap_port integer not null default 993,
    imap_secure boolean not null default true,
    imap_password text not null, -- encrypted at application layer
    status text not null default 'idle' check (status in ('idle', 'running', 'paused')),
    auto_warmup boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Lead accounts (the responder mailboxes, typically Gmail)
-- ----------------------------------------------------------------------------
create table if not exists public.lead_accounts (
    id uuid primary key default gen_random_uuid(),
    sender_name text not null,
    email text not null unique,
    smtp_host text not null default 'smtp.gmail.com',
    smtp_port integer not null default 587,
    smtp_secure boolean not null default true,
    smtp_password text not null, -- encrypted at application layer
    imap_host text not null default 'imap.gmail.com',
    imap_port integer not null default 993,
    imap_secure boolean not null default true,
    imap_password text not null, -- encrypted at application layer
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Warm-up sessions — the persisted state machine.
--
-- The engine is fully stateless: every step of a session is stored here and
-- advanced by the /api/cron/tick endpoint. Steps for the current lead:
--   send_intro  → generate + send the intro email (domain → lead)
--   await_intro → poll the lead's IMAP inbox until the intro arrives
--   send_reply  → after a human-like delay, send the lead's reply (lead → domain)
--   await_reply → poll the domain's IMAP inbox until the reply arrives,
--                 then advance to the next lead
-- ----------------------------------------------------------------------------
create table if not exists public.warmup_sessions (
    id uuid primary key default gen_random_uuid(),
    domain_account_id uuid not null references public.domain_accounts(id) on delete cascade,
    session_date date not null default (now() at time zone 'utc')::date,
    status text not null default 'in_progress'
        check (status in ('in_progress', 'paused', 'stopped', 'completed', 'failed')),
    step text not null default 'send_intro'
        check (step in ('send_intro', 'await_intro', 'send_reply', 'await_reply')),
    current_lead_index integer not null default 0,
    lead_ids uuid[] not null default '{}',        -- snapshot of the lead queue
    intro_message_id text,                        -- Message-ID of the intro email
    intro_subject text,
    intro_body text,
    reply_message_id text,
    next_action_at timestamptz not null default now(), -- when the tick should act next
    step_deadline_at timestamptz,                 -- give-up time for await_* steps
    step_attempts integer not null default 0,
    claimed_until timestamptz,                    -- worker lease (prevents double-processing)
    emails_sent integer not null default 0,
    replies_sent integer not null default 0,
    replies_received integer not null default 0,
    leads_skipped integer not null default 0,
    error_message text,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unique_session_per_day unique (domain_account_id, session_date)
);

-- ----------------------------------------------------------------------------
-- Mail logs — full audit trail of every email sent/received
-- ----------------------------------------------------------------------------
create table if not exists public.mail_logs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.warmup_sessions(id) on delete set null,
    from_email text not null,
    to_email text not null,
    subject text not null,
    body text,
    message_id text,
    in_reply_to text,
    direction text not null check (direction in ('sent', 'received', 'replied')),
    lead_index integer,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Rate limits — durable per-IP fixed-window counters shared by all
-- serverless instances (the in-memory limiter alone would reset per instance)
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limits (
    key text not null,
    window_start timestamptz not null,
    count integer not null default 0,
    primary key (key, window_start)
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_sessions_domain on public.warmup_sessions(domain_account_id);
create index if not exists idx_sessions_due on public.warmup_sessions(status, next_action_at);
create index if not exists idx_sessions_date on public.warmup_sessions(session_date);
create index if not exists idx_mail_logs_session on public.mail_logs(session_id);
create index if not exists idx_mail_logs_created on public.mail_logs(created_at desc);
create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_domain_accounts_updated on public.domain_accounts;
create trigger trg_domain_accounts_updated
    before update on public.domain_accounts
    for each row execute function public.set_updated_at();

drop trigger if exists trg_lead_accounts_updated on public.lead_accounts;
create trigger trg_lead_accounts_updated
    before update on public.lead_accounts
    for each row execute function public.set_updated_at();

drop trigger if exists trg_warmup_sessions_updated on public.warmup_sessions;
create trigger trg_warmup_sessions_updated
    before update on public.warmup_sessions
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RPC: durable per-IP rate limiting (atomic fixed-window counter)
-- ----------------------------------------------------------------------------
create or replace function public.hit_rate_limit(
    p_key text,
    p_limit integer,
    p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_window_start timestamptz :=
        to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
    v_count integer;
begin
    insert into rate_limits as rl (key, window_start, count)
    values (p_key, v_window_start, 1)
    on conflict (key, window_start)
    do update set count = rl.count + 1
    returning rl.count into v_count;

    -- Opportunistic cleanup of stale windows (~1% of calls)
    if random() < 0.01 then
        delete from rate_limits where window_start < now() - interval '1 day';
    end if;

    return jsonb_build_object(
        'allowed', v_count <= p_limit,
        'count', v_count,
        'retry_after',
        case
            when v_count <= p_limit then 0
            else greatest(1, ceil(extract(epoch from
                (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer)
        end
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: atomically claim due sessions for one tick run.
-- FOR UPDATE SKIP LOCKED + a lease column make overlapping ticks safe.
-- ----------------------------------------------------------------------------
create or replace function public.claim_due_sessions(
    p_limit integer default 6,
    p_lease_seconds integer default 120
)
returns setof public.warmup_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update warmup_sessions ws
    set claimed_until = now() + make_interval(secs => p_lease_seconds)
    where ws.id in (
        select s.id
        from warmup_sessions s
        where s.status = 'in_progress'
          and s.next_action_at <= now()
          and (s.claimed_until is null or s.claimed_until < now())
        order by s.next_action_at asc
        limit p_limit
        for update skip locked
    )
    returning ws.*;
end;
$$;

-- ----------------------------------------------------------------------------
-- LOCKDOWN: enable RLS everywhere with zero policies and strip the public
-- API roles of all privileges. Only the service role (used by the Next.js
-- server) can touch these tables.
-- ----------------------------------------------------------------------------
alter table public.domain_accounts enable row level security;
alter table public.lead_accounts enable row level security;
alter table public.warmup_sessions enable row level security;
alter table public.mail_logs enable row level security;
alter table public.rate_limits enable row level security;

revoke all on public.domain_accounts from anon, authenticated;
revoke all on public.lead_accounts from anon, authenticated;
revoke all on public.warmup_sessions from anon, authenticated;
revoke all on public.mail_logs from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

revoke execute on function public.hit_rate_limit(text, integer, integer) from anon, authenticated, public;
revoke execute on function public.claim_due_sessions(integer, integer) from anon, authenticated, public;
