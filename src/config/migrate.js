const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const pool = require("./database");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function runMigrations() {
  // Lê arquivos de migração em ordem alfabética
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cria tabela de controle de migrações
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (alreadyApplied.rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      console.log(`[MIGRATION] Aplicado: ${file}`);
    }

    await client.query("COMMIT");
    console.log("[MIGRATION] Todas as migrações aplicadas com sucesso");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[MIGRATION] Erro:", err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
