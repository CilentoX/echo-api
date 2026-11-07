import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
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

vi.mock("node:fs/promises", () => ({
  default: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
  },
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  readFile: vi.fn(),
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

describe("uploadService.saveFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_BASE_URL = "https://echo-api.litteris.online";
  });

  afterEach(() => {
    delete process.env.PUBLIC_BASE_URL;
  });

  it("salva arquivo e retorna metadados", async () => {
    const mockFile = {
      filename: "audio.ogg",
      mimetype: "audio/ogg",
      toBuffer: async () => Buffer.from("fake audio data"),
      file: Buffer.from("fake audio data"),
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fsp, "mkdir").mockResolvedValue();
    vi.spyOn(fsp, "writeFile").mockResolvedValue();

    const result = await uploadService.saveFile(mockFile);

    expect(result).toHaveProperty("fileId");
    expect(result.fileId).toBe("test-uuid-1234");
    expect(result.url).toBe("/api/uploads/test-uuid-1234");
    expect(result.mimeType).toBe("audio/ogg");
    expect(result.originalName).toBe("audio.ogg");
    expect(fsp.writeFile).toHaveBeenCalledTimes(2);
  });

  it("deleteFile remove arquivo existente", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fsp, "unlink").mockResolvedValue();

    const result = await uploadService.deleteFile("test-uuid-1234");

    expect(result.deleted).toBe(true);
    expect(fsp.unlink).toHaveBeenCalledWith(
      expect.stringContaining("test-uuid-1234.file")
    );
  });

  it("deleteFile retorna deleted:false quando arquivo não existe", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = await uploadService.deleteFile("nonexistent");

    expect(result.deleted).toBe(false);
    expect(fsp.unlink).not.toHaveBeenCalled();
  });
});
