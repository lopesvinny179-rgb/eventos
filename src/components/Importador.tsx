"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importar, type TipoImportacao } from "@/app/(app)/acoes";
import type { ResultadoImportacao } from "@/lib/importacao";

const COR = { ok: "", aviso: "bg-amber-50", erro: "bg-red-50", ignorada: "bg-stone-50 text-stone-400" };

export function Importador({ tipo, bonificacaoId, modelo }: { tipo: TipoImportacao; bonificacaoId?: number; modelo?: string }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(gravar: boolean) {
    const f = arquivo.current?.files?.[0];
    if (!f) return setErro("Escolha um arquivo .xlsx");
    const fd = new FormData();
    fd.set("arquivo", f);
    fd.set("tipo", tipo);
    fd.set("gravar", gravar ? "1" : "0");
    if (bonificacaoId) fd.set("bonificacaoId", String(bonificacaoId));
    setErro(null);
    iniciar(async () => {
      const r = await importar(fd);
      if ("erro" in r) {
        setErro(r.erro);
        setRes(null);
      } else {
        setRes(r);
        setGravado(gravar);
        if (gravar) router.refresh();
      }
    });
  }

  const colunas = res?.linhas[0] ? Object.keys(res.linhas.find((l) => l.status !== "erro")?.dados ?? res.linhas[0].dados) : [];
  const aGravar = res ? res.total - res.erros - res.ignoradas : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={arquivo} type="file" accept=".xlsx,.xlsm" className="text-sm" onChange={() => { setRes(null); setGravado(false); }} />
        <button className="btn-sec" disabled={pendente} onClick={() => enviar(false)}>{pendente && !res ? "Lendo..." : "Conferir"}</button>
        {modelo && <a className="text-sm text-marca underline" href={modelo}>Baixar modelo</a>}
      </div>
      {erro && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
      {res && (
        <div className="space-y-2">
          <p className="text-sm">
            Aba <b>{res.aba}</b>: {res.total} linhas · <span className="text-green-700">{res.ok} ok</span> ·{" "}
            <span className="text-amber-700">{res.avisos} com aviso</span> · <span className="text-red-700">{res.erros} com erro</span>
            {res.ignoradas > 0 && <> · {res.ignoradas} já importadas</>}
          </p>
          {gravado ? (
            <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{res.gravadas} linhas gravadas.</p>
          ) : (
            <button className="btn" disabled={pendente || aGravar === 0} onClick={() => enviar(true)}>
              {pendente ? "Gravando..." : `Gravar ${aGravar} linhas`}
            </button>
          )}
          {res.erros > 0 && !gravado && <p className="text-xs text-stone-500">Linhas com erro não são gravadas. Corrija na planilha e importe de novo.</p>}
          <div className="max-h-96 overflow-auto rounded border border-stone-200 bg-white">
            <table className="tabela">
              <thead className="sticky top-0">
                <tr><th>Linha</th>{colunas.map((c) => <th key={c}>{c}</th>)}<th>Mensagem</th></tr>
              </thead>
              <tbody>
                {res.linhas.map((l) => (
                  <tr key={l.linha} className={COR[l.status]}>
                    <td>{l.linha}</td>
                    {colunas.map((c) => <td key={c}>{l.dados[c] ?? ""}</td>)}
                    <td className="text-xs">{l.mensagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
