-- 001_create_user_profiles.sql
-- Tabela de perfis de usuário (substitui user_profiles do Appwrite)
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,                    -- MXID (ex: @usuario:echo.litteris.online)
  user_id TEXT NOT NULL UNIQUE,           -- MXID (mesmo que id, para facilitar consultas)
  avatar_url TEXT,                        -- URL da imagem do avatar (storage próprio)
  banner_url TEXT,                        -- URL da imagem do banner (storage próprio)
  bio TEXT,                               -- Bio/descrição do usuário
  links JSONB DEFAULT '[]'::jsonb,        -- Links sociais (JSON array)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- 002_create_guild_profiles.sql
-- Tabela de perfis de guilda (substitui guild_profiles do Appwrite)
CREATE TABLE IF NOT EXISTS guild_profiles (
  id TEXT PRIMARY KEY,                    -- guildId (Matrix roomId, ex: !roomid:echo.litteris.online)
  guild_id TEXT NOT NULL UNIQUE,          -- guildId (mesmo que id)
  name TEXT NOT NULL,                     -- Nome da guilda
  description TEXT,                       -- Descrição da guilda
  avatar_url TEXT,                        -- URL da imagem principal/ícone (storage próprio)
  banner_url TEXT,                        -- URL do banner da guilda (storage próprio)
  created_by TEXT NOT NULL,               -- MXID do criador
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guild_profiles_guild_id ON guild_profiles(guild_id);
