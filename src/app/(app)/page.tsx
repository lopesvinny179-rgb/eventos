import Link from "next/link";
import { prisma } from "@/lib/db";
import { opcoesFiltro, resumoBonificacoes, type Filtros } from "@/lib/consultas";
import { data, moeda, num } from "@/lib/formato";
import { rotuloTipo, TIPOS } from "@/lib/regras";
import { Selo } from "@/components/Status";

const STATUS = ["Não identificado", "Pagamento parcial", "Finalizado", "Recebido a maior"];

export default async function Painel({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const [linhas, op, semVinculo] = await Promise.all([
    resumoBonificacoes(f),
    opcoesFiltro(),
    prisma.recebimento.aggregate({ where: { bonificacaoId: null, alocacao: { in: ["Eventos", "EVENTOS"] } }, _sum: { valorTabela: true }, _count: true }),
  ]);
  const soma = (k: "valorAbrir" | "recebido") => linhas.reduce((a, l) => a + l[k], 0);
  const total = soma("valorAbrir");
  const recebido = soma("recebido");
  const pend = linhas.filter((l) => l.pendencia).length;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi titulo="Bonificações" valor={String(linhas.length)} />
        <Kpi titulo="Valor aberto" valor={moeda(total)} />
        <Kpi titulo="Recebido" valor={moeda(recebido)} />
        <Kpi titulo="Diferença" valor={moeda(recebido - total)} alerta={recebido - total < 0} />
        <Kpi titulo="Com pendência" valor={String(pend)} href="/pendencias" alerta={pend > 0} />
      </div>
      {semVinculo._count > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {semVinculo._count} linhas de NF de Eventos ({moeda(num(semVinculo._sum.valorTabela))}) ainda sem bonificação.{" "}
          <Link className="underline" href="/associacao">Associar agora</Link>
        </p>
      )}

      <form className="cartao grid grid-cols-2 gap-2 md:grid-cols-7">
        <Sel nome="mes" rotulo="Mês" valor={f.mes} opcoes={op.meses} />
        <Sel nome="area" rotulo="Área Armazém" valor={f.area} opcoes={op.areasArmazem} />
        <Sel nome="dono" rotulo="Dono Armazém" valor={f.dono} opcoes={op.donosArmazem} />
        <Sel nome="tipo" rotulo="Tipo" valor={f.tipo} opcoes={TIPOS.map((t) => t.valor)} rotulos={TIPOS.map((t) => t.rotulo)} />
        <Sel nome="status" rotulo="Status" valor={f.status} opcoes={STATUS} />
        <div>
          <label className="rotulo">Busca</label>
          <input className="input" name="busca" defaultValue={f.busca} placeholder="Código, referência..." />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn">Filtrar</button>
          <a className="btn-sec" href={`/exportar?${qs}`}>Excel</a>
        </div>
      </form>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Identificação</th><th>Solicitação</th><th>Área</th><th>Área Ambev</th><th>Dono</th><th>Referência</th><th>Tipo</th>
              <th className="num">A abrir</th><th className="num">Recebido</th><th className="num">Dif.</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="hover:bg-stone-50">
                <td><Link className="font-medium text-marca hover:underline" href={`/bonificacoes/${l.id}`}>{l.codigo}</Link></td>
                <td>{data(l.dataSolicitacao)}</td>
                <td>{l.areaArmazem}</td>
                <td>{l.areaAmbev}</td>
                <td>{l.donoArmazem}</td>
                <td className="max-w-xs">{l.referencia}</td>
                <td className="whitespace-nowrap text-xs">{rotuloTipo(l.tipo)}</td>
                <td className="num">{moeda(l.valorAbrir)}</td>
                <td className="num">{moeda(l.recebido)}</td>
                <td className={`num ${l.diferenca < 0 ? "text-red-700" : ""}`}>{moeda(l.diferenca)}</td>
                <td className="space-y-1"><Selo texto={l.status} />{l.pendencia && <div><Selo texto={l.pendencia.situacao} /></div>}</td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={11} className="py-6 text-center text-stone-500">Nenhuma bonificação encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, alerta, href }: { titulo: string; valor: string; alerta?: boolean; href?: string }) {
  const c = (
    <div className="cartao">
      <div className="text-xs text-stone-500">{titulo}</div>
      <div className={`text-lg font-semibold tabular-nums ${alerta ? "text-red-700" : ""}`}>{valor}</div>
    </div>
  );
  return href ? <Link href={href}>{c}</Link> : c;
}

function Sel({ nome, rotulo, valor, opcoes, rotulos }: { nome: string; rotulo: string; valor?: string; opcoes: string[]; rotulos?: string[] }) {
  return (
    <div>
      <label className="rotulo">{rotulo}</label>
      <select className="input" name={nome} defaultValue={valor ?? ""}>
        <option value="">Todos</option>
        {opcoes.map((o, i) => <option key={o} value={o}>{rotulos?.[i] ?? o}</option>)}
      </select>
    </div>
  );
}
