import { FormBonificacao } from "@/components/FormBonificacao";
import { opcoesFiltro } from "@/lib/consultas";
import { prisma } from "@/lib/db";
import { codigoBoni } from "@/lib/regras";
import { criarBonificacao } from "../../acoes";

export default async function Nova() {
  const [op, ult] = await Promise.all([opcoesFiltro(), prisma.bonificacao.aggregate({ _max: { numero: true } })]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Nova bonificação</h1>
      <p className="text-sm text-stone-600">A identificação será <b>{codigoBoni((ult._max.numero ?? 0) + 1)}</b>. Depois de salvar você lança os produtos.</p>
      <FormBonificacao acao={criarBonificacao} op={op} rotuloBotao="Salvar e lançar produtos" />
    </div>
  );
}
