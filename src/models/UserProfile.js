const pool = require("../config/database");

/**
 * Modelo de perfil de usuário — camada de acesso ao PostgreSQL.
 * Substitui profiles.ts do Appwrite.
 */
class UserProfile {
  static async getById(id) {
    const result = await pool.query(
      "SELECT * FROM user_profiles WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  }

  static async getByUserId(userId) {
    return this.getById(userId);
  }

  static async upsert({ id, userId, avatarUrl, bannerUrl, bio, links }) {
    const result = await pool.query(
      `INSERT INTO user_profiles (id, user_id, avatar_url, banner_url, bio, links, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         avatar_url = EXCLUDED.avatar_url,
         banner_url = EXCLUDED.banner_url,
         bio = EXCLUDED.bio,
         links = EXCLUDED.links,
         updated_at = NOW()
       RETURNING *`,
      [id, userId, avatarUrl ?? null, bannerUrl ?? null, bio ?? null, JSON.stringify(links ?? [])]
    );
    return result.rows[0];
  }

  static async patch(id, fields) {
    const allowedFields = ["avatar_url", "banner_url", "bio", "links"];
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
      `UPDATE user_profiles SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await pool.query("DELETE FROM user_profiles WHERE id = $1", [id]);
  }
}

module.exports = UserProfile;
