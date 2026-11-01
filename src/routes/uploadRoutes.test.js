import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { build } from "../app.js";
import FormData from "form-data";

// Mock uploadService
vi.mock("../services/uploadService.js", () => ({
  uploadService: {
    saveChatMedia: vi.fn(),
  },
}));

import { uploadService } from "../services/uploadService.js";

describe("POST /api/upload/chat", () => {
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

  it("faz upload de áudio e retorna URL", async () => {
    const mockResult = {
      fileId: "test-file-id",
      url: "https://api.echo.litteris.online/uploads/chat/test-file-id.ogg",
      originalName: "test.ogg",
      mimeType: "audio/ogg",
      size: 1234,
    };
    uploadService.saveChatMedia.mockResolvedValue(mockResult);

    const form = new FormData();
    form.append("file", Buffer.from("fake audio data"), {
      filename: "test.ogg",
      contentType: "audio/ogg",
    });
    form.append("roomId", "!room:example.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/chat",
      headers: {
        "x-api-key": "test-api-key",
        ...form.getHeaders(),
      },
      payload: form,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("url");
    expect(body.url).toMatch(/^https?:\/\//);
    expect(body.mimeType).toBe("audio/ogg");
    expect(uploadService.saveChatMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "test.ogg",
        mimetype: "audio/ogg",
      }),
      "!room:example.com"
    );
  });

  it("faz upload de imagem sem roomId", async () => {
    const mockResult = {
      fileId: "test-file-id-2",
      url: "https://api.echo.litteris.online/uploads/chat/test-file-id-2.png",
      originalName: "image.png",
      mimeType: "image/png",
      size: 5678,
    };
    uploadService.saveChatMedia.mockResolvedValue(mockResult);

    const form = new FormData();
    form.append("file", Buffer.from("fake image data"), {
      filename: "image.png",
      contentType: "image/png",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/chat",
      headers: {
        "x-api-key": "test-api-key",
        ...form.getHeaders(),
      },
      payload: form,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mimeType).toBe("image/png");
    expect(uploadService.saveChatMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "image.png",
        mimetype: "image/png",
      }),
      undefined
    );
  });

  it("retorna 401 sem API key", async () => {
    const form = new FormData();
    form.append("file", Buffer.from("test"), { filename: "test.ogg", contentType: "audio/ogg" });

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/chat",
      headers: form.getHeaders(),
      payload: form,
    });

    expect(res.statusCode).toBe(401);
  });

  it("retorna 400 para tipo MIME não permitido", async () => {
    uploadService.saveChatMedia.mockRejectedValue(new Error("Tipo de arquivo não permitido"));

    const form = new FormData();
    form.append("file", Buffer.from("test"), { filename: "evil.exe", contentType: "application/x-msdownload" });

    const res = await app.inject({
      method: "POST",
      url: "/api/upload/chat",
      headers: {
        "x-api-key": "test-api-key",
        ...form.getHeaders(),
      },
      payload: form,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Tipo de arquivo não permitido");
  });
});