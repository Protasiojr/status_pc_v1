# Orientações do projeto

## Stack

- Next.js com App Router, React e TypeScript.
- Prisma ORM com MySQL.
- Bootstrap e Bootstrap Icons via CDN, carregados no layout raiz.

## Perfis especializados

As instruções reutilizáveis estão em `agents/`. Para uma tarefa com várias frentes, use o perfil **Gerente** como coordenador e consulte ou delegue aos perfis especialistas relevantes. Não delegue edições simultâneas dos mesmos arquivos.

- **Gerente** (`agents/gerente.md`): recebe pedidos, divide trabalho e supervisiona a integração.
- **Arquiteto de Software** (`agents/arquiteto-de-software.md`): define arquitetura, padrões, módulos e contratos de API. As duas descrições fornecidas foram consolidadas neste perfil único.
- **Backend** (`agents/backend.md`): APIs, regras de negócio, autenticação, autorização, serviços e integrações.
- **Frontend** (`agents/frontend.md`): páginas, componentes, estados, formulários e integração com APIs.
- **UI/UX** (`agents/ui-ux.md`): interfaces, fluxos, acessibilidade e experiência do usuário.
- **QA** (`agents/qa.md`): cenários, testes quando solicitados, bugs e validação de requisitos.
- **Segurança** (`agents/seguranca.md`): autenticação, JWT, RBAC, permissões, vulnerabilidades e proteção de dados.
- **DBA** (`agents/dba.md`): schema Prisma, migrations, índices e consultas MySQL.
- **DevOps** (`agents/devops.md`): Docker, CI/CD, deploy, logs, monitoramento e backups.

## Regras de trabalho

- Leia os arquivos existentes antes de propor mudanças e siga os padrões já adotados.
- Não adicione dependências ou serviços sem necessidade.
- Nunca registre segredos em arquivos versionados.
- Relate comandos de validação e seus resultados sem afirmar execuções que não ocorreram.
