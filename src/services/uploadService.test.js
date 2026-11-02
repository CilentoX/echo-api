import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { uploadService } from "./uploadService.js";

// Mock fs module
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args) => args.join("/")),
    extname: vi.fn((name) => {
      const idx = name.lastIndexOf(".");
      return idx >= 0 ? name.slice(idx) : "";
    }),
  },
  join: vi.fn((...args) => args.join("/")),
  extname: vi.fn((name) => {
    const idx = name.lastIndexOf(".");
    return idx >= 0 ? name.slice(idx) : "";
  }),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

describe("uploadService.saveChatMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env.UPLOAD_DIR = "/test/uploads";
    process.env.PUBLIC_BASE_URL = "https://api.echo.litteris.online";
    process.env.MAX_FILE_SIZE = "10485760";
  });

  afterEach(() => {
    delete process.env.UPLOAD_DIR;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.MAX_FILE_SIZE;
  });

  it("salva arquivo de áudio e retorna URL HTTP + metadados", async () => {
    const mockFile = {
      filename: "audio.ogg",
      mimetype: "audio/ogg",
      toBuffer: async () => Buffer.from("fake audio data"),
    };

    const result = await uploadService.saveChatMedia(mockFile, "!room:example.com");

    expect(result).toHaveProperty("fileId");
    expect(result).toHaveProperty("url");
    expect(result.url).toMatch(/^https?:\/\//);
    expect(result.mimeType).toBe("audio/ogg");
    expect(result.size).toBeGreaterThan(0);
    expect(result.originalName).toBe("audio.ogg");
    expect(result.path).toMatch(/^\/uploads\/chat\//);
  });

  it("salva arquivo de imagem e retorna URL HTTP + metadados", async () => {
    const mockFile = {
      filename: "image.png",
      mimetype: "image/png",
      toBuffer: async () => Buffer.from("fake image data"),
    };

    const result = await uploadService.saveChatMedia(mockFile);

    expect(result).toHaveProperty("fileId");
    expect(result.url).toMatch(/^https?:\/\//);
    expect(result.mimeType).toBe("image/png");
    expect(result.path).toMatch(/^\/uploads\/chat\//);
  });

  it("rejeita tipo MIME não permitido (ex: .exe)", async () => {
    const mockFile = {
      filename: "evil.exe",
      mimetype: "application/x-msdownload",
      toBuffer: async () => Buffer.from("x"),
    };

    await expect(uploadService.saveChatMedia(mockFile))
      .rejects.toThrow("Tipo de arquivo não permitido");
  });

  it("rejeita tipo MIME não permitido (ex: text/plain)", async () => {
    const mockFile = {
      filename: "test.txt",
      mimetype: "text/plain",
      toBuffer: async () => Buffer.from("text"),
    };

    await expect(uploadService.saveChatMedia(mockFile))
      .rejects.toThrow("Tipo de arquivo não permitido");
  });

  it("usa roomId sanitizado no caminho quando fornecido", async () => {
    const mockFile = {
      filename: "test.ogg",
      mimetype: "audio/ogg",
      toBuffer: async () => Buffer.from("data"),
    };

    const result = await uploadService.saveChatMedia(mockFile, "!room:test");

    // roomId é sanitizado para filesystem safety: !room:test -> _room_test
    expect(result.path).toContain("_room_test");
  });
});