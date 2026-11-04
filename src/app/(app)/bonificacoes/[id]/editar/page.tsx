import { notFound } from "next/navigation";
import { FormBonificacao } from "@/components/FormBonificacao";
import { opcoesFiltro } from "@/lib/consultas";
import { prisma } from "@/lib/db";
import { codigoBoni } from "@/lib/regras";
import { atualizarBonificacao } from "../../../acoes";

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [b, op] = await Promise.all([prisma.bonificacao.findUnique({ where: { id } }), opcoesFiltro()]);
  if (!b) notFound();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Editar {codigoBoni(b.numero)}</h1>
      <FormBonificacao acao={atualizarBonificacao.bind(null, id)} b={b} op={op} rotuloBotao="Salvar alterações" />
    </div>
  );
}
