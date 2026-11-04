"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirAdmin, usuarioAtual } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { importarItens, importarLojas, importarNotas, importarProdutos, type ResultadoImportacao } from "@/lib/importacao";
import { dataBr, numeroBr } from "@/lib/planilha";
import { calcularItem, FATOR_PONTOS_PADRAO, type Tipo } from "@/lib/regras";

const opcional = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();

const esquemaBoni = z.object({
  dataSolicitacao: z.string().min(1, "Informe a data de solicitação"),
  dataEvento: opcional,
  areaArmazem: z.string().trim().min(1, "Informe a área Armazém"),
  areaAmbev: opcional,
  subareaAmbev: opcional,
  donoArmazem: opcional,
  donoAmbev: opcional,
  referencia: z.string().trim().min(1, "Informe a referência / nome do pagamento"),
  tipoPagamento: z.enum(["DG", "PONTO_BEES", "DEPOSITO"]),
  valorAbrir: z.string().min(1, "Informe o valor a ser aberto"),
  observacao: opcional,
  statusManual: opcional,
});

function lerBoni(form: FormData) {
  const d = esquemaBoni.parse(Object.fromEntries(form));
  const valor = numeroBr(d.valorAbrir);
  if (valor === null) throw new Error("Valor a ser aberto inválido");
  return {
    ...d,
    dataSolicitacao: dataBr(d.dataSolicitacao)!,
    dataEvento: dataBr(d.dataEvento),
    valorAbrir: valor,
  };
}

/** Guarda nas listas os valores novos digitados no formulário. */
async function registrarOpcoes(d: Record<string, unknown>) {
  const pares: [string, unknown][] = [
    ["AREA_ARMAZEM", d.areaArmazem],
    ["AREA_AMBEV", d.areaAmbev],
    ["SUBAREA_AMBEV", d.subareaAmbev],
    ["DONO_ARMAZEM", d.donoArmazem],
    ["DONO_AMBEV", d.donoAmbev],
  ];
  const data = pares
    .filter(([, v]) => typeof v === "string" && v)
    .map(([tipo, valor]) => ({ tipo: tipo as never, valor: valor as string }));
  if (data.length) await prisma.opcao.createMany({ data, skipDuplicates: true });
}

export async function criarBonificacao(form: FormData) {
  const u = await usuarioAtual();
  const d = lerBoni(form);
  // Próximo número da sequência IDENT_BONI. Em caso de corrida, o unique do banco evita duplicar.
  const ult = await prisma.bonificacao.aggregate({ _max: { numero: true } });
  const numero = (ult._max.numero ?? 0) + 1;
  const b = await prisma.bonificacao.create({ data: { ...d, numero, criadoPor: u.nome } });
  await registrarOpcoes(d);
  revalidatePath("/");
  redirect(`/bonificacoes/${b.id}`);
}

export async function atualizarBonificacao(id: number, form: FormData) {
  await usuarioAtual();
  const d = lerBoni(form);
  await prisma.bonificacao.update({ where: { id }, data: d });
  await registrarOpcoes(d);
  revalidatePath(`/bonificacoes/${id}`);
  redirect(`/bonificacoes/${id}`);
}

export async function excluirBonificacao(id: number) {
  await exigirAdmin();
  await prisma.bonificacao.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

async function fator() {
  const c = await prisma.configuracao.findUnique({ where: { chave: "fator_pontos" } });
  return c ? Number(c.valor) : FATOR_PONTOS_PADRAO;
}

export async function salvarItem(bonificacaoId: number, itemId: number | null, form: FormData) {
  await usuarioAtual();
  const boni = await prisma.bonificacao.findUniqueOrThrow({ where: { id: bonificacaoId } });
  const produtoCodigo = String(form.get("produtoCodigo") ?? "").trim() || null;
  const produto = produtoCodigo ? await prisma.produto.findUnique({ where: { codigo: produtoCodigo } }) : null;
  if (produtoCodigo && !produto) throw new Error(`Produto ${produtoCodigo} não cadastrado`);
  const caixas = numeroBr(form.get("caixas"));
  const unidadesCaixa = numeroBr(form.get("unidadesCaixa")) ?? produto?.unidadesCaixa ?? null;
  const ttv = numeroBr(form.get("ttv")) ?? (produto?.ttv ? Number(produto.ttv) : null);
  const calc = calcularItem({ caixas, unidadesCaixa, ttv, tipo: boni.tipoPagamento as Tipo, fatorPontos: await fator() });
  const data = {
    lojaCodigo: String(form.get("lojaCodigo") ?? "") || null,
    produtoCodigo,
    descricao: produto?.descricao ?? null,
    caixas,
    unidadesCaixa,
    ttv,
    ...calc,
    pedidoBees: String(form.get("pedidoBees") ?? "").trim() || null,
    dataEntrega: dataBr(form.get("dataEntrega")),
    statusEntrega: String(form.get("statusEntrega") ?? "").trim() || null,
    observacao: String(form.get("observacao") ?? "").trim() || null,
  };
  if (itemId) await prisma.itemAberto.update({ where: { id: itemId, bonificacaoId }, data });
  else await prisma.itemAberto.create({ data: { ...data, bonificacaoId } });
  revalidatePath(`/bonificacoes/${bonificacaoId}`);
}

export async function excluirItem(bonificacaoId: number, itemId: number) {
  await usuarioAtual();
  await prisma.itemAberto.delete({ where: { id: itemId, bonificacaoId } });
  revalidatePath(`/bonificacoes/${bonificacaoId}`);
}

// ---------------------------------------------------------------- Associação

export async function associar(recebimentoIds: number[], bonificacaoId: number) {
  const u = await usuarioAtual();
  await prisma.recebimento.updateMany({
    where: { id: { in: recebimentoIds } },
    data: { bonificacaoId, associadoPor: u.nome, associadoEm: new Date() },
  });
  revalidatePath("/associacao");
  revalidatePath(`/bonificacoes/${bonificacaoId}`);
}

export async function desassociar(recebimentoIds: number[]) {
  await usuarioAtual();
  await prisma.recebimento.updateMany({ where: { id: { in: recebimentoIds } }, data: { bonificacaoId: null, associadoPor: null, associadoEm: null } });
  revalidatePath("/associacao");
  revalidatePath("/bonificacoes/[id]", "page");
}

/** Marca notas que não são de evento (Comercial, Crédito Armazem...) para saírem da fila. */
export async function definirAlocacao(recebimentoIds: number[], alocacao: string) {
  await usuarioAtual();
  await prisma.recebimento.updateMany({ where: { id: { in: recebimentoIds } }, data: { alocacao: alocacao || null } });
  if (alocacao) await prisma.opcao.createMany({ data: [{ tipo: "ALOCACAO", valor: alocacao }], skipDuplicates: true });
  revalidatePath("/associacao");
}

// ---------------------------------------------------------------- Importação

export type TipoImportacao = "itens" | "notas" | "produtos" | "lojas";

export async function importar(form: FormData): Promise<ResultadoImportacao | { erro: string }> {
  const u = await usuarioAtual();
  try {
    const arquivo = form.get("arquivo") as File | null;
    if (!arquivo || !arquivo.size) return { erro: "Escolha um arquivo .xlsx" };
    const buffer = await arquivo.arrayBuffer();
    const gravar = form.get("gravar") === "1";
    const tipo = form.get("tipo") as TipoImportacao;
    const boni = Number(form.get("bonificacaoId")) || undefined;
    let r: ResultadoImportacao;
    if (tipo === "itens") r = await importarItens(buffer, { gravar, bonificacaoId: boni });
    else if (tipo === "notas") r = await importarNotas(buffer, { gravar, usuario: u.nome, origem: arquivo.name });
    else if (tipo === "produtos") r = await importarProdutos(buffer, { gravar });
    else if (tipo === "lojas") r = await importarLojas(buffer, { gravar });
    else return { erro: "Tipo de importação desconhecido" };
    if (gravar) revalidatePath("/", "layout");
    // A prévia mostra no máximo 500 linhas para não pesar a tela.
    return { ...r, linhas: r.linhas.filter((l) => l.status !== "ok").concat(r.linhas.filter((l) => l.status === "ok")).slice(0, 500) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- Cadastros

export async function adicionarOpcao(form: FormData) {
  await usuarioAtual();
  const tipo = String(form.get("tipo"));
  const valor = String(form.get("valor") ?? "").trim();
  if (valor) await prisma.opcao.upsert({ where: { tipo_valor: { tipo: tipo as never, valor } }, create: { tipo: tipo as never, valor }, update: { ativo: true } });
  revalidatePath("/cadastros");
}

export async function desativarOpcao(id: number) {
  await usuarioAtual();
  await prisma.opcao.update({ where: { id }, data: { ativo: false } });
  revalidatePath("/cadastros");
}

export async function salvarFatorPontos(form: FormData) {
  await exigirAdmin();
  const v = numeroBr(form.get("fator"));
  if (!v || v <= 0) throw new Error("Fator inválido");
  await prisma.configuracao.upsert({ where: { chave: "fator_pontos" }, create: { chave: "fator_pontos", valor: String(v) }, update: { valor: String(v) } });
  revalidatePath("/cadastros");
}

export async function criarUsuario(form: FormData) {
  await exigirAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nome = String(form.get("nome") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email || !nome || senha.length < 8) throw new Error("Informe e-mail, nome e uma senha com 8+ caracteres");
  await prisma.usuario.upsert({
    where: { email },
    create: { email, nome, senhaHash: await bcrypt.hash(senha, 10), papel: form.get("admin") ? "ADMIN" : "USUARIO" },
    update: { nome, senhaHash: await bcrypt.hash(senha, 10), ativo: true, papel: form.get("admin") ? "ADMIN" : "USUARIO" },
  });
  revalidatePath("/cadastros");
}

export async function alternarUsuario(id: number) {
  const eu = await exigirAdmin();
  if (eu.id === id) throw new Error("Você não pode desativar a si mesmo");
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  await prisma.usuario.update({ where: { id }, data: { ativo: !u.ativo } });
  revalidatePath("/cadastros");
}
