import Link from "next/link";
import { resumoBonificacoes } from "@/lib/consultas";
import { data, moeda, mesAno } from "@/lib/formato";
import { rotuloTipo } from "@/lib/regras";
import { Selo } from "@/components/Status";

export default async function Pendencias() {
  const todas = await resumoBonificacoes();
  const lancamento = todas.filter((l) => l.pendencia);
  const recebimento = todas.filter((l) => !l.pendencia && l.status !== "Finalizado" && l.status !== "Cancelado");
  const naoLancadas = lancamento.filter((l) => l.pendencia?.situacao === "Não lançada");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pendências</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi t="Bonificações analisadas" v={String(todas.length)} />
        <Kpi t="Não lançadas" v={`${naoLancadas.length} · ${moeda(naoLancadas.reduce((a, l) => a + l.valorAbrir, 0))}`} />
        <Kpi t="Lançamento incompleto" v={String(lancamento.length - naoLancadas.length)} />
        <Kpi t="Aguardando recebimento" v={`${recebimento.length} · ${moeda(recebimento.reduce((a, l) => a + l.valorAbrir - l.recebido, 0))}`} />
      </div>

      <Tabela titulo="Lançamento: produtos não lançados ou incompletos" linhas={lancamento} mostrarCampos />
      <Tabela titulo="Recebimento: lançadas, mas o valor ainda não chegou" linhas={recebimento} />
    </div>
  );
}

function Tabela({ titulo, linhas, mostrarCampos }: { titulo: string; linhas: Awaited<ReturnType<typeof resumoBonificacoes>>; mostrarCampos?: boolean }) {
  return (
    <section className="cartao overflow-x-auto p-0">
      <h2 className="p-3 font-semibold">{titulo} ({linhas.length})</h2>
      <table className="tabela">
        <thead><tr><th>Mês</th><th>Identificação</th><th>Solicitação</th><th>Área</th><th>Dono</th><th>Referência</th><th>Tipo</th><th className="num">A abrir</th><th className="num">Recebido</th><th>Situação</th>{mostrarCampos && <th>Campos pendentes</th>}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td>{mesAno(l.dataSolicitacao)}</td>
              <td><Link className="font-medium text-marca hover:underline" href={`/bonificacoes/${l.id}`}>{l.codigo}</Link></td>
              <td>{data(l.dataSolicitacao)}</td><td>{l.areaArmazem}</td><td>{l.donoArmazem}</td><td>{l.referencia}</td>
              <td className="text-xs">{rotuloTipo(l.tipo)}</td><td className="num">{moeda(l.valorAbrir)}</td><td className="num">{moeda(l.recebido)}</td>
              <td><Selo texto={l.pendencia?.situacao ?? l.status} /></td>
              {mostrarCampos && <td className="text-xs">{l.pendencia?.campos.join(", ")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Kpi({ t, v }: { t: string; v: string }) {
  return <div className="cartao"><div className="text-xs text-stone-500">{t}</div><div className="text-lg font-semibold tabular-nums">{v}</div></div>;
}
