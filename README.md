# Next.js + Prisma + MySQL

## Preparar o ambiente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` para seu MySQL.
3. Crie o banco de dados indicado na URL.
4. Gere o Prisma Client e aplique o schema:

```bash
npm run db:generate
npm run db:push
```

Para desenvolvimento, inicie com `npm run dev` e abra http://localhost:3000.
Use `npm run db:studio` para abrir o Prisma Studio.

O modelo `Example` em `prisma/schema.prisma` é apenas uma estrutura inicial e pode ser substituído pelos modelos do projeto.
