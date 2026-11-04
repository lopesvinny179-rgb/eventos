// Consultas usadas pelas telas: resumo por bonificação, pendências e sugestões de associação.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { num } from "./formato";
import { codigoBoni, pendencia, statusCalculado, type Pendencia, type Tipo } from "./regras";

export type Filtros = { mes?: string; area?: string; dono?: string; tipo?: string; status?: string; busca?: string };

export type LinhaResumo = {
  id: number;
  codigo: string;
  numero: number;
  dataSolicitacao: Date;
  dataEvento: Date | null;
  areaArmazem: string;
  areaAmbev: string | null;
  subareaAmbev: string | null;
  donoArmazem: string | null;
  donoAmbev: string | null;
  referencia: string;
  tipo: Tipo;
  valorAbrir: number;
  aberto: number; // soma dos itens lançados
  recebido: number;
  diferenca: number;
  status: string;
  pendencia: Pendencia;
  itens: number;
  notas: number;
};

function where(f: Filtros): Prisma.BonificacaoWhereInput {
  const w: Prisma.BonificacaoWhereInput = {};
  if (f.mes) {
    const [m, a] = f.mes.split("/").map(Number);
    if (m && a) w.dataSolicitacao = { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) };
  }
  if (f.area) w.areaArmazem = f.area;
  if (f.dono) w.donoArmazem = f.dono;
  if (f.tipo) w.tipoPagamento = f.tipo as Tipo;
  if (f.busca) {
    const n = Number(f.busca.replace(/\D/g, ""));
    w.OR = [
      { referencia: { contains: f.busca, mode: "insensitive" } },
      { donoAmbev: { contains: f.busca, mode: "insensitive" } },
      ...(n ? [{ numero: n }] : []),
    ];
  }
  return w;
}

export async function resumoBonificacoes(f: Filtros = {}): Promise<LinhaResumo[]> {
  const bonis = await prisma.bonificacao.findMany({
    where: where(f),
    orderBy: { numero: "desc" },
    include: {
      itens: { select: { produtoCodigo: true, unidades: true, ttv: true, total: true, pedidoBees: true, dataEntrega: true, statusEntrega: true } },
    },
  });
  const ids = bonis.map((b) => b.id);
  const somas = await prisma.recebimento.groupBy({
    by: ["bonificacaoId"],
    where: { bonificacaoId: { in: ids } },
    _sum: { valorTabela: true },
    _count: true,
  });
  const porBoni = new Map(somas.map((s) => [s.bonificacaoId, s]));

  const linhas = bonis.map((b) => {
    const s = porBoni.get(b.id);
    const recebido = Math.round(num(s?._sum.valorTabela) * 100) / 100;
    const valorAbrir = num(b.valorAbrir);
    return {
      id: b.id,
      codigo: codigoBoni(b.numero),
      numero: b.numero,
      dataSolicitacao: b.dataSolicitacao,
      dataEvento: b.dataEvento,
      areaArmazem: b.areaArmazem,
      areaAmbev: b.areaAmbev,
      subareaAmbev: b.subareaAmbev,
      donoArmazem: b.donoArmazem,
      donoAmbev: b.donoAmbev,
      referencia: b.referencia,
      tipo: b.tipoPagamento,
      valorAbrir,
      aberto: Math.round(b.itens.reduce((a, i) => a + num(i.total), 0) * 100) / 100,
      recebido,
      diferenca: Math.round((recebido - valorAbrir) * 100) / 100,
      status: b.statusManual || statusCalculado(valorAbrir, recebido),
      pendencia: pendencia(b.tipoPagamento, b.itens),
      itens: b.itens.length,
      notas: s?._count ?? 0,
    };
  });
  return f.status ? linhas.filter((l) => l.status === f.status) : linhas;
}

export async function opcoesFiltro() {
  const [opcoes, meses] = await Promise.all([
    prisma.opcao.findMany({ where: { ativo: true }, orderBy: { valor: "asc" } }),
    prisma.$queryRaw<{ mes: string }[]>`
      select distinct to_char("dataSolicitacao", 'FMMM/YYYY') as mes, date_trunc('month', "dataSolicitacao") as d
      from "Bonificacao" order by d desc`,
  ]);
  const de = (t: string) => opcoes.filter((o) => o.tipo === t).map((o) => o.valor);
  return {
    meses: meses.map((m) => m.mes),
    areasArmazem: de("AREA_ARMAZEM"),
    areasAmbev: de("AREA_AMBEV"),
    subareasAmbev: de("SUBAREA_AMBEV"),
    donosArmazem: de("DONO_ARMAZEM"),
    donosAmbev: de("DONO_AMBEV"),
    alocacoes: de("ALOCACAO"),
  };
}

export type Sugestao = { bonificacaoId: number; codigo: string; referencia: string; motivo: string; forca: number };

/**
 * Sugere bonificações para notas sem vínculo:
 *  1. mesmo N° de pedido Bees de um item aberto (forte);
 *  2. mesma loja + produto de um item aberto, com entrega/solicitação até 60 dias antes da emissão (média).
 */
export async function sugestoesPara(recebimentoIds: number[]): Promise<Map<number, Sugestao[]>> {
  const r = new Map<number, Sugestao[]>();
  if (!recebimentoIds.length) return r;
  const linhas = await prisma.$queryRaw<
    { rid: number; bid: number; numero: number; referencia: string; motivo: string; forca: number }[]
  >`
    with n as (
      select id, "pedidoBees", "lojaCodigo", "produtoCodigo", coalesce(emissao, "dataAceite") as dt
      from "Recebimento" where id = any(${recebimentoIds}::int[])
    )
    select distinct on (n.id, b.id) n.id as rid, b.id as bid, b.numero, b.referencia, s.motivo, s.forca from n
    join lateral (
      select i."bonificacaoId", 'Mesmo pedido Bees' as motivo, 2 as forca
        from "ItemAberto" i where n."pedidoBees" is not null and i."pedidoBees" = n."pedidoBees"
      union all
      select i."bonificacaoId", 'Mesma loja e produto' as motivo, 1 as forca
        from "ItemAberto" i join "Bonificacao" bb on bb.id = i."bonificacaoId"
        where i."lojaCodigo" = n."lojaCodigo" and i."produtoCodigo" = n."produtoCodigo"
          and (n.dt is null or coalesce(i."dataEntrega", bb."dataSolicitacao") between n.dt - 60 and n.dt + 15)
    ) s on true
    join "Bonificacao" b on b.id = s."bonificacaoId"
    order by n.id, b.id, s.forca desc`;
  for (const l of linhas) {
    const lista = r.get(l.rid) ?? [];
    lista.push({ bonificacaoId: l.bid, codigo: codigoBoni(l.numero), referencia: l.referencia, motivo: l.motivo, forca: Number(l.forca) });
    r.set(l.rid, lista);
  }
  for (const lista of r.values()) lista.sort((a, b) => b.forca - a.forca);
  return r;
}
