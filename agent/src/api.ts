import { AgentCommand, DeviceCandidate, Platform, StatusReport } from "./types.js";

export interface AgentApi {
  pair(code: string, name: string, platform: Platform): Promise<{ agentId: number | string; agentToken: string }>;
  heartbeat(): Promise<void>;
  nextCommand(): Promise<AgentCommand | null>;
  reportDiscovery(devices: DeviceCandidate[]): Promise<void>;
  reportStatus(devices: StatusReport[]): Promise<void>;
  reportCommand(commandId: number | string, status: "success" | "failed", message?: string): Promise<void>;
}

export function createApi(baseUrl: string, getToken: () => string): AgentApi {
  async function request<T>(route: string, init: RequestInit = {}, withAuth = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (withAuth) headers.set("Authorization", `Bearer ${getToken()}`);
    const response = await fetch(new URL(route, `${baseUrl}/`), { ...init, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`${route}: ${message}`);
    }
    return body as T;
  }

  return {
    async pair(code, name, platform) {
      return request("/api/agent/pair", {
        method: "POST",
        body: JSON.stringify({ code, name, platform }),
      }, false);
    },
    async heartbeat() {
      await request("/api/agent/heartbeat", { method: "POST", body: "{}" });
    },
    async nextCommand() {
      const response = await request<{ command?: AgentCommand | null }>("/api/agent/commands/next");
      return response.command ?? null;
    },
    async reportDiscovery(devices) {
      await request("/api/agent/discovery", { method: "POST", body: JSON.stringify({ devices }) });
    },
    async reportStatus(devices) {
      await request("/api/agent/status", { method: "POST", body: JSON.stringify({ devices }) });
    },
    async reportCommand(commandId, status, message) {
      await request(`/api/agent/commands/${encodeURIComponent(String(commandId))}/result`, {
        method: "POST",
        body: JSON.stringify({ status, ...(message ? { message } : {}) }),
      });
    },
  };
}
