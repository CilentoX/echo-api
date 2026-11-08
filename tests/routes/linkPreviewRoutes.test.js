import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { registerLinkPreviewRoutes } from "../../src/routes/linkPreviewRoutes.js";

describe("linkPreviewRoutes", () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    registerLinkPreviewRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("retorna 400 se o parâmetro 'url' estiver ausente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/link-preview",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("url");
  });

  it("retorna 400 para URLs com esquemas não suportados (ex: javascript:, file:)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/link-preview?url=javascript:alert(1)",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("protocolos");
  });

  it("bloqueia tentativas de SSRF para endereços locais e privados", async () => {
    const forbiddenUrls = [
      "http://localhost:3000/secrets",
      "http://127.0.0.1:8080/admin",
      "http://127.0.0.2:8080/admin",
      "http://[::1]:8080/admin",
      "http://192.168.1.1/router",
      "http://10.0.0.1/internal",
      "http://service.internal/api",
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1.nip.io:8080/admin",
    ];

    for (const url of forbiddenUrls) {
      const res = await app.inject({
        method: "GET",
        url: `/api/link-preview?url=${encodeURIComponent(url)}`,
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("privada ou local");
    }
  });

  it("extrai metadados OpenGraph com sucesso", async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Exemplo Incrível</title>
          <meta property="og:title" content="Título OpenGraph" />
          <meta property="og:description" content="Descrição detalhada do artigo &amp; novidades." />
          <meta property="og:site_name" content="Echo Blog" />
          <meta property="og:image" content="/images/banner.png" />
          <link rel="icon" href="/favicon.png" />
        </head>
        <body>
          <h1>Conteúdo</h1>
        </body>
      </html>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => mockHtml,
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/link-preview?url=${encodeURIComponent("https://example.com/artigo-top")}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("success");
    expect(body.data.title).toBe("Título OpenGraph");
    expect(body.data.description).toBe("Descrição detalhada do artigo & novidades.");
    expect(body.data.publisher).toBe("Echo Blog");
    expect(body.data.imageUrl).toBe("https://example.com/images/banner.png");
    expect(body.data.logoUrl).toBe("https://example.com/favicon.png");
    expect(body.data.image?.url).toBe("https://example.com/images/banner.png");
  });

  it("retorna fallback gracioso quando o servidor remoto falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network connection refused")),
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/link-preview?url=${encodeURIComponent("https://remote-offline.com/post")}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("error");
    expect(body.data.title).toBe("remote-offline.com");
  });
});
