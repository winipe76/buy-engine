import { parseCandidateSnapshot, type CandidateSnapshot } from "@/lib/candidate-contract";

const IV_LENGTH = 12;
const MAX_TOKEN_LENGTH = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

type TransferPayload = {
  snapshot: unknown;
  action?: unknown;
  return_url?: unknown;
  issued_at: string;
  expires_at: string;
};

function base64UrlToBytes(value: string) {
  if (!value || value.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("candidate transfer token is invalid");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptionKey(secret: string) {
  if (!secret) throw new Error("candidate transfer is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

function validateTimes(payload: TransferPayload) {
  const issuedAt = Date.parse(payload.issued_at);
  const expiresAt = Date.parse(payload.expires_at);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new Error("candidate transfer timestamps are invalid");
  }
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) throw new Error("candidate transfer was issued in the future");
  if (expiresAt <= now) throw new Error("candidate transfer has expired");
}

export type CandidateTransfer = { snapshot: CandidateSnapshot; action: "add" | "remove"; returnUrl: string };

export async function readCandidateTransferToken(token: string, secret: string): Promise<CandidateTransfer> {
  try {
    const combined = base64UrlToBytes(token);
    if (combined.length <= IV_LENGTH) throw new Error("candidate transfer token is invalid");
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await decryptionKey(secret), encrypted);
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as TransferPayload;
    if (!payload || typeof payload !== "object") throw new Error("candidate transfer payload is invalid");
    validateTimes(payload);
    const action = payload.action === "remove" ? "remove" : "add";
    if (typeof payload.return_url !== "string") throw new Error("candidate transfer return URL is invalid");
    const returnUrl = new URL(payload.return_url);
    if (returnUrl.protocol !== "https:" || !returnUrl.hostname.endsWith(".chatgpt.site")) throw new Error("candidate transfer return URL is invalid");
    return { snapshot: parseCandidateSnapshot(payload.snapshot), action, returnUrl: returnUrl.toString() };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("candidate transfer")) throw error;
    throw new Error("candidate transfer token could not be verified");
  }
}

