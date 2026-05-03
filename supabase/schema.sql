-- Briefing 7 — Supabase Schema
-- Run this in the Supabase SQL Editor or via the CLI:
--   supabase db push
-- or:
--   psql $DATABASE_URL -f supabase/schema.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- briefings
-- One row per calendar day. The unique index on briefing_date enforces
-- the anti-duplicate rule (only one briefing per day).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists briefings (
  id               uuid        primary key default gen_random_uuid(),
  briefing_date    date        not null,
  title            text        not null,
  content          text        not null,
  -- Joined WhatsApp messages as a single string (preview / human-readable)
  whatsapp_content text,
  -- Split messages array: [{index, label, content, charCount}, ...]
  whatsapp_messages jsonb,
  word_count       integer,
  char_count       integer,
  -- Lifecycle: generated | quality_check_passed | failed_quality_check
  --            | failed_generation | sent | failed_to_send
  status           text        not null default 'generated',
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists briefings_briefing_date_unique
  on briefings(briefing_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- sources
-- Sources collected and scored during the briefing pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists sources (
  id                  uuid        primary key default gen_random_uuid(),
  briefing_id         uuid        references briefings(id) on delete cascade,
  title               text        not null,
  url                 text,
  source_name         text,
  source_type         text,
  published_at        timestamptz,
  reliability_score   integer     check (reliability_score between 1 and 10),
  freshness_score     integer     check (freshness_score between 1 and 10),
  relevance_score     integer     check (relevance_score between 1 and 10),
  business_score      integer     check (business_score between 1 and 10),
  actionability_score integer     check (actionability_score between 1 and 10),
  total_score         integer,
  -- low | medium | high
  confidence_level    text,
  summary             text,
  created_at          timestamptz not null default now()
);

create index if not exists sources_briefing_id_idx on sources(briefing_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- opportunities
-- Concrete opportunity detected in the briefing.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists opportunities (
  id               uuid        primary key default gen_random_uuid(),
  briefing_id      uuid        references briefings(id) on delete cascade,
  title            text        not null,
  description      text,
  -- ai | business | finance | real_estate | other
  category         text,
  potential_score  integer     check (potential_score between 1 and 10),
  action_suggested text,
  created_at       timestamptz not null default now()
);

create index if not exists opportunities_briefing_id_idx on opportunities(briefing_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- logs
-- Technical execution logs for each pipeline run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists logs (
  id            uuid        primary key default gen_random_uuid(),
  run_date      date,
  -- started | success | error | skipped | warning | failed_quality_check | sent | failed_to_send
  status        text        not null,
  step          text,
  error_message text,
  metadata      jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists logs_run_date_idx on logs(run_date);
create index if not exists logs_status_idx on logs(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- usage_logs
-- Token and API usage per run — used for cost tracking.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists usage_logs (
  id               uuid          primary key default gen_random_uuid(),
  run_date         date,
  -- e.g. "anthropic", "openai", "tavily"
  provider         text,
  -- e.g. "generate_briefing", "search"
  operation        text,
  input_tokens     integer,
  output_tokens    integer,
  search_requests  integer,
  -- USD
  estimated_cost   numeric(10, 6),
  metadata         jsonb,
  created_at       timestamptz   not null default now()
);

create index if not exists usage_logs_run_date_idx on usage_logs(run_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- settings
-- Key/value store for runtime configuration (future use).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists settings (
  id         uuid        primary key default gen_random_uuid(),
  key        text        unique not null,
  value      jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: auto-update updated_at on briefings and settings
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger briefings_updated_at
  before update on briefings
  for each row execute procedure set_updated_at();

create trigger settings_updated_at
  before update on settings
  for each row execute procedure set_updated_at();
