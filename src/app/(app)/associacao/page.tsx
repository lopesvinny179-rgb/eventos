import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sugestoesPara } from "@/lib/consultas";
import { codigoBoni } from "@/lib/regras";
import { data, num } from "@/lib/formato";
import { FilaAssociacao } from "@/components/FilaAssociacao";

type F = { area?: string; loja?: string; mes?: string; busca?: string };
const POR_PAGINA = 300;

export default async function Associacao({ searchParams }: { searchParams: Promise<F> }) {
  const f = await searchParams;
  const area = f.area ?? "Eventos";
  const w: Prisma.RecebimentoWhereInput = { bonificacaoId: null };
  if (area === "(sem área)") w.alocacao = null;
  else if (area !== "(todas)") w.alocacao = { equals: area, mode: "insensitive" };
  if (f.loja) w.lojaCodigo = f.loja;
  if (f.mes) {
    const [m, a] = f.mes.split("/").map(Number);
    if (m && a) w.emissao = { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) };
  }
  if (f.busca) w.OR = [{ nf: { contains: f.busca } }, { descricao: { contains: f.busca, mode: "insensitive" } }, { pedidoBees: { contains: f.busca } }, { observacao: { contains: f.busca, mode: "insensitive" } }];

  const [notas, total, areas, lojas, bonis, alocacoes] = await Promise.all([
    prisma.recebimento.findMany({ where: w, orderBy: [{ emissao: "desc" }, { nf: "asc" }], take: POR_PAGINA }),
    prisma.recebimento.count({ where: w }),
    prisma.recebimento.groupBy({ by: ["alocacao"], where: { bonificacaoId: null }, _count: true }),
    prisma.loja.findMany({ orderBy: { codigo: "asc" } }),
    prisma.bonificacao.findMany({ orderBy: { numero: "desc" }, select: { id: true, numero: true, referencia: true } }),
    prisma.opcao.findMany({ where: { tipo: "ALOCACAO", ativo: true }, orderBy: { valor: "asc" } }),
  ]);
  const sug = await sugestoesPara(notas.map((n) => n.id));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Associação de NFs</h1>
      <p className="text-sm text-stone-600">Notas recebidas que ainda não estão ligadas a uma bonificação. Selecione as linhas e escolha a bonificação, ou use a sugestão da linha.</p>
      <form className="cartao grid grid-cols-2 gap-2 md:grid-cols-5">
        <div>
          <label className="rotulo">Área da nota</label>
          <select className="input" name="area" defaultValue={area}>
            <option value="(todas)">Todas</option>
            {areas.map((a) => <option key={a.alocacao ?? "-"} value={a.alocacao ?? "(sem área)"}>{a.alocacao ?? "(sem área)"} ({a._count})</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo">Loja</label>
          <select className="input" name="loja" defaultValue={f.loja ?? ""}><option value="">Todas</option>{lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.codigo} - {l.nome}</option>)}</select>
        </div>
        <div><label className="rotulo">Mês emissão (m/aaaa)</label><input className="input" name="mes" defaultValue={f.mes} placeholder="10/2026" /></div>
        <div><label className="rotulo">Busca</label><input className="input" name="busca" defaultValue={f.busca} placeholder="NF, produto, pedido..." /></div>
        <div className="flex items-end"><button className="btn">Filtrar</button></div>
      </form>
      <p className="text-sm text-stone-600">{total} notas na fila{total > POR_PAGINA && ` (mostrando as ${POR_PAGINA} mais recentes)`}.</p>
      <FilaAssociacao
        notas={notas.map((n) => ({
          id: n.id, nf: n.nf, emissao: data(n.emissao), loja: n.lojaNome ?? n.lojaCodigo ?? "", produto: `${n.produtoCodigo ?? ""} ${n.descricao ?? ""}`.trim(),
          quantidade: num(n.quantidade), valor: num(n.valorTabela ?? n.valorTotal), pedidoBees: n.pedidoBees, alocacao: n.alocacao, observacao: n.observacao,
          sugestoes: sug.get(n.id) ?? [],
        }))}
        bonis={bonis.map((b) => ({ id: b.id, rotulo: `${codigoBoni(b.numero)} · ${b.referencia}` }))}
        alocacoes={alocacoes.map((a) => a.valor)}
      />
    </div>
  );
}
