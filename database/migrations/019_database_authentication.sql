-- Database-backed login. Existing users, exam attempts and photos retain their IDs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_locked_until timestamptz;
ALTER TABLE users ALTER COLUMN password_hash TYPE text;
CREATE TABLE IF NOT EXISTS auth_sessions (
 id varchar(36) PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 access_hash varchar(64) NOT NULL UNIQUE,
 refresh_hash varchar(64) NOT NULL UNIQUE,
 access_expires_at timestamptz NOT NULL,
 refresh_expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(refresh_expires_at);
-- Browser Supabase clients must never be able to read login sessions directly.
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON auth_sessions FROM anon'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON auth_sessions FROM authenticated'; END IF;
END $$;
