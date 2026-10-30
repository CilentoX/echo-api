/**
 * Middleware de tratamento de erros global.
 */
function errorHandler(err, req, res, next) {
  console.error("[API ERROR]", err.message);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Arquivo muito grande" });
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Erro interno do servidor",
  });
}

module.exports = errorHandler;
