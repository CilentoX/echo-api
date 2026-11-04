import "./polyfill.js";
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

const PORT = parseInt(process.env.PORT) || 3001;
const HOST = "0.0.0.0";

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[API] Echo API rodando em http://${HOST}:${PORT}`);
    console.log(`[API] Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`[API] Documentação: http://${HOST}:${PORT}/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
