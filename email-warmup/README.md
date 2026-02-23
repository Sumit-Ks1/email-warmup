# Email Warm-Up Automation Platform

Production-grade, fully dockerized email warm-up platform for custom domain mailboxes.

## Architecture

| Service | Technology | Port |
|---------|-----------|------|
| Frontend | Next.js 14 (App Router, TypeScript) | 3000 |
| Backend | Express.js (TypeScript) | 4000 |
| Database | PostgreSQL (Supabase self-hosted) | 5432 |
| AI | Groq API (LLaMA 3.3 70B) | - |

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your credentials

# 2. Start all services
docker-compose up --build -d

# 3. Access
# Frontend: http://localhost:3000
# Backend API: http://localhost:4000/api
```

## Features

- Multi-mailbox warm-up for custom domains
- Sequential send-wait-reply flow with IMAP IDLE
- AI-generated unique emails via Groq
- Human-like timing with random delays
- Pause/Resume/Stop controls
- Real-time session progress tracking
- Encrypted credential storage
- Full email threading (Message-ID / In-Reply-To)

## Project Structure

```
warmUp/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── db/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── types/
│   └── package.json
└── supabase/
    ├── Dockerfile
    └── schema.sql
```
