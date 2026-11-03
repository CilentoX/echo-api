import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";

// Mock uploadService
const mockSaveFile = vi.fn();
const mockDeleteFile = vi.fn();

vi.mock("../services/uploadService.js", () => ({
  default: {
    saveFile: (...args) => mockSaveFile(...args),
    deleteFile: (...args) => mockDeleteFile(...args),
  },
  uploadService: {
    saveFile: (...args) => mockSaveFile(...args),
    deleteFile: (...args) => mockDeleteFile(...args),
  },
  saveFile: (...args) => mockSaveFile(...args),
  deleteFile: (...args) => mockDeleteFile(...args),
}));

import { uploadRoutes } from "./uploadRoutes.js";

describe("POST /api/upload/", () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    await app.register(uploadRoutes, { prefix: "/api/upload" });
    await app.register(uploadRoutes, { prefix: "/api/uploads" });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("faz upload de arquivo e retorna metadados", async () => {
    const mockResult = {
      fileId: "test-file-id",
      url: "/api/uploads/test-file-id",
      mimeType: "audio/ogg",
      size: 1234,
      originalName: "test.ogg",
      path: "/app/uploads/test-file-id.file",
    };
    mockSaveFile.mockResolvedValue(mockResult);

    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`
      ),
      Buffer.from("fake audio data"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("fileId");
    expect(body.fileId).toBe("test-file-id");
    expect(body.url).toBe("/api/uploads/test-file-id");
    expect(body.mimeType).toBe("audio/ogg");
    expect(body.originalName).toBe("test.ogg");
    expect(mockSaveFile).toHaveBeenCalledTimes(1);
  });

  it("retorna 400 quando nenhum arquivo é enviado", async () => {
    const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
    const payload = Buffer.from(`--${boundary}--\r\n`);

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });

  it("DELETE /api/upload/:fileId deleta arquivo", async () => {
    mockDeleteFile.mockResolvedValue({ deleted: true });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/upload/test-file-id",
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);
    expect(mockDeleteFile).toHaveBeenCalledWith("test-file-id");
  });

  it("DELETE retorna deleted:false quando arquivo não existe", async () => {
    mockDeleteFile.mockResolvedValue({ deleted: false });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/upload/nonexistent",
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(false);
  });
});
