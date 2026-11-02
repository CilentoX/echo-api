import * as uploadService from "../services/uploadService.js";

export async function uploadRoutes(fastify, opts) {
  // POST /api/upload
  fastify.post(
    "/",
    async (request, reply) => {
      try {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({ error: "Nenhum arquivo enviado" });
        }

        const result = await uploadService.saveFile(data);
        return reply.status(201).send(result);
      } catch (err) {
        if (err.message === "Tipo de arquivo não permitido") {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // DELETE /api/upload/:fileId
  fastify.delete(
    "/:fileId",
    { param: { type: "object", properties: { fileId: { type: "string" } } } },
    async (request, reply) => {
      const { fileId } = request.params;
      const result = await uploadService.deleteFile(fileId);
      return result;
    }
  );
}
