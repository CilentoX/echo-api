const pool = require("../config/database");

/**
 * Modelo de perfil de guilda — camada de acesso ao PostgreSQL.
 * Substitui guilds.ts do Appwrite.
 */
class GuildProfile {
  static async getById(id) {
    const result = await pool.query(
      "SELECT * FROM guild_profiles WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByGuildId(guildId) {
    return this.getById(guildId);
  }

  static async upsert({ id, guildId, name, description, avatarUrl, bannerUrl, createdBy }) {
    const result = await pool.query(
      `INSERT INTO guild_profiles (id, guild_id, name, description, avatar_url, banner_url, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         guild_id = EXCLUDED.guild_id,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         avatar_url = EXCLUDED.avatar_url,
         banner_url = EXCLUDED.banner_url,
         updated_at = NOW()
       RETURNING *`,
      [id, guildId, name, description ?? null, avatarUrl ?? null, bannerUrl ?? null, createdBy]
    );
    return result.rows[0];
  }

  static async patch(id, fields) {
    const allowedFields = ["name", "description", "avatar_url", "banner_url"];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      const dbKey = key === "avatarUrl" ? "avatar_url" : key === "bannerUrl" ? "banner_url" : key;
      if (!allowedFields.includes(dbKey)) continue;
      updates.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE guild_profiles SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await pool.query("DELETE FROM guild_profiles WHERE id = $1", [id]);
  }
}

module.exports = GuildProfile;
