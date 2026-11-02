import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { build } from "../app.js";
import FormData from "form-data";

// Mock uploadService
vi.mock("../services/uploadService.js", () => ({
  uploadService: {
    saveFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

import { uploadService } from "../services/uploadService.js";

describe("POST /api/upload/", () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.API_KEY = "test-api-key";
    app = await build();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.API_KEY;
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
    uploadService.saveFile.mockResolvedValue(mockResult);

    const form = new FormData();
    form.append("file", Buffer.from("fake audio data"), {
      filename: "test.ogg",
      contentType: "audio/ogg",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/",
      headers: {
        "x-api-key": "test-api-key",
        ...form.getHeaders(),
      },
      payload: form,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("fileId");
    expect(body.fileId).toBe("test-file-id");
    expect(body.url).toBe("/api/uploads/test-file-id");
    expect(body.mimeType).toBe("audio/ogg");
    expect(body.originalName).toBe("test.ogg");
    expect(uploadService.saveFile).toHaveBeenCalledTimes(1);
  });

  it("retorna 401 sem API key", async () => {
    const form = new FormData();
    form.append("file", Buffer.from("test"), { filename: "test.ogg", contentType: "audio/ogg" });

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/",
      headers: form.getHeaders(),
      payload: form,
    });

    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/upload/:fileId deleta arquivo", async () => {
    uploadService.deleteFile.mockResolvedValue({ deleted: true });

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
    expect(uploadService.deleteFile).toHaveBeenCalledWith("test-file-id");
  });

  it("DELETE retorna 404 quando arquivo não existe", async () => {
    uploadService.deleteFile.mockResolvedValue({ deleted: false });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/upload/nonexistent",
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
