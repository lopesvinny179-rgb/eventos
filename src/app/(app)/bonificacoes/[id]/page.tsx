import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { data, moeda, num, numero } from "@/lib/formato";
import { codigoBoni, FATOR_PONTOS_PADRAO, pendencia, rotuloTipo, statusCalculado } from "@/lib/regras";
import { Selo } from "@/components/Status";
import { Importador } from "@/components/Importador";
import { BotaoAcao } from "@/components/BotaoAcao";
import { desassociar, excluirBonificacao, excluirItem, salvarItem } from "../../acoes";
import { usuarioAtual } from "@/lib/auth";

export default async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const u = await usuarioAtual();
  const b = await prisma.bonificacao.findUnique({
    where: { id },
    include: {
      itens: { include: { loja: true }, orderBy: { id: "asc" } },
      recebimentos: { orderBy: [{ emissao: "asc" }, { nf: "asc" }] },
    },
  });
  if (!b) notFound();
  const [lojas, fatorCfg] = await Promise.all([
    prisma.loja.findMany({ orderBy: { codigo: "asc" } }),
    prisma.configuracao.findUnique({ where: { chave: "fator_pontos" } }),
  ]);
  const fator = fatorCfg ? Number(fatorCfg.valor) : FATOR_PONTOS_PADRAO;
  const valor = num(b.valorAbrir);
  const lancado = b.itens.reduce((a, i) => a + num(i.total), 0);
  const recebido = b.recebimentos.reduce((a, r) => a + num(r.valorTabela), 0);
  const status = b.statusManual || statusCalculado(valor, recebido);
  const pend = pendencia(b.tipoPagamento, b.itens);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">{codigoBoni(b.numero)} · {b.referencia}</h1>
          <p className="text-sm text-stone-600">
            {rotuloTipo(b.tipoPagamento)} · solicitado em {data(b.dataSolicitacao)}
            {b.dataEvento && <> · evento em {data(b.dataEvento)}</>} · {b.areaArmazem}
            {b.areaAmbev && <> / {b.areaAmbev}</>}{b.subareaAmbev && <> / {b.subareaAmbev}</>}
          </p>
          <p className="text-sm text-stone-600">Dono Armazém: {b.donoArmazem ?? "—"} · Dono Ambev: {b.donoAmbev ?? "—"}{b.criadoPor && <> · cadastrado por {b.criadoPor}</>}</p>
          {b.observacao && <p className="mt-1 text-sm">{b.observacao}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          <Link className="btn-sec" href={`/bonificacoes/${id}/editar`}>Editar</Link>
          {u.papel === "ADMIN" && <BotaoAcao acao={excluirBonificacao.bind(null, id)} confirmar="Excluir a bonificação, seus itens e desvincular as notas?" className="btn-sec text-red-700">Excluir</BotaoAcao>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi t="Valor a abrir" v={moeda(valor)} />
        <Kpi t="Lançado em itens" v={moeda(lancado)} />
        <Kpi t="Recebido (TOTAL R$)" v={moeda(recebido)} />
        <Kpi t="Diferença" v={moeda(recebido - valor)} />
        <div className="cartao space-y-1"><div className="text-xs text-stone-500">Status</div><Selo texto={status} />{pend && <div><Selo texto={pend.situacao} /> <span className="text-xs text-stone-600">{pend.campos.join(", ")}</span></div>}</div>
      </div>
      {b.tipoPagamento === "PONTO_BEES" && <p className="text-sm text-stone-600">Pontos aproximados: <b>{numero(valor / fator)}</b> (valor ÷ {String(fator).replace(".", ",")})</p>}

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Produtos abertos ({b.itens.length})</h2>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Loja</th><th>Produto</th><th className="num">Caixas</th><th className="num">Un/cx</th><th className="num">Unid.</th><th className="num">TTV</th><th className="num">Total</th>{b.tipoPagamento === "PONTO_BEES" && <th className="num">Pontos</th>}<th>Pedido Bees</th><th>Entrega</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {b.itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.loja ? `${i.loja.codigo} - ${i.loja.nome}` : i.lojaCodigo}</td>
                  <td>{i.produtoCodigo} {i.descricao}</td>
                  <td className="num">{numero(i.caixas)}</td>
                  <td className="num">{i.unidadesCaixa}</td>
                  <td className="num">{numero(i.unidades)}</td>
                  <td className="num">{i.ttv ? num(i.ttv).toFixed(4).replace(".", ",") : ""}</td>
                  <td className="num">{moeda(i.total)}</td>
                  {b.tipoPagamento === "PONTO_BEES" && <td className="num">{numero(i.pontos)}</td>}
                  <td>{i.pedidoBees}</td>
                  <td>{data(i.dataEntrega)}</td>
                  <td>{i.statusEntrega}</td>
                  <td><BotaoAcao acao={excluirItem.bind(null, id, i.id)} confirmar="Excluir este item?" className="text-xs text-red-700 underline">excluir</BotaoAcao></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Adicionar um produto</summary>
          <form action={salvarItem.bind(null, id, null)} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="col-span-2">
              <label className="rotulo">Loja</label>
              <select className="input" name="lojaCodigo"><option value="">—</option>{lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.codigo} - {l.nome}</option>)}</select>
            </div>
            <div><label className="rotulo">Cód. produto</label><input className="input" name="produtoCodigo" placeholder="000018" /></div>
            <div><label className="rotulo">Caixas</label><input className="input" name="caixas" inputMode="decimal" /></div>
            <div><label className="rotulo">Un/cx (vazio = cadastro)</label><input className="input" name="unidadesCaixa" inputMode="numeric" /></div>
            <div><label className="rotulo">TTV (vazio = cadastro)</label><input className="input" name="ttv" inputMode="decimal" /></div>
            <div><label className="rotulo">Pedido Bees</label><input className="input" name="pedidoBees" /></div>
            <div><label className="rotulo">Dt entrega</label><input className="input" type="date" name="dataEntrega" /></div>
            <div><label className="rotulo">Status entrega</label><input className="input" name="statusEntrega" list="st" /><datalist id="st"><option value="Entregue" /><option value="Não entregue" /><option value="Finalizado" /></datalist></div>
            <div className="col-span-2"><label className="rotulo">Observação</label><input className="input" name="observacao" /></div>
            <div className="flex items-end"><button className="btn">Adicionar</button></div>
          </form>
        </details>

        <details className="rounded border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Importar produtos por planilha</summary>
          <div className="mt-3"><Importador tipo="itens" bonificacaoId={id} modelo="/modelos/itens" /></div>
        </details>
      </section>

      <section className="cartao space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Notas recebidas ({b.recebimentos.length})</h2>
          <Link href="/associacao" className="text-sm text-marca underline">associar mais notas</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>NF</th><th>Emissão</th><th>Loja</th><th>Produto</th><th className="num">Qtde</th><th className="num">Valor NF</th><th className="num">TOTAL R$</th><th>Pedido Bees</th><th>Associado por</th><th></th></tr></thead>
            <tbody>
              {b.recebimentos.map((r) => (
                <tr key={r.id}>
                  <td>{r.nf}</td><td>{data(r.emissao)}</td><td>{r.lojaNome}</td><td>{r.produtoCodigo} {r.descricao}</td>
                  <td className="num">{numero(r.quantidade)}</td><td className="num">{moeda(r.valorTotal)}</td><td className="num">{moeda(r.valorTabela)}</td>
                  <td>{r.pedidoBees}</td><td className="text-xs">{r.associadoPor}</td>
                  <td><BotaoAcao acao={desassociar.bind(null, [r.id])} className="text-xs text-red-700 underline">desvincular</BotaoAcao></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ t, v }: { t: string; v: string }) {
  return <div className="cartao"><div className="text-xs text-stone-500">{t}</div><div className="text-lg font-semibold tabular-nums">{v}</div></div>;
}
