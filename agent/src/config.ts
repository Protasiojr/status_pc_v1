import os from "node:os";

export interface AgentConfig {
  apiBaseUrl: string;
  pairingCode?: string;
  agentToken?: string;
  agentName: string;
  pollIntervalMs: number;
}

export function readConfig(): AgentConfig {
  const apiBaseUrl = process.env.API_BASE_URL?.trim().replace(/\/$/, "");
  if (!apiBaseUrl) throw new Error("Defina API_BASE_URL com a URL do servidor Status PC.");

  const parsed = new URL(apiBaseUrl);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("API_BASE_URL deve usar HTTP ou HTTPS.");
  }
  const loopbackHost = new Set(["localhost", "127.0.0.1", "[::1]"]).has(parsed.hostname.toLowerCase());
  if (parsed.protocol === "http:" && !loopbackHost && process.env.ALLOW_INSECURE_AGENT_HTTP !== "true") {
    throw new Error("Use HTTPS para proteger o token do agente. HTTP remoto só é permitido com ALLOW_INSECURE_AGENT_HTTP=true em uma LAN confiável.");
  }

  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 5000);
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1000 || pollIntervalMs > 60000) {
    throw new Error("POLL_INTERVAL_MS deve ser um inteiro entre 1000 e 60000.");
  }

  return {
    apiBaseUrl,
    pairingCode: process.env.PAIRING_CODE?.trim() || undefined,
    agentToken: process.env.AGENT_TOKEN?.trim() || undefined,
    agentName: process.env.AGENT_NAME?.trim() || os.hostname(),
    pollIntervalMs,
  };
}
