import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth";
import { moeda, num } from "@/lib/formato";
import { FATOR_PONTOS_PADRAO } from "@/lib/regras";
import { BotaoAcao } from "@/components/BotaoAcao";
import { adicionarOpcao, alternarUsuario, criarUsuario, desativarOpcao, salvarFatorPontos } from "../acoes";

const TIPOS = [
  ["AREA_ARMAZEM", "Áreas Armazém"],
  ["AREA_AMBEV", "Áreas Ambev"],
  ["SUBAREA_AMBEV", "Subáreas Ambev"],
  ["DONO_ARMAZEM", "Donos Armazém"],
  ["DONO_AMBEV", "Donos Ambev"],
  ["ALOCACAO", "Áreas das notas (alocação)"],
] as const;

export default async function Cadastros({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const u = await usuarioAtual();
  const { produto } = await searchParams;
  const [opcoes, lojas, produtos, nProdutos, usuarios, fator] = await Promise.all([
    prisma.opcao.findMany({ where: { ativo: true }, orderBy: { valor: "asc" } }),
    prisma.loja.findMany({ orderBy: { codigo: "asc" } }),
    prisma.produto.findMany({
      where: produto ? { OR: [{ codigo: { contains: produto } }, { descricao: { contains: produto, mode: "insensitive" } }] } : undefined,
      orderBy: { codigo: "asc" }, take: 100,
    }),
    prisma.produto.count(),
    u.papel === "ADMIN" ? prisma.usuario.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([]),
    prisma.configuracao.findUnique({ where: { chave: "fator_pontos" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cadastros</h1>
      <p className="text-sm text-stone-600">Produtos e lojas são atualizados por planilha em <a className="text-marca underline" href="/importar">Importar planilhas</a>.</p>

      <section className="grid gap-3 md:grid-cols-3">
        {TIPOS.map(([tipo, rotulo]) => (
          <div key={tipo} className="cartao space-y-2">
            <h2 className="font-semibold">{rotulo}</h2>
            <ul className="max-h-48 space-y-0.5 overflow-auto text-sm">
              {opcoes.filter((o) => o.tipo === tipo).map((o) => (
                <li key={o.id} className="flex justify-between gap-2"><span>{o.valor}</span><BotaoAcao acao={desativarOpcao.bind(null, o.id)} className="text-xs text-stone-400 hover:text-red-700">remover</BotaoAcao></li>
              ))}
            </ul>
            <form action={adicionarOpcao} className="flex gap-1">
              <input type="hidden" name="tipo" value={tipo} />
              <input className="input" name="valor" placeholder="Novo valor" />
              <button className="btn-sec">+</button>
            </form>
          </div>
        ))}
      </section>

      <section className="cartao space-y-2">
        <h2 className="font-semibold">Produtos ({nProdutos})</h2>
        <form className="flex gap-2"><input className="input max-w-xs" name="produto" defaultValue={produto} placeholder="Código ou descrição" /><button className="btn-sec">Buscar</button></form>
        <div className="max-h-96 overflow-auto">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Cód. Ambev</th><th>Descrição</th><th>Pack</th><th className="num">Un/cx</th><th className="num">TTV</th></tr></thead>
            <tbody>{produtos.map((p) => <tr key={p.codigo}><td>{p.codigo}</td><td>{p.codigoAmbev}</td><td>{p.descricao}</td><td>{p.pack}</td><td className="num">{p.unidadesCaixa}</td><td className="num">{p.ttv ? moeda(num(p.ttv)) : ""}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="cartao space-y-2">
        <h2 className="font-semibold">Lojas ({lojas.length})</h2>
        <div className="max-h-96 overflow-auto">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Nome</th><th>CNPJ antigo</th><th>CNPJ novo</th><th>Região</th><th>Regional</th></tr></thead>
            <tbody>{lojas.map((l) => <tr key={l.codigo}><td>{l.codigo}</td><td>{l.nome}</td><td>{l.cnpjAntigo}</td><td>{l.cnpjNovo}</td><td>{l.regiao}</td><td>{l.regional}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      {u.papel === "ADMIN" && (
        <>
          <section className="cartao space-y-2">
            <h2 className="font-semibold">Fator de pontos Bees</h2>
            <form action={salvarFatorPontos} className="flex items-end gap-2">
              <div><label className="rotulo">R$ por ponto</label><input className="input" name="fator" defaultValue={String(fator?.valor ?? FATOR_PONTOS_PADRAO).replace(".", ",")} /></div>
              <button className="btn-sec">Salvar</button>
            </form>
          </section>
          <section className="cartao space-y-2">
            <h2 className="font-semibold">Usuários</h2>
            <table className="tabela">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
              <tbody>{usuarios.map((x) => (
                <tr key={x.id}><td>{x.nome}</td><td>{x.email}</td><td>{x.papel === "ADMIN" ? "Administrador" : "Usuário"}</td><td>{x.ativo ? "Ativo" : "Inativo"}</td>
                  <td>{x.id !== u.id && <BotaoAcao acao={alternarUsuario.bind(null, x.id)} className="text-xs underline">{x.ativo ? "desativar" : "reativar"}</BotaoAcao>}</td></tr>
              ))}</tbody>
            </table>
            <form action={criarUsuario} className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <input className="input" name="nome" placeholder="Nome" required />
              <input className="input" name="email" type="email" placeholder="E-mail" required />
              <input className="input" name="senha" type="password" placeholder="Senha (8+)" minLength={8} required />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="admin" /> Administrador</label>
              <button className="btn">Criar ou redefinir senha</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
