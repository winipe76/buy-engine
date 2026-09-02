export function authorizedByPassword(request: Request, password: string): boolean {
  const [scheme, token] = (request.headers.get("Authorization") ?? "").split(" ");
  if (scheme !== "Basic" || !token) return false;
  try {
    const [username, ...passwordParts] = atob(token).split(":");
    return username === "buy" && passwordParts.join(":") === password;
  } catch {
    return false;
  }
}

