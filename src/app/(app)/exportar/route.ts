import { usuarioAtual } from "@/lib/auth";
import { resumoBonificacoes, type Filtros } from "@/lib/consultas";
import { gerarPlanilha } from "@/lib/planilha";
import { prisma } from "@/lib/db";
import { codigoBoni, rotuloTipo } from "@/lib/regras";
import { num } from "@/lib/formato";

export async function GET(req: Request) {
  await usuarioAtual();
  const f = Object.fromEntries(new URL(req.url).searchParams) as Filtros;
  const linhas = await resumoBonificacoes(f);
  const ids = linhas.map((l) => l.id);
  const [itens, notas] = await Promise.all([
    prisma.itemAberto.findMany({ where: { bonificacaoId: { in: ids } }, include: { bonificacao: true, loja: true }, orderBy: { bonificacaoId: "asc" } }),
    prisma.recebimento.findMany({ where: { bonificacaoId: { in: ids } }, include: { bonificacao: true }, orderBy: { emissao: "asc" } }),
  ]);
  const moeda = "#,##0.00";
  const buf = await gerarPlanilha([
    {
      nome: "Resumo",
      colunas: [
        { titulo: "IDENTIFICAÇÃO ÚNICA", chave: "codigo" }, { titulo: "DATA SOLICITAÇÃO", chave: "dataSolicitacao", formato: "dd/mm/yyyy" },
        { titulo: "DATA EVENTO", chave: "dataEvento", formato: "dd/mm/yyyy" }, { titulo: "AREA ARMAZÉM", chave: "areaArmazem" },
        { titulo: "ÁREA AMBEV", chave: "areaAmbev" }, { titulo: "SUB ÁREA AMBEV", chave: "subareaAmbev" },
        { titulo: "DONO ARMAZÉM", chave: "donoArmazem" }, { titulo: "DONO AMBEV", chave: "donoAmbev" },
        { titulo: "REFERÊNCIA", chave: "referencia", largura: 40 }, { titulo: "TIPO DE PAGAMENTO", chave: "tipo" },
        { titulo: "VALOR À SER ABERTO", chave: "valorAbrir", formato: moeda }, { titulo: "LANÇADO (ITENS)", chave: "aberto", formato: moeda },
        { titulo: "RECEBIDO", chave: "recebido", formato: moeda }, { titulo: "DIF", chave: "diferenca", formato: moeda },
        { titulo: "STATUS", chave: "status" }, { titulo: "PENDÊNCIA", chave: "pend", largura: 40 },
      ],
      linhas: linhas.map((l) => ({ ...l, tipo: rotuloTipo(l.tipo), pend: l.pendencia ? `${l.pendencia.situacao} ${l.pendencia.campos.join(", ")}` : "" })),
    },
    {
      nome: "Itens abertos",
      colunas: [
        { titulo: "IDENTIFICAÇÃO ÚNICA", chave: "codigo" }, { titulo: "Loja", chave: "loja" }, { titulo: "Cód Produto", chave: "produtoCodigo" },
        { titulo: "Produto", chave: "descricao", largura: 40 }, { titulo: "Caixas", chave: "caixas" }, { titulo: "Un/cx", chave: "unidadesCaixa" },
        { titulo: "Unidades", chave: "unidades" }, { titulo: "TTV", chave: "ttv", formato: "#,##0.0000" }, { titulo: "Total", chave: "total", formato: moeda },
        { titulo: "Pontos", chave: "pontos" }, { titulo: "N° Pedido Bees", chave: "pedidoBees" }, { titulo: "Dt Entrega", chave: "dataEntrega", formato: "dd/mm/yyyy" },
        { titulo: "Status", chave: "statusEntrega" },
      ],
      linhas: itens.map((i) => ({
        ...i, codigo: codigoBoni(i.bonificacao.numero), loja: i.loja ? `${i.loja.codigo} - ${i.loja.nome}` : i.lojaCodigo,
        caixas: num(i.caixas), unidades: num(i.unidades), ttv: num(i.ttv), total: num(i.total), pontos: i.pontos ? num(i.pontos) : null,
      })),
    },
    {
      nome: "Recebimentos",
      colunas: [
        { titulo: "IDENTIFICAÇÃO ÚNICA", chave: "codigo" }, { titulo: "NF", chave: "nf" }, { titulo: "Emissão", chave: "emissao", formato: "dd/mm/yyyy" },
        { titulo: "Loja", chave: "lojaNome" }, { titulo: "Produto", chave: "produtoCodigo" }, { titulo: "Descrição", chave: "descricao", largura: 40 },
        { titulo: "Quantidade", chave: "quantidade" }, { titulo: "Valor total NF", chave: "valorTotal", formato: moeda },
        { titulo: "TOTAL R$ (tabela)", chave: "valorTabela", formato: moeda }, { titulo: "Pedido Bees", chave: "pedidoBees" },
      ],
      linhas: notas.map((n) => ({ ...n, codigo: n.bonificacao ? codigoBoni(n.bonificacao.numero) : "", quantidade: num(n.quantidade), valorTotal: num(n.valorTotal), valorTabela: num(n.valorTabela) })),
    },
  ]);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bonificacoes-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
