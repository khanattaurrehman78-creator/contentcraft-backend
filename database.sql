-- ═══════════════════════════════════════════════════
-- ContentCraft AI — Database Schema
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- ─── USERS TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fname TEXT NOT NULL,
  lname TEXT DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'admin')),
  credits_used INTEGER DEFAULT 0,
  credits_limit INTEGER DEFAULT 10,
  joined DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTENT HISTORY ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  keyword TEXT DEFAULT '',
  credits_used INTEGER DEFAULT 1,
  content_preview TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CREDIT GRANTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  note TEXT DEFAULT 'Manual grant',
  granted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DEDUCT CREDITS FUNCTION ─────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_credits(user_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE public.users
  SET credits_used = credits_used + amount,
      updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── AUTO UPDATE TIMESTAMP ───────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;

-- Users: can read own data
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- History: users see own, admins see all
CREATE POLICY "Users see own history"
  ON public.content_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own history"
  ON public.content_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── ADMIN USER ──────────────────────────────────────
-- Run this AFTER creating your admin account via /api/auth/register
-- Replace the email below with your admin email

-- UPDATE public.users
-- SET role = 'admin', plan = 'admin', credits_limit = 999999
-- WHERE email = 'admin@contentcraft.ai';

-- ─── INDEXES ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_history_user ON public.content_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON public.content_history(created_at);

-- ─── VERIFY SETUP ────────────────────────────────────
SELECT 'Database setup complete!' as status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
