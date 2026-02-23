-- ====================================
-- Email Warm-Up Platform Schema
-- ====================================

-- ====================================
-- Domain Accounts (sender mailboxes)
-- ====================================
CREATE TABLE IF NOT EXISTS domain_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_secure BOOLEAN NOT NULL DEFAULT true,
    smtp_password TEXT NOT NULL, -- encrypted at application layer
    imap_host VARCHAR(255) NOT NULL,
    imap_port INTEGER NOT NULL DEFAULT 993,
    imap_secure BOOLEAN NOT NULL DEFAULT true,
    imap_password TEXT NOT NULL, -- encrypted at application layer
    status VARCHAR(20) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================
-- Lead Accounts (Gmail responders)
-- ====================================
CREATE TABLE IF NOT EXISTS lead_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_secure BOOLEAN NOT NULL DEFAULT true,
    smtp_password TEXT NOT NULL, -- encrypted at application layer (App Password)
    imap_host VARCHAR(255) NOT NULL DEFAULT 'imap.gmail.com',
    imap_port INTEGER NOT NULL DEFAULT 993,
    imap_secure BOOLEAN NOT NULL DEFAULT true,
    imap_password TEXT NOT NULL, -- encrypted at application layer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================
-- Warm-up Sessions
-- Tracks per-domain-account warm-up state
-- ====================================
CREATE TABLE IF NOT EXISTS warmup_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_account_id UUID NOT NULL REFERENCES domain_accounts(id) ON DELETE CASCADE,
    current_lead_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'waiting_reply', 'paused', 'completed', 'failed')),
    last_message_id VARCHAR(512),
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Only one active session per domain account per day
    CONSTRAINT unique_active_session UNIQUE (domain_account_id, session_date)
);

-- ====================================
-- Mail Logs
-- Full audit trail of all emails
-- ====================================
CREATE TABLE IF NOT EXISTS mail_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES warmup_sessions(id) ON DELETE SET NULL,
    from_email VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    message_id VARCHAR(512),
    in_reply_to VARCHAR(512),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('sent', 'received', 'replied')),
    lead_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================
-- Indexes for query performance
-- ====================================
CREATE INDEX IF NOT EXISTS idx_warmup_sessions_domain ON warmup_sessions(domain_account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_sessions_status ON warmup_sessions(status);
CREATE INDEX IF NOT EXISTS idx_warmup_sessions_date ON warmup_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_mail_logs_session ON mail_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_mail_logs_message_id ON mail_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_mail_logs_direction ON mail_logs(direction);
CREATE INDEX IF NOT EXISTS idx_mail_logs_from ON mail_logs(from_email);
CREATE INDEX IF NOT EXISTS idx_mail_logs_to ON mail_logs(to_email);

-- ====================================
-- Updated-at trigger function
-- ====================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_domain_accounts_updated_at
    BEFORE UPDATE ON domain_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_accounts_updated_at
    BEFORE UPDATE ON lead_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_warmup_sessions_updated_at
    BEFORE UPDATE ON warmup_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- Supabase roles setup
-- ====================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
