-- 002_create_guild_profiles.sql
CREATE TABLE IF NOT EXISTS guild_profiles (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guild_profiles_guild_id ON guild_profiles(guild_id);
