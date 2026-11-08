# Status PC

Painel web/PWA para descobrir dispositivos da rede local, acompanhar disponibilidade e enviar pacotes Wake-on-LAN a computadores configurados para isso.

## Requisitos

- Node.js 26 LTS ou Node.js 24 LTS ou superior.
- MySQL compatível com Prisma.
- Um computador Windows ou Linux sempre ligado na LAN para executar o agente.

## Iniciar o servidor na LAN

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env`, configure `DATABASE_URL` e troque `ADMIN_SETUP_TOKEN` por uma chave aleatória de pelo menos 32 caracteres (por exemplo, gere-a com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).
3. Crie o banco e aplique o schema: `npm run db:generate` e `npm run db:migrate:deploy`. Para protótipos locais, `npm run db:push` também pode ser usado.
4. Inicie o painel: `npm run dev` para desenvolvimento ou `npm run build` seguido de `npm start` para produção.
5. Abra o endereço do servidor na LAN. Na primeira visita, informe a chave `ADMIN_SETUP_TOKEN` e crie a conta administradora com senha de pelo menos 12 caracteres. Depois da criação, a chave deixa de ser usada.

O acesso administrativo usa uma sessão HttpOnly com expiração de sete dias. O sistema permite uma única conta.

Em HTTP na LAN, o painel funciona no navegador, mas a instalação PWA em celulares requer um contexto HTTPS seguro; ela ficará disponível quando o domínio e o túnel estiverem configurados.

## Instalar o agente local

Use um host que permaneça ligado e esteja conectado à mesma LAN. Na raiz do projeto, compile com `npm run build:agent`. Gere um código no painel, então configure no host do agente:

```powershell
$env:API_BASE_URL = "http://localhost:3000"
$env:PAIRING_CODE = "CODIGO-GERADO-NO-PAINEL"
$env:AGENT_NAME = "gateway-rede"
npm run start:agent
```

Use `localhost` quando o agente e o servidor estiverem no mesmo computador. Para um agente separado, use HTTPS com um certificado confiável. HTTP remoto só é permitido em uma LAN confiável com a opção explícita `ALLOW_INSECURE_AGENT_HTTP=true`. No Linux, exporte as mesmas variáveis e execute `npm run start:agent`. O primeiro pareamento consome o código e grava o token em `agent/.data/agent-token`. Em produção, configure o token no gerenciador seguro de variáveis e mantenha o processo como serviço do sistema com reinício automático.

O agente consulta o servidor pela LAN, faz heartbeat, verifica os dispositivos aprovados a cada 30 segundos e recebe comandos de descoberta e WOL. Ele não abre portas de entrada.

## Descoberta e Wake-on-LAN

- A busca usa interfaces IPv4 privadas RFC1918 do host do agente e limita cada varredura a 4094 endereços, com até 48 verificações simultâneas.
- A descoberta usa ICMP/ARP, DNS reverso, gateway padrão e tentativas TCP curtas em portas comuns. Firewalls, isolamento Wi-Fi e dispositivos que não respondem a ping podem impedir a identificação.
- Tipo e sistema operacional são estimados por heurísticas e exibem confiança; revise os resultados no painel. Celulares sem hostname ou serviços detectáveis podem não ser encontrados. A identificação universal de celulares exige dados do roteador/DHCP.
- Um dispositivo só entra no monitoramento depois de aprovado. Você também pode cadastrá-lo manualmente.
- Para ligar um PC, habilite Wake-on-LAN no firmware e na placa de rede, cadastre o MAC correto e configure o broadcast da LAN. O painel confirma o envio do pacote, não que o computador iniciou.
- Roteadores, modens e celulares podem ser monitorados enquanto respondem na LAN; WOL é disponibilizado apenas para PCs.

## Acesso por dados móveis

O acesso remoto usa Cloudflare Tunnel até o servidor instalado na rede local. A funcionalidade local não depende dele. A ativação estável exige domínio configurado no Cloudflare; veja [`docs/cloudflare-tunnel.md`](docs/cloudflare-tunnel.md). Não encaminhe portas do MySQL nem do agente para a internet.

## Banco de dados

O schema Prisma guarda administrador, sessões, dispositivos, agente, códigos de pareamento e comandos. Bancos novos usam a migration inicial versionada com `npm run db:migrate:deploy`. Para protótipos locais, `npm run db:push` aplica o schema sem criar histórico de migrations.

Se o banco já tiver sido criado com `db push` e ainda não tiver histórico Prisma, faça backup e confirme que todas as tabelas e colunas correspondem ao schema antes de registrar o baseline com `npx prisma migrate resolve --applied 20261107190000_init`. Só então use `npm run db:migrate:deploy` para atualizações futuras. Não execute a migration inicial diretamente sobre tabelas existentes: ela cria o schema completo e não é uma migration incremental para bancos já povoados.
