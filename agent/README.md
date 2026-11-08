# Status PC Agent

Agente local para descoberta assistida de dispositivos, verificacao basica de estado e envio de pacotes Wake-on-LAN. Requer Node.js 24 LTS ou 26 LTS e funciona em Windows e Linux. Deve permanecer ligado em um equipamento conectado a LAN.

## Build e execucao

O agente usa o TypeScript instalado pelo projeto raiz e nao adiciona dependencias.

```powershell
npm run build:agent
```

Defina as variaveis e inicie:

```powershell
$env:API_BASE_URL = "http://localhost:3000"
$env:PAIRING_CODE = "CODIGO-GERADO-NO-PAINEL"
$env:AGENT_NAME = "gateway-rede"
npm run start:agent
```

Use `localhost` quando o agente e o servidor estiverem no mesmo computador. Para outro host, use HTTPS com certificado confiavel. HTTP remoto exige `ALLOW_INSECURE_AGENT_HTTP=true` e deve ser usado apenas em uma LAN confiavel. No Linux, exporte as mesmas variaveis antes de executar `npm run start:agent`.

Na primeira execucao, o agente consome o codigo e guarda o token em `agent/.data/agent-token`, arquivo excluido do Git. Em servicos permanentes, prefira informar `AGENT_TOKEN` pelo gerenciador seguro de variaveis. `PAIRING_CODE` e usado somente no primeiro pareamento.

## Configuracao

| Variavel | Obrigatoria | Padrao | Uso |
| --- | --- | --- | --- |
| `API_BASE_URL` | Sim | — | URL do servidor Status PC; HTTP e aceito somente em loopback por padrao. |
| `AGENT_TOKEN` | Nao | Token salvo localmente | Token obtido no pareamento. |
| `PAIRING_CODE` | Primeiro uso | — | Codigo de uso unico gerado no painel. |
| `AGENT_NAME` | Nao | Nome do host | Nome mostrado para identificar o agente. |
| `ALLOW_INSECURE_AGENT_HTTP` | Nao | `false` | Permite HTTP fora de loopback; use somente em LAN confiavel. |
| `POLL_INTERVAL_MS` | Nao | `5000` | Intervalo entre consultas sem comandos; minimo 1000 ms. |

## Operacao de rede

- O agente consulta heartbeat e fila de comandos pelo servidor; nao abre portas de entrada.
- A varredura CIDR e limitada a IPv4 privado RFC1918, sub-redes diretamente conectadas ao host do agente e a ate 4094 hosts por execucao, com no maximo 48 hosts processados em paralelo. Para hosts que respondem a ping, o agente tenta conexoes TCP curtas em um conjunto fixo de portas comuns; ele nao envia comandos de aplicacao nem autentica em dispositivos.
- Sem CIDR no comando, sao usados os segmentos privados IPv4 elegiveis das interfaces locais.
- A identificacao do sistema operacional e do tipo usa portas TCP comuns, o TTL ICMP, o nome reverso e o gateway padrao como sinais heurísticos. A API persiste `osConfidence` e `typeConfidence` (`low`, `medium` ou `high`); revise as inferencias no painel. Sem evidencias suficientes, o tipo fica como `OTHER`.
- Celulares podem nao responder a ping, nao publicar nome DNS e usar MAC aleatorio. Sem dados do roteador/DHCP, nao ha deteccao universal de celulares; os que nao oferecem sinais observaveis podem nao aparecer ou ficam como `OTHER`.
- A descoberta depende de ICMP/ARP e DNS reverso; firewalls e isolamento Wi-Fi podem ocultar dispositivos ou gerar estado incorreto.
- Wake-on-LAN envia o pacote magico por UDP para o broadcast privado indicado pelo servidor, na porta 9 por padrao. O agente confirma o envio do pacote, nao que o computador iniciou.

## Contrato HTTP

Todas as rotas sao relativas a `API_BASE_URL`.

- `POST /api/agent/pair` `{ code, name, platform }` → `{ agentId, agentToken }` (sem bearer).
- `POST /api/agent/heartbeat` `{}`.
- `GET /api/agent/commands/next` → `{ command: null | { id, type, payload } }`.
- `POST /api/agent/discovery` `{ devices: [{ hostname, ip, mac, os, osConfidence, type, typeConfidence }] }`.
- `POST /api/agent/status` `{ devices: [{ id?, mac, ip, online, hostname?, os?, osConfidence? }] }`.
- `POST /api/agent/commands/:id/result` `{ status: "success" | "failed", message? }`.

O agente trata `DISCOVER` (`payload.cidr?`), `PING_DEVICES` (`payload.devices`) e `WOL` (`payload.deviceId`, `mac`, `broadcastAddress`, `port?`).

## Servico em segundo plano

Em producao, compile o projeto e configure `node agent/dist/main.js` como servico do Windows ou unidade `systemd` do Linux. Configure as variaveis em local seguro e habilite reinicializacao automatica.
