import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadService = {
  async saveFile(file) {
    const fileId = uuidv4();
    const originalName = file.filename;
    const mimeType = file.mimetype;

    // Valida tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error("Tipo de arquivo não permitido");
    }

    const ext = path.extname(originalName);
    const newFileName = `${fileId}${ext}`;
    const newFilePath = path.join(UPLOAD_DIR, newFileName);

    // Escreve o arquivo no disco
    const buffer = await file.toBuffer();
    fs.writeFileSync(newFilePath, buffer);

    const publicUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3001"}/uploads/${newFileName}`;

    return {
      fileId,
      originalName,
      mimeType,
      size: buffer.length,
      url: publicUrl,
      path: `/uploads/${newFileName}`,
    };
  },

  async deleteFile(fileId) {
    const files = fs.readdirSync(UPLOAD_DIR);
    const file = files.find((f) => f.startsWith(`${fileId}.`));

    if (!file) {
      throw new Error("Arquivo não encontrado");
    }

    fs.unlinkSync(path.join(UPLOAD_DIR, file));
    return { message: "Arquivo removido com sucesso" };
  },
};
