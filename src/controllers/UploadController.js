const expressAsyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } = require("../config/storage");

/**
 * Controlador de upload de arquivos.
 * Endpoints:
 *   POST /api/upload
 *   DELETE /api/upload/:fileId
 */

const uploadFile = expressAsyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }

  const fileId = uuidv4();
  const originalName = req.file.originalname;
  const mimeType = req.file.mimetype;
  const size = req.file.size;

  // Valida tipo MIME
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    // Remove o arquivo se tipo não permitido
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Tipo de arquivo não permitido" });
  }

  // Renomeia o arquivo para o fileId (mantém extensão)
  const ext = path.extname(originalName);
  const newFileName = `${fileId}${ext}`;
  const newFilePath = path.join(UPLOAD_DIR, newFileName);

  fs.renameSync(req.file.path, newFilePath);

  const publicUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3001"}/uploads/${newFileName}`;

  res.status(201).json({
    fileId,
    originalName,
    mimeType,
    size,
    url: publicUrl,
    path: `/uploads/${newFileName}`,
  });
});

const deleteFile = expressAsyncHandler(async (req, res) => {
  const { fileId } = req.params;
  const uploadDir = UPLOAD_DIR;

  // Procura o arquivo por fileId (qualquer extensão)
  const files = fs.readdirSync(uploadDir);
  const file = files.find((f) => f.startsWith(`${fileId}.`));

  if (!file) {
    return res.status(404).json({ error: "Arquivo não encontrado" });
  }

  fs.unlinkSync(path.join(uploadDir, file));
  res.json({ message: "Arquivo removido com sucesso" });
});

module.exports = { uploadFile, deleteFile };
