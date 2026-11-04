// Formatação no padrão brasileiro.
type Num = number | string | { toString(): string } | null | undefined;

export function num(v: Num): number {
  if (v === null || v === undefined || v === "") return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dec = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const moeda = (v: Num) => brl.format(num(v));
export const numero = (v: Num) => dec.format(num(v));

export function data(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function mesAno(d: Date | null | undefined) {
  if (!d) return "";
  return `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/** yyyy-mm-dd para inputs de data */
export function dataInput(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}
