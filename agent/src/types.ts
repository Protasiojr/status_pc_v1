export type Platform = "windows" | "linux";

export interface DeviceCandidate {
  hostname: string | null;
  ip: string;
  mac: string | null;
  os: "WINDOWS" | "LINUX" | null;
  osConfidence: "low" | "medium" | "high" | null;
  type: "PC" | "ROUTER" | "MODEM" | "MOBILE" | "OTHER";
  typeConfidence: "low" | "medium" | "high";
}

export interface KnownDevice {
  id?: string;
  deviceId?: string;
  ip: string;
  mac: string | null;
  hostname?: string | null;
  os?: "WINDOWS" | "LINUX" | null;
}

export interface StatusReport {
  id?: string;
  mac: string | null;
  ip: string;
  online: boolean;
  hostname?: string;
  os?: "WINDOWS" | "LINUX";
  osConfidence?: "low" | "medium" | "high";
}

export type AgentCommand =
  | { id: number | string; type: "DISCOVER"; payload?: { cidr?: string } }
  | {
      id: number | string;
      type: "WOL";
      payload: {
        deviceId: number | string;
        mac: string;
        broadcastAddress: string;
        port?: number;
      };
    }
  | {
      id: number | string;
      type: "PING_DEVICES";
      payload: { devices: KnownDevice[] };
    };
