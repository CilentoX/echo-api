import net from "node:net";
import dns from "node:dns";

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .trim();
}

export function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    clean === "localhost" ||
    clean === "::1" ||
    clean === "::" ||
    clean === "0.0.0.0"
  ) {
    return true;
  }

  if (net.isIPv4(clean)) {
    if (/^127\./.test(clean)) return true;
    if (/^10\./.test(clean)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
    if (/^192\.168\./.test(clean)) return true;
    if (/^169\.254\./.test(clean)) return true;
    if (/^0\./.test(clean)) return true;
    if (clean === "255.255.255.255") return true;
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(clean)) return true;
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
    if (clean === "::" || clean === "0:0:0:0:0:0:0:0") return true;
    if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) return true;
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
    if (clean.startsWith("::ffff:")) {
      const v4 = clean.replace("::ffff:", "");
      return isPrivateIp(v4);
    }
    return false;
  }

  return false;
}

export function isForbiddenHostname(hostname) {
  if (!hostname) return true;
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    clean === "localhost" ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".lan") ||
    clean.endsWith(".home") ||
    clean.endsWith(".corp") ||
    clean === "169.254.169.254"
  ) {
    return true;
  }

  if (net.isIP(clean)) {
    return isPrivateIp(clean);
  }

  return false;
}

export function registerLinkPreviewRoutes(app) {
  app.get("/api/link-preview", async (request, reply) => {
    const rawUrl = request.query?.url;
    if (!rawUrl || typeof rawUrl !== "string") {
      return reply.code(400).send({ error: "O parâmetro 'url' é obrigatório." });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return reply.code(400).send({ error: "Formato de URL inválido." });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return reply.code(400).send({ error: "Apenas protocolos HTTP e HTTPS são suportados." });
    }

    if (isForbiddenHostname(parsedUrl.hostname)) {
      return reply.code(400).send({ error: "Acesso a endereços de rede privada ou local é proibido." });
    }

    // Proteção contra SSRF por resolução DNS e DNS Rebinding (ex: localtest.me, *.nip.io)
    const cleanHost = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    if (!net.isIP(cleanHost)) {
      try {
        const addresses = await dns.promises.lookup(cleanHost, { all: true });
        if (addresses && addresses.length > 0) {
          for (const addr of addresses) {
            if (isPrivateIp(addr.address)) {
              return reply.code(400).send({ error: "Acesso a endereços de rede privada ou local é proibido." });
            }
          }
        }
      } catch {
        // Se a resolução falhar ou ambiente de teste sem rede, o fetch cuidará da conexão
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(parsedUrl.href, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EchoBot/1.0; +https://echo.litteris.online)",
          Accept: "text/html,application/xhtml+xml,text/*;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!response.ok) {
        return reply.code(200).send({
          status: "error",
          message: `Servidor remoto retornou HTTP ${response.status}`,
          data: {
            title: parsedUrl.hostname,
            publisher: parsedUrl.hostname,
          },
        });
      }

      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/")
      ) {
        return reply.code(200).send({
          status: "success",
          data: {
            title: parsedUrl.hostname,
            publisher: parsedUrl.hostname,
          },
        });
      }

      const html = await response.text();
      // Limita processamento aos primeiros 256KB do documento
      const headChunk = html.slice(0, 256 * 1024);

      // og:title | twitter:title | <title>
      const ogTitleMatch =
        headChunk.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) ||
        headChunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
      const htmlTitleMatch = headChunk.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = ogTitleMatch
        ? decodeHtmlEntities(ogTitleMatch[1])
        : htmlTitleMatch
          ? decodeHtmlEntities(htmlTitleMatch[1].trim())
          : parsedUrl.hostname;

      // og:description | twitter:description | meta description
      const ogDescMatch =
        headChunk.match(/<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']+)["']/i) ||
        headChunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']/i);
      const description = ogDescMatch ? decodeHtmlEntities(ogDescMatch[1]) : undefined;

      // og:site_name
      const ogSiteMatch =
        headChunk.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
        headChunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:site_name["']/i);
      const publisher = ogSiteMatch ? decodeHtmlEntities(ogSiteMatch[1]) : parsedUrl.hostname;

      // og:image | twitter:image
      const ogImgMatch =
        headChunk.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/i) ||
        headChunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["']/i);
      let imageUrl = ogImgMatch ? ogImgMatch[1] : undefined;
      if (imageUrl) {
        try {
          imageUrl = new URL(imageUrl, parsedUrl.href).href;
        } catch {
          imageUrl = undefined;
        }
      }

      // Favicon / Logo
      const iconMatch =
        headChunk.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i) ||
        headChunk.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
      let logoUrl = iconMatch ? iconMatch[1] : undefined;
      if (logoUrl) {
        try {
          logoUrl = new URL(logoUrl, parsedUrl.href).href;
        } catch {
          logoUrl = `${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`;
        }
      } else {
        logoUrl = `${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`;
      }

      return reply.code(200).send({
        status: "success",
        data: {
          title,
          description,
          publisher,
          imageUrl,
          logoUrl,
          image: imageUrl ? { url: imageUrl } : undefined,
          logo: logoUrl ? { url: logoUrl } : undefined,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      return reply.code(200).send({
        status: "error",
        message: err.message,
        data: {
          title: parsedUrl.hostname,
          publisher: parsedUrl.hostname,
        },
      });
    }
  });
}
