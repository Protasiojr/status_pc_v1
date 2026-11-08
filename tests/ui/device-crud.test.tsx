import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

vi.mock("next/script", () => ({ default: () => null }));

type DeviceFixture = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  hostname: string | null;
  ip: string | null;
  port: number | null;
  mac: string | null;
  type: "PC" | "ROUTER" | "MODEM" | "MOBILE" | "OTHER";
  typeConfidence: string | null;
  os: string | null;
  osConfidence: string | null;
  status: "online" | "offline" | "unknown";
  lastSeenAt: string | null;
  broadcastAddress: string | null;
  wolEnabled: boolean;
  wolPort: number;
  approved: boolean;
};

const pcDevice: DeviceFixture = {
  id: "pc-1",
  name: "PC Principal",
  description: "Computador do escritório",
  color: "#246BFD",
  hostname: "pc-escritorio",
  ip: "192.168.1.20",
  port: 443,
  mac: "AA:BB:CC:DD:EE:FF",
  type: "PC",
  typeConfidence: "high",
  os: "WINDOWS",
  osConfidence: "medium",
  status: "offline",
  lastSeenAt: "2026-11-07T12:00:00.000Z",
  broadcastAddress: "192.168.1.255",
  wolEnabled: true,
  wolPort: 9,
  approved: true,
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function mockAppFetch(initialDevices: DeviceFixture[] = [], connected = true) {
  const devices = [...initialDevices];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";

    if (path === "/api/auth/status") return jsonResponse({ configured: true });
    if (path === "/api/auth/me") return jsonResponse({ admin: { email: "admin@example.com" } });
    if (path === "/api/agents/status") return jsonResponse({ agent: { connected, name: "Agente local" } });
    if (path === "/api/devices" && method === "GET") return jsonResponse({ devices: [...devices] });

    if (path === "/api/devices" && method === "POST") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      const created = { ...pcDevice, ...payload, id: "pc-new", status: "unknown", lastSeenAt: null } as DeviceFixture;
      devices.push(created);
      return jsonResponse({ device: created }, 201);
    }

    const deviceRoute = path.match(/^\/api\/devices\/([^/]+)$/);
    if (deviceRoute && method === "PATCH") {
      const id = deviceRoute[1];
      const index = devices.findIndex((item) => item.id === id);
      if (index >= 0) devices[index] = { ...devices[index], ...JSON.parse(String(init?.body ?? "{}")) };
      return jsonResponse({ device: devices[index] ?? null });
    }
    if (deviceRoute && method === "DELETE") {
      const index = devices.findIndex((item) => item.id === deviceRoute[1]);
      if (index >= 0) devices.splice(index, 1);
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/wake") && method === "POST") return jsonResponse({ command: { id: "wake-1" } }, 202);
    if (path === "/api/discovery/scan" && method === "POST") return jsonResponse({ command: { id: "scan-1" } }, 202);
    if (path === "/api/agents/pairing-codes" && method === "POST") return jsonResponse({ code: "PAIR-1234", expiresAt: "2026-11-07T13:00:00.000Z" }, 201);
    if (path === "/api/auth/logout" && method === "POST") return jsonResponse({ ok: true });
    return jsonResponse({ error: `Rota de teste não configurada: ${method} ${path}` }, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, devices };
}

async function renderApp(initialDevices: DeviceFixture[] = [], connected = true) {
  const user = userEvent.setup();
  const { fetchMock, devices } = mockAppFetch(initialDevices, connected);
  render(<Home />);
  await screen.findByRole("heading", { name: /visão geral da rede/i });
  return { user, fetchMock, devices };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("telas de dispositivos", () => {
  it("lista dispositivos com estado e resumo", async () => {
    await renderApp([pcDevice]);

    expect(screen.getByRole("heading", { name: "PC Principal" })).toBeInTheDocument();
    expect(screen.getByText("Computador do escritório")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.20")).toBeInTheDocument();
    expect(screen.getAllByText("Offline")).toHaveLength(2);
  });

  it("abre a tela de detalhes do dispositivo", async () => {
    const { user } = await renderApp([pcDevice]);

    await user.click(screen.getByRole("button", { name: "Ver detalhes de PC Principal" }));
    const dialog = screen.getByRole("dialog", { name: "PC Principal" });

    expect(within(dialog).getByText("Computador do escritório")).toBeInTheDocument();
    expect(within(dialog).getByText("192.168.1.20")).toBeInTheDocument();
    expect(within(dialog).getByText("192.168.1.255 · UDP 9")).toBeInTheDocument();
  });

  it("cadastra um dispositivo pela tela de formulário", async () => {
    const { user, fetchMock, devices } = await renderApp();

    await user.click(screen.getAllByRole("button", { name: /adicionar dispositivo/i })[0]);
    const dialog = screen.getByRole("dialog", { name: "Adicionar dispositivo" });
    await user.type(within(dialog).getByLabelText("Nome"), "NAS da sala");
    await user.type(within(dialog).getByLabelText(/Descrição/), "Armazenamento da família");
    await user.type(within(dialog).getByLabelText("Endereço IP"), "192.168.1.30");
    await user.type(within(dialog).getByLabelText("Porta do dispositivo"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "Salvar dispositivo" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/devices", expect.objectContaining({ method: "POST" })));
    const request = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/devices" && init?.method === "POST");
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload).toMatchObject({ name: "NAS da sala", description: "Armazenamento da família", ip: "192.168.1.30", port: 5000, color: "#246BFD" });
    expect(devices).toHaveLength(1);
    expect(await screen.findByText("Dispositivo cadastrado.")).toBeInTheDocument();
  });

  it("edita dispositivo pela ação do cartão", async () => {
    const { user, fetchMock } = await renderApp([pcDevice]);

    await user.click(screen.getByRole("button", { name: "Editar PC Principal" }));
    const dialog = screen.getByRole("dialog", { name: "Editar dispositivo" });
    const nameField = within(dialog).getByLabelText("Nome");
    await user.clear(nameField);
    await user.type(nameField, "PC atualizado");
    await user.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/devices/pc-1", expect.objectContaining({ method: "PATCH" })));
    expect(await screen.findByText("Dispositivo atualizado.")).toBeInTheDocument();
  });

  it("exclui somente após confirmação", async () => {
    const { user, fetchMock, devices } = await renderApp([pcDevice]);

    await user.click(screen.getByRole("button", { name: "Remover PC Principal" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remover dispositivo?" });
    expect(within(dialog).getByText(/PC Principal/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remover dispositivo" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/devices/pc-1", expect.objectContaining({ method: "DELETE" })));
    expect(devices).toHaveLength(0);
    expect(await screen.findByText("PC Principal removido.")).toBeInTheDocument();
  });

  it("aprova um dispositivo pendente", async () => {
    const pending = { ...pcDevice, id: "candidate-1", name: "Roteador detectado", type: "ROUTER" as const, approved: false };
    const { user, fetchMock } = await renderApp([pending]);

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/devices/candidate-1", expect.objectContaining({ method: "PATCH" })));
    expect(await screen.findByText("Roteador detectado adicionado ao monitoramento.")).toBeInTheDocument();
  });

  it("envia WOL somente pela tela quando o agente está conectado", async () => {
    const { user, fetchMock } = await renderApp([pcDevice], true);

    await user.click(screen.getByRole("button", { name: "Ligar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/devices/pc-1/wake", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText(/Solicitação Wake-on-LAN enfileirada/)).toBeInTheDocument();
  });

  it("desabilita WOL pela interface quando o agente está desconectado", async () => {
    await renderApp([pcDevice], false);

    expect(screen.getByRole("button", { name: "Ligar" })).toBeDisabled();
  });
});
