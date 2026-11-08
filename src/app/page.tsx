"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type DeviceType = "PC" | "ROUTER" | "MODEM" | "MOBILE" | "OTHER";
type Device = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  hostname: string | null;
  ip: string | null;
  port: number | null;
  mac: string | null;
  type: DeviceType;
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

type ApiError = { error?: string; message?: string };
type FormState = { name: string; description: string; color: string; hostname: string; ip: string; port: string; mac: string; type: DeviceType; os: string; broadcastAddress: string; wolEnabled: boolean; wolPort: string };

const defaultDeviceColor = "#246BFD";
const emptyForm: FormState = { name: "", description: "", color: defaultDeviceColor, hostname: "", ip: "", port: "", mac: "", type: "PC", os: "", broadcastAddress: "", wolEnabled: false, wolPort: "9" };
const typeLabels: Record<DeviceType, string> = { PC: "Computador", ROUTER: "Roteador", MODEM: "Modem", MOBILE: "Celular", OTHER: "Outro" };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(body.error || body.message || "Não foi possível concluir a solicitação.");
  return body;
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <i aria-hidden="true" className={`bi bi-${name} ${className}`} />;
}

function DeviceGlyph({ type, color }: { type: DeviceType; color: string }) {
  const icon = type === "PC" ? "pc-display" : type === "ROUTER" || type === "MODEM" ? "router" : type === "MOBILE" ? "phone" : "hdd-network";
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : defaultDeviceColor;
  return <span className="device-glyph" style={{ color: safeColor, backgroundColor: `${safeColor}1A` }}><Icon name={icon} /></span>;
}

function confidenceLabel(confidence: string | null) {
  if (confidence === "high") return "alta";
  if (confidence === "medium") return "média";
  if (confidence === "low") return "baixa";
  return null;
}

export default function Home() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [agent, setAgent] = useState<{ connected?: boolean; lastSeenAt?: string | null; name?: string | null } | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [deviceModal, setDeviceModal] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pairCode, setPairCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [deviceData, agentData] = await Promise.all([
        api<{ devices: Device[] }>("/api/devices"),
        api<{ agent: { connected?: boolean; lastSeenAt?: string | null; name?: string | null } | null }>("/api/agents/status"),
      ]);
      setDevices(deviceData.devices || []);
      setAgent(agentData.agent || null);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Falha ao atualizar o painel." });
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api<{ configured: boolean }>("/api/auth/status");
        if (!active) return;
        setConfigured(status.configured);
        if (status.configured) {
          try {
            const me = await api<{ admin: { email: string } }>("/api/auth/me");
            if (!active) return;
            setEmail(me.admin.email);
            setAuthenticated(true);
            await refresh(true);
          } catch {
            setAuthenticated(false);
          }
        }
      } catch (error) {
        if (active) setNotice({ kind: "error", text: error instanceof Error ? error.message : "Servidor indisponível." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [authenticated, refresh]);

  const visibleDevices = useMemo(() => {
    const filtered = filter === "all" ? devices : filter === "pending" ? devices.filter((device) => !device.approved) : devices.filter((device) => device.status === filter);
    const term = searchTerm.trim().toLocaleLowerCase();
    return term ? filtered.filter((device) => `${device.name} ${device.description || ""} ${device.hostname || ""} ${device.ip || ""} ${device.mac || ""}`.toLocaleLowerCase().includes(term)) : filtered;
  }, [devices, filter, searchTerm]);
  const onlineCount = devices.filter((device) => device.approved && device.status === "online").length;
  const offlineCount = devices.filter((device) => device.approved && device.status === "offline").length;
  const pendingCount = devices.filter((device) => !device.approved).length;

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("auth"); setNotice(null);
    try {
      if (!configured) {
        await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ email, password, setupToken }) });
        setConfigured(true);
        setAuthenticated(true);
        await refresh(true);
        setNotice({ kind: "success", text: "Conta administradora criada." });
      } else {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setAuthenticated(true);
        await refresh(true);
        setNotice({ kind: "success", text: "Sessão iniciada." });
      }
      setPassword("");
      setSetupToken("");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível autenticar." });
    } finally { setBusy(""); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAuthenticated(false); setDevices([]); setAgent(null); setNotice(null);
  }

  async function startScan() {
    setBusy("scan"); setNotice(null);
    try {
      await api("/api/discovery/scan", { method: "POST", body: JSON.stringify({}) });
      setNotice({ kind: "success", text: "Varredura solicitada. Os dispositivos encontrados aparecerão para revisão." });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Falha ao iniciar varredura." }); }
    finally { setBusy(""); }
  }

  async function createPairingCode() {
    setBusy("pair"); setPairCode(null); setNotice(null);
    try {
      const result = await api<{ code: string; expiresAt: string }>("/api/agents/pairing-codes", { method: "POST", body: JSON.stringify({}) });
      setPairCode(result);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Falha ao gerar código." }); }
    finally { setBusy(""); }
  }

  function openNewDevice() { setEditing(null); setForm(emptyForm); setDeviceModal(true); }
  function openEdit(device: Device) {
    setEditing(device);
    setForm({ name: device.name, description: device.description || "", color: device.color || defaultDeviceColor, hostname: device.hostname || "", ip: device.ip || "", port: device.port == null ? "" : String(device.port), mac: device.mac || "", type: device.type, os: device.os || "", broadcastAddress: device.broadcastAddress || "", wolEnabled: device.wolEnabled, wolPort: String(device.wolPort || 9) });
    setDeviceModal(true);
  }

  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null);
    if (form.wolEnabled && (!form.mac.trim() || !form.broadcastAddress.trim())) {
      setNotice({ kind: "error", text: "Para ativar WOL, informe o MAC e o broadcast privado da rede." });
      return;
    }
    if (form.port && (!Number.isInteger(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535)) {
      setNotice({ kind: "error", text: "A porta do dispositivo deve ser um número entre 1 e 65535." });
      return;
    }
    if (form.wolPort && (!Number.isInteger(Number(form.wolPort)) || Number(form.wolPort) < 1 || Number(form.wolPort) > 65535)) {
      setNotice({ kind: "error", text: "A porta WOL deve ser um número entre 1 e 65535." });
      return;
    }
    setBusy("save");
    const payload = { ...form, description: form.description.trim() || null, color: form.color, port: form.port ? Number(form.port) : null, wolPort: Number(form.wolPort) || 9, hostname: form.hostname || null, ip: form.ip || null, mac: form.mac || null, os: form.os || null, broadcastAddress: form.broadcastAddress || null };
    try {
      if (editing) await api(`/api/devices/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/devices", { method: "POST", body: JSON.stringify(payload) });
      setDeviceModal(false); setNotice({ kind: "success", text: editing ? "Dispositivo atualizado." : "Dispositivo cadastrado." }); await refresh();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível salvar o dispositivo." }); }
    finally { setBusy(""); }
  }

  async function deviceAction(device: Device, action: "approve" | "wake" | "delete") {
    setBusy(`${action}-${device.id}`); setNotice(null);
    try {
      if (action === "approve") await api(`/api/devices/${device.id}`, { method: "PATCH", body: JSON.stringify({ approved: true }) });
      if (action === "wake") await api(`/api/devices/${device.id}/wake`, { method: "POST", body: JSON.stringify({}) });
      if (action === "delete") {
        if (!window.confirm(`Remover ${device.name} da lista?`)) return;
        await api(`/api/devices/${device.id}`, { method: "DELETE" });
      }
      if (action === "wake") setNotice({ kind: "success", text: `Solicitação Wake-on-LAN enfileirada para o agente atender ${device.name}.` });
      else setNotice({ kind: "success", text: action === "approve" ? `${device.name} adicionado ao monitoramento.` : `${device.name} removido.` });
      await refresh();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "A ação não foi concluída." }); }
    finally { setBusy(""); }
  }

  if (loading || configured === null) {
    if (notice?.kind === "error") return <main className="auth-stage"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><Icon name="activity" /></span><span>Status<span className="brand-light">PC</span></span></div><div className="notice error" role="alert">{notice.text}</div><p className="muted">Confira a conexão do banco e as variáveis de ambiente do servidor.</p><button className="button primary" onClick={() => window.location.reload()}><Icon name="arrow-clockwise" /> Tentar novamente</button></div></main>;
    return <main className="auth-stage"><div className="auth-card loading-card"><span className="brand-mark"><Icon name="activity" /></span><div className="spinner-border spinner-border-sm text-primary" role="status" /><span>Preparando seu painel…</span></div></main>;
  }

  if (!authenticated) {
    return <main className="auth-stage">
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><Icon name="activity" /></span><span>Status<span className="brand-light">PC</span></span></div>
        <p className="eyebrow">MONITORAMENTO DA SUA REDE</p>
        <h1>{configured ? "Bem-vindo de volta" : "Prepare seu painel"}</h1>
        <p className="muted">{configured ? "Entre para acompanhar seus dispositivos e acordar seus computadores." : "Crie a conta administradora. Esta configuração acontece uma única vez."}</p>
        {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
        <form onSubmit={submitAuth} className="auth-form">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" />
          {!configured && <><label htmlFor="setup-token">Chave inicial do servidor</label><input id="setup-token" type="password" autoComplete="off" minLength={32} required value={setupToken} onChange={(event) => setSetupToken(event.target.value)} placeholder="ADMIN_SETUP_TOKEN" /></>}
          <label htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete={configured ? "current-password" : "new-password"} minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" />
          <button className="button primary full" disabled={busy === "auth"}>{busy === "auth" ? "Aguarde…" : configured ? "Entrar no painel" : "Criar administrador"}<Icon name="arrow-right" /></button>
        </form>
        <p className="auth-foot"><Icon name="shield-lock" /> {configured ? "Acesso protegido para um único administrador." : "Use a chave configurada no ambiente do servidor."}</p>
      </div>
      <div className="auth-aside"><div className="orb orb-one" /><div className="orb orb-two" /><div className="auth-aside-content"><div className="status-illustration"><div className="illustration-router"><Icon name="router" /></div><span className="pulse-dot dot-a" /><span className="pulse-dot dot-b" /><span className="pulse-dot dot-c" /><span className="connection-line line-a" /><span className="connection-line line-b" /><span className="connection-line line-c" /><div className="mini-device device-a"><Icon name="pc-display" /></div><div className="mini-device device-b"><Icon name="phone" /></div><div className="mini-device device-c"><Icon name="hdd-network" /></div></div><p className="eyebrow">SUA REDE, NUM SÓ LUGAR</p><h2>Veja o que está conectado.<br />Ligue o que precisar.</h2><p>Acompanhe seus equipamentos em tempo real e envie o comando Wake-on-LAN de qualquer lugar.</p></div></div>
    </main>;
  }

  return <main className="dashboard-shell">
    <aside className="sidebar">
      <a className="brand" href="#inicio"><span className="brand-mark"><Icon name="activity" /></span><span>Status<span className="brand-light">PC</span></span></a>
      <div className="sidebar-label">VISÃO GERAL</div>
      <button className="nav-item active"><Icon name="grid-1x2" /> Painel</button>
      <button className="nav-item" onClick={() => setFilter("all")}><Icon name="hdd-network" /> Dispositivos <span className="nav-count">{devices.length}</span></button>
      <div className="sidebar-label network-label">SUA REDE</div>
      <div className="network-status"><span className={`status-light ${agent?.connected ? "green" : "gray"}`} /><div><strong>Agente local</strong><small>{agent?.connected ? "Conectado" : "Desconectado"}</small></div><span className="network-more">···</span></div>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Icon name="lightbulb" /></div><strong>Primeira vez aqui?</strong><p>Instale o agente em um computador que fique ligado na sua rede.</p><button onClick={() => document.getElementById("agent-setup")?.scrollIntoView({ behavior: "smooth" })}>Configurar agente <Icon name="arrow-up-right" /></button></div><div className="account-row"><span className="avatar">{email ? email[0].toUpperCase() : "A"}</span><div className="account-name"><strong>Administrador</strong><small>{email}</small></div><button className="icon-button" onClick={logout} title="Sair" aria-label="Sair"><Icon name="box-arrow-right" /></button></div></div>
    </aside>
    <section className="main-column" id="inicio">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron-right" /><strong>Painel</strong></div><div className="topbar-right"><span className="live-indicator"><span /> Atualização a cada 30 s</span><button className="icon-button" onClick={() => void refresh(true)} aria-label="Atualizar"><Icon name="arrow-clockwise" /></button><span className="top-avatar">{email ? email[0].toUpperCase() : "A"}</span></div></header>
      <div className="content-wrap">
        <div className="page-heading"><div><p className="eyebrow">PAINEL DA SUA REDE</p><h1>Visão geral da rede <span className="wave">✦</span></h1><p className="muted">Acompanhe seus dispositivos e mantenha tudo ao seu alcance.</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void startScan()} disabled={busy === "scan"}><Icon name="broadcast-pin" />{busy === "scan" ? "Buscando…" : "Buscar dispositivos"}</button><button className="button primary" onClick={openNewDevice}><Icon name="plus-lg" /> Adicionar dispositivo</button></div></div>
        {notice && <div className={`notice inline-notice ${notice.kind}`} role="status"><span>{notice.text}</span><button aria-label="Fechar aviso" onClick={() => setNotice(null)}><Icon name="x-lg" /></button></div>}
        <div className="stat-grid">
          <article className="stat-card"><div className="stat-top"><span>DISPOSITIVOS</span><span className="stat-icon blue"><Icon name="hdd-network" /></span></div><div className="stat-value">{devices.filter((device) => device.approved).length}<small> cadastrados</small></div><div className="stat-foot"><span className="stat-neutral"><Icon name="arrow-up-right" /> {pendingCount} aguardando revisão</span></div></article>
          <article className="stat-card"><div className="stat-top"><span>ONLINE AGORA</span><span className="stat-icon green"><Icon name="wifi" /></span></div><div className="stat-value">{onlineCount}<small> dispositivos</small></div><div className="stat-foot"><span className="stat-positive"><span className="status-light green" /> Monitoramento ativo</span></div></article>
          <article className="stat-card"><div className="stat-top"><span>OFFLINE</span><span className="stat-icon amber"><Icon name="wifi" /></span></div><div className="stat-value">{offlineCount}<small> dispositivos</small></div><div className="stat-foot"><span className="stat-neutral">PCs configurados podem receber WOL</span></div></article>
          <article className="stat-card agent-stat"><div className="stat-top"><span>AGENTE LOCAL</span><span className={`stat-icon ${agent?.connected ? "green" : "gray"}`}><Icon name="cpu" /></span></div><div className="stat-value agent-value">{agent?.connected ? "Conectado" : "Não configurado"}</div><div className="stat-foot"><button className="text-action" onClick={() => document.getElementById("agent-setup")?.scrollIntoView({ behavior: "smooth" })}>{agent?.connected ? "Ver configuração" : "Configurar agente"} <Icon name="arrow-right" /></button></div></article>
        </div>
        <div className="section-heading"><div><h2>Dispositivos</h2><p>Equipamentos encontrados e acompanhados na sua rede.</p></div><button className="button ghost" onClick={() => void refresh(true)}><Icon name="arrow-clockwise" /> Atualizar</button></div>
        <div className="device-toolbar"><div className="filter-tabs"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Todos <span>{devices.length}</span></button><button className={filter === "online" ? "selected" : ""} onClick={() => setFilter("online")}>Online <span>{onlineCount}</span></button><button className={filter === "offline" ? "selected" : ""} onClick={() => setFilter("offline")}>Offline <span>{offlineCount}</span></button>{pendingCount > 0 && <button className={filter === "pending" ? "selected" : ""} onClick={() => setFilter("pending")}>Revisar <span>{pendingCount}</span></button>}</div><div className="device-search"><Icon name="search" /><input placeholder="Buscar dispositivo" aria-label="Buscar dispositivo" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div></div>
        {loading ? <div className="empty-state"><div className="spinner-border text-primary" role="status" /><p>Carregando dispositivos…</p></div> : visibleDevices.length === 0 ? <div className="empty-state"><div className="empty-icon"><Icon name={devices.length ? "search" : "hdd-network"} /></div><h3>{devices.length ? "Nenhum resultado" : "Sua rede ainda está vazia"}</h3><p>{devices.length ? "Tente outro filtro ou busca." : "Faça uma busca na rede ou cadastre um dispositivo manualmente para começar."}</p>{devices.length === 0 && <div className="empty-actions"><button className="button secondary" onClick={() => void startScan()}><Icon name="broadcast-pin" /> Buscar na rede</button><button className="button primary" onClick={openNewDevice}><Icon name="plus-lg" /> Adicionar dispositivo</button></div>}</div> : <div className="device-grid">{visibleDevices.map((device) => <article className={`device-card ${!device.approved ? "pending-card" : ""}`} key={device.id}>
          <div className="device-card-head"><DeviceGlyph type={device.type} color={device.color} /><span className={`device-status ${device.status}`}><span />{device.status === "online" ? "Online" : device.status === "offline" ? "Offline" : "Sem resposta"}</span><button className="icon-button card-menu" onClick={() => openEdit(device)} aria-label={`Editar ${device.name}`}><Icon name="three-dots" /></button></div>
          <h3>{device.name || device.hostname || "Dispositivo sem nome"}</h3><p className="device-subtitle">{typeLabels[device.type]}{confidenceLabel(device.typeConfidence) && <span> · {confidenceLabel(device.typeConfidence)} confiança</span>}{device.os ? ` · ${device.os}` : ""}{device.osConfidence === "low" ? " · sistema estimado" : ""}</p>
          {device.description && <p className="device-description">{device.description}</p>}
          <div className="device-details"><span><Icon name="globe2" /> {device.ip || "IP não identificado"}</span>{device.port !== null && <span><Icon name="ethernet" /> Porta {device.port}</span>}<span><Icon name="diagram-3" /> {device.mac || "MAC não identificado"}</span>{device.type === "PC" && device.wolEnabled && <span><Icon name="broadcast" /> WOL · UDP {device.wolPort}</span>}</div>
          <div className="device-card-footer">{!device.approved ? <><span className="pending-label"><Icon name="hourglass-split" /> Aguardando revisão</span><button className="button small primary" onClick={() => void deviceAction(device, "approve")} disabled={busy === `approve-${device.id}`}>Adicionar</button></> : <><span className="last-seen">{device.status === "online" ? "Ativo agora" : device.lastSeenAt ? `Visto ${new Date(device.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Ainda não detectado"}</span>{device.type === "PC" && device.wolEnabled && <button className="button small wake-button" onClick={() => void deviceAction(device, "wake")} disabled={busy === `wake-${device.id}` || !agent?.connected}><Icon name="power" /> {busy === `wake-${device.id}` ? "Enviando…" : "Ligar"}</button>}</>}</div>
        </article>)}</div>}
        <section className="agent-setup" id="agent-setup"><div className="agent-setup-icon"><Icon name="cpu" /></div><div className="agent-setup-copy"><span className="eyebrow">PASSO IMPORTANTE</span><h2>Seu agente local</h2><p>O agente precisa ficar ligado dentro da rede para encontrar dispositivos e enviar comandos Wake-on-LAN. Funciona em Windows e Linux.</p><div className="agent-setup-meta"><span><span className={`status-light ${agent?.connected ? "green" : "gray"}`} />{agent?.connected ? `Conectado${agent.name ? ` · ${agent.name}` : ""}` : "Aguardando conexão"}</span><span><Icon name="arrow-repeat" /> Verificação a cada 30 segundos</span></div></div><div className="agent-setup-actions"><button className="button secondary" onClick={() => void createPairingCode()} disabled={busy === "pair"}><Icon name="link-45deg" />{busy === "pair" ? "Gerando…" : "Parear agente"}</button><a href="#agent-install">Como instalar <Icon name="arrow-up-right" /></a></div>{pairCode && <div className="pair-code-box"><div><span className="eyebrow">CÓDIGO DE PAREAMENTO · EXPIRA {new Date(pairCode.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><strong>{pairCode.code}</strong></div><button className="button ghost" onClick={() => void navigator.clipboard?.writeText(pairCode.code)}><Icon name="copy" /> Copiar código</button></div>}<details className="agent-install" id="agent-install"><summary>Instalação do agente</summary><p>Use um computador Windows ou Linux conectado à mesma rede e mantenha-o ligado.</p><ol><li>Copie o projeto para esse computador e instale as dependências na raiz com <code>npm install</code>.</li><li>Compile o agente com <code>npm run build:agent</code>.</li><li>Configure <code>API_BASE_URL</code> com a URL HTTPS do servidor; use <code>http://localhost:3000</code> somente se o agente estiver no mesmo computador. Informe <code>PAIRING_CODE</code> com o código acima.</li><li>Inicie com <code>npm run start:agent</code>. Depois do pareamento inicial, configure o processo para iniciar como serviço do sistema.</li></ol><p>O agente verifica a rede e relata resultados; confirme manualmente as informações inferidas. O envio do pacote WOL não garante que o computador tenha sido ligado.</p></details></section>
        <footer className="page-footer"><span>StatusPC <span>·</span> Monitoramento local</span><span>Seus dados permanecem na sua rede.</span></footer>
      </div>
    </section>
    {deviceModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeviceModal(false); }}><section className="device-modal" role="dialog" aria-modal="true" aria-labelledby="device-modal-title"><div className="modal-heading"><div><span className="eyebrow">DISPOSITIVO</span><h2 id="device-modal-title">{editing ? "Editar dispositivo" : "Adicionar dispositivo"}</h2></div><button className="icon-button" aria-label="Fechar" onClick={() => setDeviceModal(false)}><Icon name="x-lg" /></button></div><form onSubmit={saveDevice}>
          <div className="form-grid">
            <label className="wide" htmlFor="device-name">Nome<input id="device-name" required maxLength={191} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Computador do escritório" /></label>
            <label htmlFor="device-type">Tipo<select id="device-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as DeviceType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor="device-color">Cor do dispositivo<span className="color-picker-field"><input id="device-color" type="color" value={form.color} aria-describedby="device-color-hint" onChange={(event) => setForm({ ...form, color: event.target.value.toUpperCase() })} /><span id="device-color-hint">Identificação visual no painel</span></span></label>
            <label className="wide" htmlFor="device-description">Descrição<textarea id="device-description" rows={3} maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Localização, função ou observações do dispositivo" /><span className="field-hint">{form.description.length}/500 caracteres</span></label>
            <label htmlFor="device-os">Sistema operacional<input id="device-os" maxLength={80} value={form.os} onChange={(event) => setForm({ ...form, os: event.target.value })} placeholder="Ex.: Windows 11" /></label>
            <label htmlFor="device-hostname">Nome na rede<input id="device-hostname" maxLength={191} value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} placeholder="hostname" /></label>
            <label htmlFor="device-ip">Endereço IP<input id="device-ip" inputMode="decimal" maxLength={45} value={form.ip} onChange={(event) => setForm({ ...form, ip: event.target.value })} placeholder="192.168.1.20" /></label>
            <label htmlFor="device-port">Porta do dispositivo<input id="device-port" type="number" min="1" max="65535" step="1" inputMode="numeric" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} placeholder="Opcional" /></label>
            <label htmlFor="device-mac">Endereço MAC<input id="device-mac" autoCapitalize="characters" maxLength={17} value={form.mac} onChange={(event) => setForm({ ...form, mac: event.target.value.toUpperCase() })} placeholder="AA:BB:CC:DD:EE:FF" /></label>
            <label htmlFor="device-broadcast">Broadcast da rede<input id="device-broadcast" inputMode="decimal" maxLength={45} value={form.broadcastAddress} onChange={(event) => setForm({ ...form, broadcastAddress: event.target.value })} placeholder="192.168.1.255" /></label>
            {form.type === "PC" && <>
              <label htmlFor="device-wol-port">Porta WOL<input id="device-wol-port" type="number" min="1" max="65535" step="1" inputMode="numeric" value={form.wolPort} onChange={(event) => setForm({ ...form, wolPort: event.target.value })} /></label>
              <label className="checkbox-field"><input type="checkbox" checked={form.wolEnabled} onChange={(event) => setForm({ ...form, wolEnabled: event.target.checked })} /> Wake-on-LAN habilitado</label>
            </>}
          </div>
          <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setDeviceModal(false)}>Cancelar</button><button className="button primary" disabled={busy === "save"}>{busy === "save" ? "Salvando…" : editing ? "Salvar alterações" : "Salvar dispositivo"}</button></div>
        </form></section></div>}
  </main>;
}
