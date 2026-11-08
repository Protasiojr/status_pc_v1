import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    device: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agent: { findFirst: vi.fn(), update: vi.fn() },
    wakeCommand: { create: vi.fn() },
  },
  requireAdmin: vi.fn(),
  agentFromRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/generated/prisma/enums", () => ({
  DeviceType: { PC: "PC", ROUTER: "ROUTER", MODEM: "MODEM", MOBILE: "MOBILE", OTHER: "OTHER" },
  DeviceStatus: { online: "online", offline: "offline", unknown: "unknown" },
  CommandType: { DISCOVER: "DISCOVER", PING_DEVICES: "PING_DEVICES", WOL: "WOL" },
  CommandStatus: { pending: "pending", claimed: "claimed", success: "success", failed: "failed" },
}));
vi.mock("@/lib/api", () => ({
  apiError: (error: string, status = 400) => Response.json({ error }, { status }),
  readJson: async (request: Request) => request.json().catch(() => null),
  requireAdmin: mocks.requireAdmin,
  safeError: () => Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 }),
  stringField: (value: unknown, max = 191) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null,
}));
vi.mock("@/lib/auth", () => ({ agentFromRequest: mocks.agentFromRequest }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));

import { GET as listDevices, POST as createDevice } from "@/app/api/devices/route";
import { DELETE as deleteDevice, PATCH as updateDevice } from "@/app/api/devices/[id]/route";
import { POST as wakeDevice } from "@/app/api/devices/[id]/wake/route";
import { POST as requestDiscovery } from "@/app/api/discovery/scan/route";
import { POST as reportDiscovery } from "@/app/api/agent/discovery/route";

const device = {
  id: "device-1",
  name: "PC do escritório",
  description: "Mesa principal",
  color: "#246BFD",
  hostname: "desktop",
  ip: "192.168.1.20",
  port: 443,
  mac: "AA:BB:CC:DD:EE:FF",
  type: "PC",
  typeConfidence: null,
  os: "WINDOWS",
  osConfidence: null,
  status: "offline",
  lastSeenAt: null,
  broadcastAddress: "192.168.1.255",
  wolEnabled: true,
  wolPort: 9,
  approved: true,
};

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function bodyOf<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin-1" }, response: null });
  mocks.agentFromRequest.mockResolvedValue({ id: "agent-1" });
});

afterEach(() => vi.unstubAllGlobals());

describe("API de dispositivos", () => {
  it("lista os dispositivos para um administrador autenticado", async () => {
    mocks.prisma.device.findMany.mockResolvedValue([device]);

    const response = await listDevices(new Request("http://localhost/api/devices"));

    expect(response.status).toBe(200);
    expect(await bodyOf<{ devices: typeof device[] }>(response)).toEqual({ devices: [device] });
    expect(mocks.prisma.device.findMany).toHaveBeenCalledOnce();
  });

  it("recusa a listagem sem sessão administrativa", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: Response.json({ error: "Não autenticado" }, { status: 401 }) });

    const response = await listDevices(new Request("http://localhost/api/devices"));

    expect(response.status).toBe(401);
    expect(mocks.prisma.device.findMany).not.toHaveBeenCalled();
  });

  it("cria dispositivo com cor, descrição e porta válidas", async () => {
    mocks.prisma.device.create.mockResolvedValue(device);
    const request = jsonRequest("/api/devices", {
      name: device.name,
      description: device.description,
      color: device.color,
      ip: device.ip,
      port: device.port,
      mac: device.mac,
      type: device.type,
    });

    const response = await createDevice(request);

    expect(response.status).toBe(201);
    expect((await bodyOf<{ device: typeof device }>(response)).device).toEqual(device);
    expect(mocks.prisma.device.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ description: "Mesa principal", color: "#246BFD", port: 443 }),
    }));
  });

  it.each([
    ["cor", { color: "blue" }],
    ["porta", { port: 70000 }],
    ["MAC", { mac: "not-a-mac" }],
  ])("rejeita %s inválido ao criar dispositivo", async (_field, invalid) => {
    const response = await createDevice(jsonRequest("/api/devices", { name: "Dispositivo", ...invalid }));

    expect(response.status).toBe(400);
    expect(mocks.prisma.device.create).not.toHaveBeenCalled();
  });

  it("atualiza metadados do dispositivo", async () => {
    mocks.prisma.device.findUnique.mockResolvedValue(device);
    mocks.prisma.device.update.mockResolvedValue({ ...device, description: "Atualizado", color: "#00AA88", port: 8080 });

    const response = await updateDevice(
      jsonRequest("/api/devices/device-1", { description: "Atualizado", color: "#00aa88", port: 8080 }, "PATCH"),
      { params: Promise.resolve({ id: "device-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.device.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "device-1" },
      data: expect.objectContaining({ description: "Atualizado", color: "#00AA88", port: 8080 }),
    }));
  });

  it("exclui o dispositivo selecionado", async () => {
    mocks.prisma.device.delete.mockResolvedValue(device);

    const response = await deleteDevice(
      new Request("http://localhost/api/devices/device-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "device-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.device.delete).toHaveBeenCalledWith({ where: { id: "device-1" } });
  });
});

describe("APIs de descoberta e Wake-on-LAN", () => {
  it("enfileira varredura quando o agente está conectado", async () => {
    mocks.prisma.agent.findFirst.mockResolvedValue({ id: "agent-1", lastSeenAt: new Date() });
    mocks.prisma.wakeCommand.create.mockResolvedValue({ id: "command-1", type: "DISCOVER" });

    const response = await requestDiscovery(jsonRequest("/api/discovery/scan", {}));

    expect(response.status).toBe(202);
    expect(mocks.prisma.wakeCommand.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "DISCOVER", agentId: "agent-1" }),
    }));
  });

  it("persiste candidatos reportados pelo agente como pendentes", async () => {
    mocks.prisma.device.findUnique.mockResolvedValue(null);
    mocks.prisma.device.findFirst.mockResolvedValue(null);
    mocks.prisma.device.create.mockResolvedValue({ ...device, approved: false, type: "ROUTER", typeConfidence: "high" });
    mocks.prisma.agent.update.mockResolvedValue({ id: "agent-1" });

    const response = await reportDiscovery(jsonRequest("/api/agent/discovery", {
      devices: [{ ip: "192.168.1.1", mac: "AA:BB:CC:DD:EE:01", type: "ROUTER", typeConfidence: "high" }],
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.device.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "ROUTER", typeConfidence: "high", approved: false }),
    }));
  });

  it("enfileira WOL para PC aprovado e configurado", async () => {
    mocks.prisma.device.findUnique.mockResolvedValue(device);
    mocks.prisma.agent.findFirst.mockResolvedValue({ id: "agent-1", lastSeenAt: new Date() });
    mocks.prisma.wakeCommand.create.mockResolvedValue({ id: "command-2", type: "WOL", status: "pending" });

    const response = await wakeDevice(jsonRequest("/api/devices/device-1/wake", {}), { params: Promise.resolve({ id: "device-1" }) });

    expect(response.status).toBe(202);
    expect(mocks.prisma.wakeCommand.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "WOL", deviceId: "device-1", agentId: "agent-1" }),
    }));
  });

  it("recusa WOL para tipo que não seja PC", async () => {
    mocks.prisma.device.findUnique.mockResolvedValue({ ...device, type: "ROUTER" });
    mocks.prisma.agent.findFirst.mockResolvedValue({ id: "agent-1", lastSeenAt: new Date() });

    const response = await wakeDevice(jsonRequest("/api/devices/device-1/wake", {}), { params: Promise.resolve({ id: "device-1" }) });

    expect(response.status).toBe(422);
    expect(mocks.prisma.wakeCommand.create).not.toHaveBeenCalled();
  });
});
