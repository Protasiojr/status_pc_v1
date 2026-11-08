# Publicar o painel com Cloudflare Tunnel

O painel pode ser usado pela LAN antes de configurar o acesso remoto. Para acesso estável por dados móveis, é necessário um domínio ativo na Cloudflare e um servidor com saída para a internet. O túnel cria uma rota de um hostname público até o serviço local; não é necessário abrir uma porta de entrada no roteador.

## Preparação quando houver domínio

1. Configure o domínio na conta Cloudflare e confirme que o DNS está gerenciado por ela.
2. No painel Cloudflare, crie um túnel remotamente gerenciado em **Networking → Tunnels**.
3. Adicione uma rota do tipo **Published application** com o subdomínio escolhido, por exemplo `status.seudominio.com`, apontando para `http://localhost:3000` (ou para o IP local do servidor e a porta usada pelo Next.js).
4. Instale `cloudflared` no servidor que executa o painel e inicie o conector usando o comando de instalação mostrado pelo Cloudflare.
5. Armazene o token do túnel no gerenciador seguro de serviços do sistema operacional. Não o coloque em `.env.example`, no Git ou em logs.
6. Verifique o painel primeiro pela LAN e depois pelo hostname público usando dados móveis. Confirme login, sessão e chamadas autenticadas da PWA.

O token do túnel permite iniciar o conector e deve ser tratado como segredo. Exponha somente o serviço HTTP do painel. Não crie rotas para MySQL, SSH, pastas locais ou portas de controle do agente. O painel continua exigindo a conta administradora mesmo atrás do túnel.

Mantenha o firewall do roteador sem encaminhamento de portas da internet para o servidor. O túnel inicia conexões de saída para a Cloudflare; não publique diretamente a porta 3000. O HTTPS do hostname também fornece o contexto seguro necessário para instalar a PWA.

## Operação

- Configure `cloudflared` como serviço do sistema, com inicialização automática e reinício em falhas.
- Acompanhe o estado do túnel e mantenha o `cloudflared` atualizado.
- A aplicação e o agente podem continuar operando na LAN enquanto o túnel estiver parado.
- Quick Tunnels geram endereços temporários e não substituem o hostname permanente da PWA.

Referências oficiais: [configurar e publicar uma aplicação](https://developers.cloudflare.com/tunnel/get-started/), [roteamento de aplicações](https://developers.cloudflare.com/tunnel/concepts/routing/) e [tokens de túnel](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/).
