"use client";
import { useMemo, useState, useTransition } from "react";
import { associar, definirAlocacao } from "@/app/(app)/acoes";
import type { Sugestao } from "@/lib/consultas";

type Nota = { id: number; nf: string; emissao: string; loja: string; produto: string; quantidade: number; valor: number; pedidoBees: string | null; alocacao: string | null; observacao: string | null; sugestoes: Sugestao[] };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function FilaAssociacao({ notas, bonis, alocacoes }: { notas: Nota[]; bonis: { id: number; rotulo: string }[]; alocacoes: string[] }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [alvo, setAlvo] = useState("");
  const [aloc, setAloc] = useState("");
  const [pendente, iniciar] = useTransition();
  const soma = useMemo(() => notas.filter((n) => sel.has(n.id)).reduce((a, n) => a + n.valor, 0), [sel, notas]);
  const alvoId = bonis.find((b) => b.rotulo === alvo)?.id;

  const alternar = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** Seleciona todas as linhas da mesma NF. */
  const selecionarNf = (nf: string) => setSel((s) => new Set([...s, ...notas.filter((n) => n.nf === nf).map((n) => n.id)]));
  const exec = (f: () => Promise<unknown>) => iniciar(async () => { await f(); setSel(new Set()); });

  return (
    <div className="space-y-2">
      <div className="cartao sticky top-0 z-10 flex flex-wrap items-end gap-2">
        <div className="text-sm"><b>{sel.size}</b> selecionadas · {brl.format(soma)}</div>
        <div className="min-w-72 flex-1">
          <label className="rotulo">Bonificação</label>
          <input className="input" list="bonis" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="Digite o código ou a referência" />
          <datalist id="bonis">{bonis.map((b) => <option key={b.id} value={b.rotulo} />)}</datalist>
        </div>
        <button className="btn" disabled={pendente || !sel.size || !alvoId} onClick={() => exec(() => associar([...sel], alvoId!))}>Associar</button>
        <div>
          <label className="rotulo">Ou marcar área como</label>
          <input className="input" list="alocs" value={aloc} onChange={(e) => setAloc(e.target.value)} placeholder="Comercial, Crédito Armazem..." />
          <datalist id="alocs">{alocacoes.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
        <button className="btn-sec" disabled={pendente || !sel.size || !aloc} onClick={() => exec(() => definirAlocacao([...sel], aloc))}>Aplicar</button>
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead><tr>
            <th><input type="checkbox" checked={sel.size === notas.length && notas.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(notas.map((n) => n.id)) : new Set())} /></th>
            <th>NF</th><th>Emissão</th><th>Loja</th><th>Produto</th><th className="num">Qtde</th><th className="num">TOTAL R$</th><th>Pedido Bees</th><th>Área / obs.</th><th>Sugestão</th>
          </tr></thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n.id} className={sel.has(n.id) ? "bg-amber-50" : ""}>
                <td><input type="checkbox" checked={sel.has(n.id)} onChange={() => alternar(n.id)} /></td>
                <td><button className="underline decoration-dotted" title="Selecionar todas as linhas desta NF" onClick={() => selecionarNf(n.nf)}>{n.nf}</button></td>
                <td>{n.emissao}</td><td>{n.loja}</td><td>{n.produto}</td>
                <td className="num">{n.quantidade.toLocaleString("pt-BR")}</td><td className="num">{brl.format(n.valor)}</td>
                <td>{n.pedidoBees}</td>
                <td className="text-xs">{n.alocacao}{n.observacao && <div className="text-stone-500">{n.observacao}</div>}</td>
                <td className="text-xs">
                  {n.sugestoes.slice(0, 2).map((s) => (
                    <button key={s.bonificacaoId} disabled={pendente} className={`mb-1 block rounded px-1.5 py-0.5 text-left ${s.forca > 1 ? "bg-green-100 text-green-900" : "bg-stone-100"}`} title={s.motivo}
                      onClick={() => exec(() => associar([n.id], s.bonificacaoId))}>
                      {s.codigo} · {s.motivo}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {!notas.length && <tr><td colSpan={10} className="py-6 text-center text-stone-500">Nenhuma nota na fila com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
