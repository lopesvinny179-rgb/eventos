import type { Bonificacao } from "@prisma/client";
import { dataInput, num } from "@/lib/formato";
import { TIPOS } from "@/lib/regras";

type Opcoes = { areasArmazem: string[]; areasAmbev: string[]; subareasAmbev: string[]; donosArmazem: string[]; donosAmbev: string[] };

/** Campos com lista: escolhe um valor existente ou digita um novo (que passa a fazer parte da lista). */
function Lista({ nome, rotulo, valor, opcoes, obrigatorio }: { nome: string; rotulo: string; valor?: string | null; opcoes: string[]; obrigatorio?: boolean }) {
  return (
    <div>
      <label className="rotulo" htmlFor={nome}>{rotulo}{obrigatorio && " *"}</label>
      <input className="input" id={nome} name={nome} list={`l-${nome}`} defaultValue={valor ?? ""} required={obrigatorio} autoComplete="off" />
      <datalist id={`l-${nome}`}>{opcoes.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

export function FormBonificacao({ acao, b, op, rotuloBotao }: { acao: (f: FormData) => Promise<void>; b?: Bonificacao; op: Opcoes; rotuloBotao: string }) {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <form action={acao} className="cartao grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className="rotulo" htmlFor="dataSolicitacao">Data solicitação *</label>
        <input className="input" type="date" id="dataSolicitacao" name="dataSolicitacao" required defaultValue={b ? dataInput(b.dataSolicitacao) : hoje} />
      </div>
      <div>
        <label className="rotulo" htmlFor="dataEvento">Data evento</label>
        <input className="input" type="date" id="dataEvento" name="dataEvento" defaultValue={dataInput(b?.dataEvento)} />
      </div>
      <div>
        <label className="rotulo" htmlFor="tipoPagamento">Tipo de pagamento *</label>
        <select className="input" id="tipoPagamento" name="tipoPagamento" defaultValue={b?.tipoPagamento ?? "DG"}>
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </div>
      <Lista nome="areaArmazem" rotulo="Área Armazém" valor={b?.areaArmazem} opcoes={op.areasArmazem} obrigatorio />
      <Lista nome="areaAmbev" rotulo="Área Ambev (Eventos)" valor={b?.areaAmbev} opcoes={op.areasAmbev} />
      <Lista nome="subareaAmbev" rotulo="Subárea Ambev (Eventos)" valor={b?.subareaAmbev} opcoes={op.subareasAmbev} />
      <Lista nome="donoArmazem" rotulo="Dono Armazém" valor={b?.donoArmazem} opcoes={op.donosArmazem} />
      <Lista nome="donoAmbev" rotulo="Dono Ambev" valor={b?.donoAmbev} opcoes={op.donosAmbev} />
      <div>
        <label className="rotulo" htmlFor="valorAbrir">Valor a ser aberto (R$) *</label>
        <input className="input" id="valorAbrir" name="valorAbrir" inputMode="decimal" required defaultValue={b ? String(num(b.valorAbrir)).replace(".", ",") : ""} placeholder="0,00" />
      </div>
      <div className="md:col-span-3">
        <label className="rotulo" htmlFor="referencia">Referência / nome do pagamento *</label>
        <input className="input" id="referencia" name="referencia" required defaultValue={b?.referencia ?? ""} />
      </div>
      <div className="md:col-span-2">
        <label className="rotulo" htmlFor="observacao">Observação</label>
        <textarea className="input" id="observacao" name="observacao" rows={2} defaultValue={b?.observacao ?? ""} />
      </div>
      <div>
        <label className="rotulo" htmlFor="statusManual">Status manual (opcional)</label>
        <select className="input" id="statusManual" name="statusManual" defaultValue={b?.statusManual ?? ""}>
          <option value="">Calcular automaticamente</option>
          <option>Finalizado</option>
          <option>Pagamento parcial</option>
          <option>Não identificado</option>
          <option>Cancelado</option>
        </select>
      </div>
      <div className="md:col-span-3"><button className="btn">{rotuloBotao}</button></div>
    </form>
  );
}
