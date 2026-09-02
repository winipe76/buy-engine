/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { accessToken, authorizedByCookie } from "../lib/access-password";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUY_ENGINE_ACCESS_PASSWORD?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const loginPage = (invalid = false) => new Response(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buy Engine Access</title><style>body{margin:0;background:#f3f5f9;color:#172033;font-family:system-ui;display:grid;place-items:center;min-height:100vh}form{width:min(360px,calc(100% - 48px));background:white;padding:32px;border:1px solid #dce2ec;border-radius:20px;box-shadow:0 18px 50px #1f31521a}h1{margin:0 0 8px}p{color:#667085}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:10px;font-size:16px}input{border:1px solid #cbd3df;margin:16px 0}button{border:0;background:#172f57;color:white;font-weight:700}.error{color:#c62828}</style><form method="post" action="/access"><h1>Buy Engine</h1><p>접속 비밀번호를 입력하세요.</p>${invalid ? '<p class="error">비밀번호가 올바르지 않습니다.</p>' : ""}<input name="password" type="password" inputmode="numeric" autocomplete="current-password" required autofocus aria-label="접속 비밀번호"><button type="submit">접속하기</button></form></html>`, { status: invalid ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (!local && !env.BUY_ENGINE_ACCESS_PASSWORD) {
      return new Response("Buy Engine access password is not configured.", { status: 503 });
    }
    if (!local && url.pathname === "/access" && request.method === "POST") {
      const form = await request.formData();
      if (form.get("password") !== env.BUY_ENGINE_ACCESS_PASSWORD) return loginPage(true);
      const token = await accessToken(env.BUY_ENGINE_ACCESS_PASSWORD!);
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": `buy_engine_access=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
    }
    if (!local && !await authorizedByCookie(request, env.BUY_ENGINE_ACCESS_PASSWORD!)) {
      return request.method === "GET" ? loginPage() : Response.json({ status: "unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

