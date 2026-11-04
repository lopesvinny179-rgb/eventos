// Regras de negócio que antes eram fórmulas da planilha mãe.
// Funções puras: sem banco, para poderem ser testadas.

export type Tipo = "DG" | "PONTO_BEES" | "DEPOSITO";

export const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: "DG", rotulo: "DG / BONIFICAÇÃO" },
  { valor: "PONTO_BEES", rotulo: "PONTO BEES" },
  { valor: "DEPOSITO", rotulo: "DEPÓSITO EM CONTA" },
];

export const rotuloTipo = (t: Tipo) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

/** Converte o texto da planilha ("DG / BONIFICAÇÃO", "PONTO BEES"...) no tipo do sistema. */
export function tipoDeTexto(s: unknown): Tipo | null {
  const t = String(s ?? "").toUpperCase();
  if (t.includes("PONTO")) return "PONTO_BEES";
  if (t.includes("DEP")) return "DEPOSITO";
  if (t.includes("DG") || t.includes("BONIF")) return "DG";
  return null;
}

export const PREFIXO = "IDENT_BONI_";
export const codigoBoni = (numero: number) => `${PREFIXO}${numero}`;

/** "IDENT_BONI_215" -> 215; aceita também só o número. */
export function numeroDoCodigo(s: unknown): number | null {
  const m = String(s ?? "").trim().toUpperCase().match(/^(?:IDENT_BONI_)?(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Fator de conversão R$ -> pontos Bees usado na aba Aberturas_Pontos (valor / 0,0079). */
export const FATOR_PONTOS_PADRAO = 0.0079;

export function calcularItem(e: {
  caixas?: number | null;
  unidadesCaixa?: number | null;
  ttv?: number | null;
  fatorPontos?: number;
  tipo?: Tipo;
}) {
  const caixas = e.caixas ?? null;
  const porCaixa = e.unidadesCaixa ?? 1;
  const unidades = caixas === null ? null : arred(caixas * porCaixa, 3);
  const total = unidades === null || e.ttv == null ? null : arred(unidades * e.ttv, 2);
  const pontos =
    e.tipo === "PONTO_BEES" && total !== null ? arred(total / (e.fatorPontos ?? FATOR_PONTOS_PADRAO), 2) : null;
  return { unidades, total, pontos };
}

export type Status = "Não identificado" | "Pagamento parcial" | "Finalizado" | "Recebido a maior";

/**
 * Status pelo que já foi recebido (soma do "TOTAL R$" das NFs vinculadas).
 * Tolerância padrão de 2%: diferenças de arredondamento de tabela não deixam a boni em aberto.
 */
export function statusCalculado(valorAbrir: number, recebido: number, tolerancia = 0.02): Status {
  if (recebido <= 0.005) return "Não identificado";
  const margem = Math.abs(valorAbrir) * tolerancia;
  if (recebido < valorAbrir - margem) return "Pagamento parcial";
  if (recebido > valorAbrir + margem) return "Recebido a maior";
  return "Finalizado";
}

export type ItemParaPendencia = {
  produtoCodigo?: string | null;
  unidades?: unknown;
  ttv?: unknown;
  total?: unknown;
  pedidoBees?: string | null;
  dataEntrega?: Date | null;
  statusEntrega?: string | null;
};

const CAMPOS: Record<Exclude<Tipo, "DEPOSITO">, [keyof ItemParaPendencia, string][]> = {
  DG: [
    ["pedidoBees", "N° Pedido Bees"],
    ["dataEntrega", "Dt Entrega"],
    ["statusEntrega", "Status"],
  ],
  PONTO_BEES: [
    ["produtoCodigo", "Produto"],
    ["unidades", "Qtde"],
    ["ttv", "TTV"],
    ["total", "TT R$"],
    ["pedidoBees", "N° Pedido Bees"],
    ["dataEntrega", "Dt Entrega"],
    ["statusEntrega", "Status"],
  ],
};

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export type Pendencia = { situacao: "Não lançada" | "Lançamento incompleto"; campos: string[] } | null;

/**
 * Mesmo critério da aba Pendências_Boni: sem itens = não lançada; um campo operacional
 * vazio em TODAS as linhas da identificação = lançamento incompleto.
 */
export function pendencia(tipo: Tipo, itens: ItemParaPendencia[]): Pendencia {
  if (tipo === "DEPOSITO") return null;
  if (itens.length === 0) return { situacao: "Não lançada", campos: [] };
  const campos = CAMPOS[tipo].filter(([k]) => itens.every((i) => vazio(i[k]))).map(([, r]) => r);
  return campos.length ? { situacao: "Lançamento incompleto", campos } : null;
}

/** Chave única de uma linha de NF; `ocorrencia` diferencia linhas idênticas dentro do mesmo arquivo. */
export function chaveRecebimento(r: {
  nf: string;
  lojaCodigo?: string | null;
  produtoCodigo?: string | null;
  quantidade: number;
  valorTotal: number;
  ocorrencia: number;
}) {
  return [r.nf, r.lojaCodigo ?? "", r.produtoCodigo ?? "", arred(r.quantidade, 3), arred(r.valorTotal, 2), r.ocorrencia].join("|");
}

/** Normaliza códigos com zeros à esquerda: 18 -> "000018", "17" (loja) -> "017". */
export function codigo(v: unknown, tamanho: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? s.padStart(tamanho, "0") : s;
}

export function arred(v: number, casas: number) {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}
