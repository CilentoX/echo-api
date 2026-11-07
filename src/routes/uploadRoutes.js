import fs from "fs";
import path from "path";
import uploadService, { saveFile, deleteFile, getUploadsDir } from "../services/uploadService.js";
import { authenticate } from "../plugins/auth.js";

export async function uploadRoutes(fastify, opts) {
  // POST /api/upload e /api/upload/ (Requer autenticação)
  fastify.post(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({ error: "Nenhum arquivo enviado" });
        }

        const saveFn = uploadService?.saveFile || saveFile;
        const result = await saveFn(data);
        return reply.status(201).send(result);
      } catch (err) {
        if (err.message === "Tipo de arquivo não permitido") {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // GET /api/upload/:fileId e /api/uploads/:fileId (Público para renderização de mídias em tags <img> e <audio>)
  fastify.get(
    "/:fileId",
    async (request, reply) => {
      const { fileId } = request.params;
      const cleanId = path.basename(fileId).replace(/\.file$/, "");
      const uploadsDir = getUploadsDir();
      const filePath = path.join(uploadsDir, `${cleanId}.file`);
      const metaPath = path.join(uploadsDir, `${cleanId}.meta.json`);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: "Arquivo não encontrado" });
      }

      let mimeType = "application/octet-stream";
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          if (meta.mimeType) mimeType = meta.mimeType;
        } catch {}
      }

      const stream = fs.createReadStream(filePath);
      return reply.type(mimeType).send(stream);
    }
  );

  // DELETE /api/upload/:fileId (Requer autenticação)
  fastify.delete(
    "/:fileId",
    {
      preHandler: [authenticate],
      param: { type: "object", properties: { fileId: { type: "string" } } },
    },
    async (request, reply) => {
      const { fileId } = request.params;
      const deleteFn = uploadService?.deleteFile || deleteFile;
      const result = await deleteFn(fileId);
      return result;
    }
  );
}
