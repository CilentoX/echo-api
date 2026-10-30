require("dotenv").config();
const app = require("./app");
const { runMigrations } = require("./config/migrate");

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Executa migrações antes de iniciar o servidor
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`[API] Echo API rodando na porta ${PORT}`);
      console.log(`[API] Ambiente: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (err) {
    console.error("[API] Falha ao iniciar:", err);
    process.exit(1);
  }
}

start();
