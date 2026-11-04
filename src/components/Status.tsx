const CORES: Record<string, string> = {
  "Não identificado": "bg-red-100 text-red-800",
  "Pagamento parcial": "bg-amber-100 text-amber-800",
  Finalizado: "bg-green-100 text-green-800",
  "Recebido a maior": "bg-sky-100 text-sky-800",
  "Não lançada": "bg-red-100 text-red-800",
  "Lançamento incompleto": "bg-amber-100 text-amber-800",
};

export function Selo({ texto }: { texto: string }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${CORES[texto] ?? "bg-stone-100 text-stone-700"}`}>{texto}</span>;
}
