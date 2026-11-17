CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY,
  referral_code VARCHAR(32) NOT NULL UNIQUE,
  referrer_name VARCHAR(100) NOT NULL,
  referrer_phone VARCHAR(30) NOT NULL,
  referrer_phone_normalized VARCHAR(30) NOT NULL,
  referrer_email VARCHAR(254),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired','blocked')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_phone ON referrals(referrer_phone_normalized);
CREATE INDEX IF NOT EXISTS idx_referrals_expires ON referrals(expires_at);

CREATE TABLE IF NOT EXISTS referral_clicks (
  id BIGSERIAL PRIMARY KEY,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  landing_path VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_referral ON referral_clicks(referral_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY,
  reference_code VARCHAR(32) NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(254),
  business_name VARCHAR(120),
  service VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','quoted','converted','closed','spam')),
  consent_at TIMESTAMPTZ NOT NULL,
  source_ip_hash VARCHAR(128),
  user_agent VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_referral ON enquiries(referral_id);

CREATE TABLE IF NOT EXISTS referral_conversions (
  id UUID PRIMARY KEY,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT,
  enquiry_id UUID REFERENCES enquiries(id) ON DELETE SET NULL,
  conversion_type VARCHAR(32) NOT NULL CHECK (conversion_type IN ('basic_application','advanced_application','plan_1_month','plan_3_months','plan_6_months','plan_12_months')),
  payment_reference VARCHAR(120) NOT NULL UNIQUE,
  paid_amount_paise BIGINT NOT NULL CHECK (paid_amount_paise >= 0),
  payment_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID NOT NULL REFERENCES admins(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referral ON referral_conversions(referral_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT,
  conversion_id UUID NOT NULL UNIQUE REFERENCES referral_conversions(id) ON DELETE RESTRICT,
  reward_type VARCHAR(32) NOT NULL,
  reward_amount_paise BIGINT NOT NULL CHECK (reward_amount_paise > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  approved_by UUID REFERENCES admins(id),
  approved_at TIMESTAMPTZ,
  paid_by UUID REFERENCES admins(id),
  paid_at TIMESTAMPTZ,
  payout_reference VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL,
  actor_id UUID,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_phone_normalized ON referrals(referrer_phone_normalized);
