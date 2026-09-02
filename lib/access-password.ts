export async function accessToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`buy-engine:${password}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function authorizedByCookie(request: Request, password: string): Promise<boolean> {
  const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)buy_engine_access=([^;]+)/)?.[1];
  return Boolean(token) && token === await accessToken(password);
}

