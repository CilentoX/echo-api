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

// Tipos permitidos para mídia do chat (imagens + áudio)
const CHAT_ALLOWED_MIME_TYPES = [
  ...ALLOWED_MIME_TYPES,
  "audio/ogg",
  "audio/mp3",
  "audio/mpeg",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
];

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function ensureChatUploadDir(roomId) {
  const chatDir = roomId
    ? path.join(UPLOAD_DIR, "chat", roomId.replace(/[^a-zA-Z0-9]/g, "_"))
    : path.join(UPLOAD_DIR, "chat");
  if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
  }
  return chatDir;
}

export const uploadService = {
  async saveFile(file) {
    const fileId = uuidv4();
    const originalName = file.filename;
    const mimeType = file.mimetype;

    // Valida tipo MIME (apenas imagens para avatar/banner)
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

  /**
   * Salva mídia do chat (imagem ou áudio) no storage do Echo API.
   * @param {Object} file - Arquivo com filename, mimetype, toBuffer()
   * @param {string} [roomId] - ID da sala (opcional, para organizar por sala)
   * @returns {Promise<Object>} { fileId, originalName, mimeType, size, url, path }
   */
  async saveChatMedia(file, roomId) {
    const fileId = uuidv4();
    const originalName = file.filename;
    const mimeType = file.mimetype;

    // Valida tipo MIME (imagens + áudio)
    if (!CHAT_ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error("Tipo de arquivo não permitido");
    }

    const ext = path.extname(originalName);
    const newFileName = `${fileId}${ext}`;
    const chatDir = ensureChatUploadDir(roomId);
    const newFilePath = path.join(chatDir, newFileName);

    // Escreve o arquivo no disco
    const buffer = await file.toBuffer();
    fs.writeFileSync(newFilePath, buffer);

    const relativePath = roomId
      ? `/uploads/chat/${roomId.replace(/[^a-zA-Z0-9]/g, "_")}/${newFileName}`
      : `/uploads/chat/${newFileName}`;
    const publicUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3001"}${relativePath}`;

    return {
      fileId,
      originalName,
      mimeType,
      size: buffer.length,
      url: publicUrl,
      path: relativePath,
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
