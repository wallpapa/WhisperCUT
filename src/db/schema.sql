-- WhisperCUT Supabase Schema
-- Run this migration in Supabase SQL editor

-- ── Autonomous Pipeline Tables ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_calendar (
  id             BIGSERIAL PRIMARY KEY,
  topic          TEXT        NOT NULL,
  scheduled_date DATE        NOT NULL,
  duration_sec   INT         DEFAULT 90,
  platforms      TEXT[]      DEFAULT ARRAY['tiktok', 'instagram'],
  account_ids    JSONB       DEFAULT '{}',
  study_channel  TEXT        DEFAULT '@doctorwaleerat',
  priority       INT         DEFAULT 5,
  status         TEXT        DEFAULT 'pending', -- pending | done | failed
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_date_status
  ON content_calendar (scheduled_date, status);

CREATE TABLE IF NOT EXISTS publish_log (
  id             BIGSERIAL PRIMARY KEY,
  platform       TEXT        NOT NULL,
  account_id     TEXT        NOT NULL,
  yt_project_id  TEXT,
  topic          TEXT,
  video_path     TEXT,
  published_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_log_platform_date
  ON publish_log (platform, account_id, published_at);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id          BIGSERIAL PRIMARY KEY,
  topic       TEXT,
  qa_score    FLOAT,
  published   TEXT[]      DEFAULT ARRAY[]::TEXT[],
  skipped     TEXT[]      DEFAULT ARRAY[]::TEXT[],
  video_path  TEXT,
  duration_ms INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS style_templates (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT        NOT NULL UNIQUE,
  template    JSONB       NOT NULL,
  video_count INT         DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Video Factory Tables (v1) ─────────────────────────────────────────────

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  language TEXT DEFAULT 'th',
  status TEXT DEFAULT 'draft', -- draft, analyzing, cutting, rendering, published
  source_video_url TEXT,
  rendered_video_url TEXT,
  transcript JSONB,
  timeline JSONB,
  feedback_scores JSONB,
  tiktok_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics table (feedback loop iterations)
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  hook_score FLOAT,
  cta_score FLOAT,
  pacing_score FLOAT,
  engagement_score FLOAT,
  improvements JSONB,
  iteration INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_analytics_project ON analytics(project_id);

-- RLS policies (enable for security)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on projects"
  ON projects FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on analytics"
  ON analytics FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT DO NOTHING;
