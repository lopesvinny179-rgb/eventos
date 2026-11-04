// Leitura e geração de planilhas .xlsx (ExcelJS), com cabeçalhos tolerantes a acentos e espaços.
import ExcelJS from "exceljs";

export type Linha = { numero: number; valores: Record<string, unknown> };

/** "  N° Pedido Bees " -> "n pedido bees"; "ÁREA AMBEV (Eventos)" -> "area ambev eventos" */
export function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[°º]/g, "")
    .replace(/ /g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valorCelula(c: ExcelJS.CellValue): unknown {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return c;
  if (typeof c === "object") {
    if ("result" in c) return valorCelula((c as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in c) return (c as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in c) return (c as ExcelJS.CellHyperlinkValue).text;
    if ("error" in c) return null;
  }
  return c;
}

/**
 * Lê a primeira aba (ou a aba `nomeAba`) e devolve as linhas como objetos com chaves normalizadas.
 * O cabeçalho é a primeira linha (entre as 15 primeiras) que contém `colunaObrigatoria`.
 * Colunas repetidas recebem sufixo " 2", " 3"...
 */
export async function lerPlanilha(
  buffer: ArrayBuffer,
  colunasObrigatorias: string[],
  nomeAba?: string,
): Promise<{ linhas: Linha[]; cabecalho: string[]; aba: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const abas = nomeAba ? [wb.getWorksheet(nomeAba)].filter(Boolean) : wb.worksheets;
  const procurar = colunasObrigatorias.map(normalizar);

  for (const ws of abas as ExcelJS.Worksheet[]) {
    let linhaCab = 0;
    let cabecalho: string[] = [];
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map((v) => normalizar(valorCelula(v)));
      if (procurar.some((p) => vals.includes(p))) {
        linhaCab = r;
        const vistos = new Map<string, number>();
        cabecalho = vals.map((v) => {
          if (!v) return "";
          const n = (vistos.get(v) ?? 0) + 1;
          vistos.set(v, n);
          return n === 1 ? v : `${v} ${n}`;
        });
        break;
      }
    }
    if (!linhaCab) continue;

    const linhas: Linha[] = [];
    for (let r = linhaCab + 1; r <= ws.rowCount; r++) {
      const vals = ws.getRow(r).values as ExcelJS.CellValue[];
      const obj: Record<string, unknown> = {};
      let algum = false;
      cabecalho.forEach((h, i) => {
        if (!h) return;
        const v = valorCelula(vals[i]);
        if (v !== null && v !== "") algum = true;
        obj[h] = typeof v === "string" ? v.trim() : v;
      });
      if (algum) linhas.push({ numero: r, valores: obj });
    }
    return { linhas, cabecalho: cabecalho.filter(Boolean), aba: ws.name };
  }
  throw new Error(`Não encontrei o cabeçalho na planilha. Ela precisa ter a coluna "${colunasObrigatorias[0]}".`);
}

/** Pega o primeiro valor presente entre vários nomes possíveis de coluna. */
export function campo(v: Record<string, unknown>, ...nomes: string[]): unknown {
  for (const n of nomes) {
    const x = v[normalizar(n)];
    if (x !== null && x !== undefined && x !== "") return x;
  }
  return null;
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "N/A" ? null : s;
}

/** Aceita número, "1.234,56", "1234.56". */
export function numeroBr(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Aceita Date, "dd/mm/aaaa", "aaaa-mm-dd" e número serial do Excel. Devolve data em UTC. */
export function dataBr(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\/(\d{4})$/); // "5/2026"
  if (m) return new Date(Date.UTC(+m[2], +m[1] - 1, 1));
  return null;
}

export type Coluna = { titulo: string; chave: string; largura?: number; formato?: string };

export async function gerarPlanilha(abas: { nome: string; colunas: Coluna[]; linhas: Record<string, unknown>[] }[]) {
  const wb = new ExcelJS.Workbook();
  for (const a of abas) {
    const ws = wb.addWorksheet(a.nome);
    ws.columns = a.colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura ?? 16, style: c.formato ? { numFmt: c.formato } : undefined }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    a.linhas.forEach((l) => ws.addRow(l));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
