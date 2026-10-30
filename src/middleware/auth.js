/**
 * Middleware de autenticação via API Key.
 * Header: X-API-Key: <sua_chave_api>
 */
function authenticate(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    // Se não há API_KEY configurada, permite tudo (dev)
    return next();
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  next();
}

module.exports = { authenticate };
