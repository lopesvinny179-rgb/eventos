# Eventos e Bonificações

Plataforma web que substitui a planilha "Abertura de eventos Centralizado" para controlar as bonificações (DG, Ponto Bees e depósito), desde a abertura até o recebimento das notas.

## O que o sistema faz

- **Cadastro de bonificação**: o código `IDENT_BONI_xxx` é gerado automaticamente. Áreas, donos e subáreas aparecem como listas, e valores novos entram nelas.
- **Produtos abertos**: lançamento manual ou por planilha, a partir do modelo ou do formato da aba Aberturas_DG. Unidades, total e pontos Bees são calculados, e TTV e unidades por caixa vêm do cadastro do produto quando não são informados.
- **Importação de NFs do FWI** no formato Boni_entrada / Base_recebimentos. Linhas já importadas são ignoradas. Se a planilha trouxer a identificação da boni, a nota já entra vinculada.
- **Associação de NFs**: fila das notas sem bonificação, com sugestão por pedido Bees ou por loja + produto + período, seleção da NF inteira com um clique e marcação de área (Comercial, Crédito Armazém...).
- **Painel**: total aberto × recebido × diferença por bonificação, com filtros e exportação para Excel.
- **Pendências**: mesmo critério da aba Pendências_Boni (não lançada / lançamento incompleto e quais campos faltam), mais a lista das que ainda aguardam recebimento.
- **Cadastros**: produtos e TTV (importando a Tabela Atual Ambev), lojas, listas, fator de pontos e usuários.

Regras de cálculo: `src/lib/regras.ts` (com testes em `regras.test.ts`).

- Unidades = caixas × unidades por caixa; total = unidades × TTV.
- Pontos Bees = total ÷ 0,0079 (fator editável em Cadastros).
- Recebido = soma do "TOTAL R$" (quantidade × tabela vigente) das NFs vinculadas.
- Status: Não identificado (nada recebido), Pagamento parcial, Finalizado (até 2% de diferença) ou Recebido a maior. Um status manual, quando preenchido, prevalece.

## Tecnologia

Next.js 15 (App Router, server actions) + Prisma + PostgreSQL, Tailwind e ExcelJS. O login usa e-mail e senha, com sessão assinada em cookie.

## Rodar localmente

```bash
cp .env.example .env         # ajuste DATABASE_URL, DIRECT_URL e AUTH_SECRET
npm install
npx prisma db push           # cria as tabelas
npm run criar-usuario -- voce@armazemdacerveja.com.br "Seu Nome" uma-senha-forte --admin
npm run dev                  # http://localhost:3000
```

## Carga inicial do histórico

Os dados da empresa **não ficam no repositório**: `.xlsx`, `.xlsm` e `dados/` estão no `.gitignore`. A carga roda a partir das planilhas, na sua máquina:

```bash
pip install openpyxl "psycopg[binary]"
DATABASE_URL="postgresql://..." python3 scripts/carga_inicial.py \
  --mae "Abertura de eventos Centralizado- 2026.xlsx" \
  --compras "Compras_Sistema FWI.xlsm" --anos 2026
```

A carga lê lojas (Dados_lojas, De-para), produtos e TTV (Tabela Atual Ambev), bonificações (Consolidado_aberturas), itens (Aberturas_DG, Aberturas_Pontos) e notas (Boni_entrada_2026 e Base_recebimentos). No fim, ela compara o recebido de cada bonificação com o Resumo 2. Pode ser rodada de novo sem duplicar nada. Para incluir anos anteriores, use `--anos 2026,2025,2024`.

## Publicar (Supabase + Vercel)

1. **Supabase** (banco): crie um projeto em supabase.com. Em *Project Settings → Database → Connection string*, copie a URI do *Transaction pooler* (porta 6543, acrescente `?pgbouncer=true`) para `DATABASE_URL` e a *Direct connection* (porta 5432) para `DIRECT_URL`.
2. Na sua máquina, com essas variáveis no `.env`: `npx prisma db push`, depois `npm run criar-usuario -- ... --admin` e, se quiser, a carga inicial acima.
3. **Vercel** (site): importe este repositório em vercel.com/new e cadastre as variáveis `DATABASE_URL`, `DIRECT_URL` e `AUTH_SECRET` (gere com `openssl rand -base64 32`). Cada alteração na branch `main` publica sozinha.
4. Entre com o usuário administrador e crie os demais em **Cadastros → Usuários**.
