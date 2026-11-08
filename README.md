# Status PC

Painel web/PWA para descobrir dispositivos da rede local, acompanhar disponibilidade e enviar pacotes Wake-on-LAN a computadores configurados para isso.

## Requisitos

- Node.js 26 LTS ou Node.js 24 LTS ou superior.
- MySQL compatÃ­vel com Prisma.
- Um computador Windows ou Linux sempre ligado na LAN para executar o agente.

## Iniciar o servidor na LAN

1. Instale as dependÃªncias: `npm install`.
2. Copie `.env.example` para `.env`, configure `DATABASE_URL` e troque `ADMIN_SETUP_TOKEN` por uma chave aleatÃ³ria de pelo menos 32 caracteres (por exemplo, gere-a com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).
3. Crie o banco e aplique o schema: `npm run db:generate` e `npm run db:push`.
4. Inicie o painel: `npm run dev` para desenvolvimento ou `npm run build` seguido de `npm start` para produÃ§Ã£o.
5. Abra o endereÃ§o do servidor na LAN. Na primeira visita, informe a chave `ADMIN_SETUP_TOKEN` e crie a conta administradora com senha de pelo menos 12 caracteres. Depois da criaÃ§Ã£o, a chave deixa de ser usada.

O acesso administrativo usa uma sessÃ£o HttpOnly com expiraÃ§Ã£o de sete dias. O sistema permite uma Ãºnica conta.

Em HTTP na LAN, o painel funciona no navegador, mas a instalaÃ§Ã£o PWA em celulares requer um contexto HTTPS seguro; ela ficarÃ¡ disponÃ­vel quando o domÃ­nio e o tÃºnel estiverem configurados.

## Instalar o agente local

Use um host que permaneÃ§a ligado e esteja conectado Ã  mesma LAN. Na raiz do projeto, compile com `npm run build:agent`. Gere um cÃ³digo no painel, entÃ£o configure no host do agente:

```powershell
$env:API_BASE_URL = "http://localhost:3000"
$env:PAIRING_CODE = "CODIGO-GERADO-NO-PAINEL"
$env:AGENT_NAME = "gateway-rede"
npm run start:agent
```

Use `localhost` quando o agente e o servidor estiverem no mesmo computador. Para um agente separado, use HTTPS com um certificado confiÃ¡vel. HTTP remoto sÃ³ Ã© permitido em uma LAN confiÃ¡vel com a opÃ§Ã£o explÃ­cita `ALLOW_INSECURE_AGENT_HTTP=true`. No Linux, exporte as mesmas variÃ¡veis e execute `npm run start:agent`. O primeiro pareamento consome o cÃ³digo e grava o token em `agent/.data/agent-token`. Em produÃ§Ã£o, configure o token no gerenciador seguro de variÃ¡veis e mantenha o processo como serviÃ§o do sistema com reinÃ­cio automÃ¡tico.

O agente consulta o servidor pela LAN, faz heartbeat, verifica os dispositivos aprovados a cada 30 segundos e recebe comandos de descoberta e WOL. Ele nÃ£o abre portas de entrada.

## Descoberta e Wake-on-LAN

- A busca usa interfaces IPv4 privadas RFC1918 do host do agente e limita cada varredura a 4094 endereÃ§os, com atÃ© 48 verificaÃ§Ãµes simultÃ¢neas.
- A descoberta depende de ICMP/ARP e DNS reverso. Firewalls, isolamento de clientes Wi-Fi, sub-redes diferentes e celulares com MAC aleatÃ³rio podem impedir a identificaÃ§Ã£o.
- O sistema operacional Ã© inferido pelo TTL de ping como indÃ­cio de baixa confianÃ§a. Revise e corrija os dados no painel.
- Um dispositivo sÃ³ entra no monitoramento depois de aprovado. VocÃª tambÃ©m pode cadastrÃ¡-lo manualmente.
- Para ligar um PC, habilite Wake-on-LAN no firmware e na placa de rede, cadastre o MAC correto e configure o broadcast da LAN. O painel confirma o envio do pacote, nÃ£o que o computador iniciou.
- Roteadores, modens e celulares podem ser monitorados enquanto respondem na LAN; WOL Ã© disponibilizado apenas para PCs.

## Acesso por dados mÃ³veis

O acesso remoto usa Cloudflare Tunnel atÃ© o servidor instalado na rede local. A funcionalidade local nÃ£o depende dele. A ativaÃ§Ã£o estÃ¡vel exige domÃ­nio configurado no Cloudflare; veja [`docs/cloudflare-tunnel.md`](docs/cloudflare-tunnel.md). NÃ£o encaminhe portas do MySQL nem do agente para a internet.

## Banco de dados

O schema Prisma guarda administrador, sessÃµes, dispositivos, agente, cÃ³digos de pareamento e comandos. Em desenvolvimento ou em um banco vazio, `npm run db:push` aplica o schema atual. Para uma implantaÃ§Ã£o nova em produÃ§Ã£o, gere uma migration em desenvolvimento com `npm run db:migrate -- --name statuspc_init`, revise e versione `prisma/migrations`, depois aplique-a com `npm run db:migrate:deploy`. Em uma base jÃ¡ existente sem histÃ³rico Prisma, faÃ§a o baseline e a transiÃ§Ã£o com cuidado; nÃ£o aplique migrations diretamente em ambientes externos sem validar backup e compatibilidade dos dados.
