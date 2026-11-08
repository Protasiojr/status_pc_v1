# Suíte de testes

Execute todos os testes uma vez com `npm test`. Para execução contínua durante o desenvolvimento, use `npm run test:watch`.

Os testes das rotas de API usam mocks para Prisma e autenticação. Os testes de interface simulam as chamadas HTTP. A suíte não conecta nem altera o banco MySQL local.

O conjunto atual cobre operações de CRUD, validações de cadastro, descoberta, envio Wake-on-LAN e os fluxos correspondentes das telas.
