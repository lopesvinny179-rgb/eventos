// Importações por planilha. Cada função lê o arquivo, valida linha a linha e,
// com `gravar = true`, grava no banco. A mesma função gera a prévia e a gravação.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { campo, dataBr, lerPlanilha, numeroBr, texto } from "./planilha";
import { calcularItem, chaveRecebimento, codigo, codigoBoni, FATOR_PONTOS_PADRAO, numeroDoCodigo, type Tipo } from "./regras";

export type LinhaPrevia = {
  linha: number;
  status: "ok" | "aviso" | "erro" | "ignorada";
  mensagem?: string;
  dados: Record<string, string | number | null>;
};

export type ResultadoImportacao = {
  aba: string;
  total: number;
  ok: number;
  avisos: number;
  erros: number;
  ignoradas: number;
  gravadas: number;
  linhas: LinhaPrevia[];
};

function resumo(aba: string, linhas: LinhaPrevia[], gravadas: number): ResultadoImportacao {
  const c = (s: LinhaPrevia["status"]) => linhas.filter((l) => l.status === s).length;
  return { aba, total: linhas.length, ok: c("ok"), avisos: c("aviso"), erros: c("erro"), ignoradas: c("ignorada"), gravadas, linhas };
}

async function mapaLojas() {
  const lojas = await prisma.loja.findMany();
  const porCodigo = new Map(lojas.map((l) => [l.codigo, l]));
  const porNome = new Map(lojas.map((l) => [l.nome.toLowerCase(), l]));
  return (v: unknown) => {
    const s = texto(v);
    if (!s) return null;
    const cod = codigo(s, 3);
    if (cod && porCodigo.has(cod)) return porCodigo.get(cod)!;
    const m = s.match(/^(\d{3})\s*-/); // "017 - Indaiatuba Full"
    if (m && porCodigo.has(m[1])) return porCodigo.get(m[1])!;
    return porNome.get(s.toLowerCase()) ?? null;
  };
}

async function mapaProdutos() {
  const produtos = await prisma.produto.findMany();
  const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));
  const porDescricao = new Map(produtos.map((p) => [p.descricao.trim().toUpperCase(), p]));
  return (cod: unknown, descricao?: unknown) => {
    const c = codigo(texto(cod), 6);
    if (c && porCodigo.has(c)) return porCodigo.get(c)!;
    const d = texto(descricao)?.toUpperCase();
    return d ? porDescricao.get(d) ?? null : null;
  };
}

async function fatorPontos() {
  const c = await prisma.configuracao.findUnique({ where: { chave: "fator_pontos" } });
  return c ? Number(c.valor) : FATOR_PONTOS_PADRAO;
}

// ---------------------------------------------------------------- Itens abertos

/**
 * Produtos de uma ou mais bonificações. Se `bonificacaoId` vier, todas as linhas vão para ela
 * e a coluna Identificação é opcional.
 */
export async function importarItens(buffer: ArrayBuffer, opcoes: { gravar: boolean; bonificacaoId?: number }) {
  const { linhas, aba } = await lerPlanilha(buffer, ["Produto", "Cód AC", "Caixas", "IDENTIFICAÇÃO ÚNICA", "Identificação"]);
  const loja = await mapaLojas();
  const produto = await mapaProdutos();
  const fator = await fatorPontos();
  const bonis = await prisma.bonificacao.findMany({ select: { id: true, numero: true, tipoPagamento: true } });
  const porNumero = new Map(bonis.map((b) => [b.numero, b]));
  const fixa = opcoes.bonificacaoId ? bonis.find((b) => b.id === opcoes.bonificacaoId) : undefined;

  const previa: LinhaPrevia[] = [];
  const gravar: Prisma.ItemAbertoCreateManyInput[] = [];

  for (const { numero, valores: v } of linhas) {
    const avisos: string[] = [];
    const erros: string[] = [];

    let boni = fixa;
    const ident = campo(v, "Identificação", "IDENTIFICAÇÃO ÚNICA", "Identificacao unica");
    if (!boni) {
      const n = numeroDoCodigo(ident);
      boni = n !== null ? porNumero.get(n) : undefined;
      if (!boni) erros.push(ident ? `Bonificação ${ident} não existe` : "Falta a identificação (IDENT_BONI)");
    }

    const lojaTxt = campo(v, "Cód Loja", "Filial", "Cód.", "Loja");
    const l = loja(lojaTxt) ?? loja(campo(v, "Loja"));
    if (!l && lojaTxt) erros.push(`Loja "${lojaTxt}" não cadastrada`);
    if (!lojaTxt) avisos.push("Sem loja");

    const prodCod = campo(v, "Cód Produto", "Cód AC", "Cód. 2", "Código Produto");
    const prodDesc = campo(v, "Produto", "Descricao do Produto", "Descrição");
    const p = produto(prodCod ?? prodDesc, prodDesc);
    if (!p && (prodCod || prodDesc)) erros.push(`Produto "${prodCod ?? prodDesc}" não cadastrado`);

    const caixas = numeroBr(campo(v, "Caixas", "TT SKU", "Qtde", "Quantidade"));
    const unidadesCaixa = numeroBr(campo(v, "Unidades por caixa", "SKU")) ?? p?.unidadesCaixa ?? null;
    const ttv = numeroBr(campo(v, "TTV")) ?? (p?.ttv ? Number(p.ttv) : null);
    if (caixas === null) avisos.push("Sem quantidade");
    if (ttv === null && p) avisos.push("Produto sem TTV");

    const tipo = (boni?.tipoPagamento ?? "DG") as Tipo;
    const calc = calcularItem({ caixas, unidadesCaixa, ttv, tipo, fatorPontos: fator });
    const pedidoBees = texto(campo(v, "N° Pedido Bees", "Pedido Bees", "N de pedido do Bees"));
    const dataEntrega = dataBr(campo(v, "Dt Entrega", "Data Entrega"));
    const statusEntrega = texto(campo(v, "Status", "Stt2"));
    const extras = Object.fromEntries(
      ["Cod Cia", "OP", "PDV", "CDD"].map((k) => [k, campo(v, k)]).filter(([, x]) => x !== null),
    );

    previa.push({
      linha: numero,
      status: erros.length ? "erro" : avisos.length ? "aviso" : "ok",
      mensagem: [...erros, ...avisos].join("; ") || undefined,
      dados: {
        Bonificação: boni ? codigoBoni(boni.numero) : (texto(ident) ?? ""),
        Loja: l ? `${l.codigo} - ${l.nome}` : (texto(lojaTxt) ?? ""),
        Produto: p ? `${p.codigo} - ${p.descricao}` : (texto(prodCod ?? prodDesc) ?? ""),
        Caixas: caixas,
        "Un/cx": unidadesCaixa,
        Unidades: calc.unidades,
        TTV: ttv,
        Total: calc.total,
        "Pedido Bees": pedidoBees,
      },
    });

    if (!erros.length && boni) {
      gravar.push({
        bonificacaoId: boni.id,
        lojaCodigo: l?.codigo ?? null,
        produtoCodigo: p?.codigo ?? null,
        descricao: texto(prodDesc) ?? p?.descricao ?? null,
        caixas,
        unidadesCaixa,
        unidades: calc.unidades,
        ttv,
        total: calc.total,
        pontos: calc.pontos,
        pedidoBees,
        dataEntrega,
        statusEntrega,
        observacao: texto(campo(v, "Observação", "Obs")),
        extras: Object.keys(extras).length ? (extras as Prisma.InputJsonValue) : undefined,
      });
    }
  }

  let gravadas = 0;
  if (opcoes.gravar && gravar.length) {
    gravadas = (await prisma.itemAberto.createMany({ data: gravar })).count;
  }
  return resumo(aba, previa, gravadas);
}

// ---------------------------------------------------------------- Notas recebidas

/**
 * Linhas de NF de bonificação extraídas do FWI (formato das abas Boni_entrada / Base_recebimentos).
 * Linhas já importadas são ignoradas. Se a planilha trouxer a identificação da boni, a nota já entra vinculada.
 */
export async function importarNotas(buffer: ArrayBuffer, opcoes: { gravar: boolean; usuario: string; origem: string }) {
  const { linhas, aba } = await lerPlanilha(buffer, ["NF"]);
  const loja = await mapaLojas();
  const produto = await mapaProdutos();
  const bonis = await prisma.bonificacao.findMany({ select: { id: true, numero: true } });
  const porNumero = new Map(bonis.map((b) => [b.numero, b.id]));

  const ocorrencias = new Map<string, number>();
  const candidatas: { previa: LinhaPrevia; dado: Prisma.RecebimentoCreateManyInput }[] = [];
  const previa: LinhaPrevia[] = [];

  for (const { numero, valores: v } of linhas) {
    const nf = texto(campo(v, "NF"));
    const quantidade = numeroBr(campo(v, "QUANTIDADE", "Qtde"));
    const vu = numeroBr(campo(v, "VALOR UNITARIO LIQUIDO"));
    // Algumas linhas vêm sem VALOR TOTAL: usa quantidade × valor unitário, ou o TOTAL R$ (igual à carga inicial).
    const valorTotal =
      numeroBr(campo(v, "VALOR TOTAL", "Vlr TT")) ??
      (quantidade !== null && vu !== null ? Math.round(quantidade * vu * 100) / 100 : numeroBr(campo(v, "TOTAL R$")));
    if (!nf || quantidade === null || valorTotal === null) {
      previa.push({ linha: numero, status: "erro", mensagem: "Falta NF, quantidade ou valor total", dados: { NF: nf } });
      continue;
    }
    const lojaCod = campo(v, "Cód.", "Cod", "Código Loja");
    const lojaNome = texto(campo(v, "LOJA", "Loja"));
    const l = loja(lojaCod) ?? loja(lojaNome);
    const prodCod = codigo(texto(campo(v, "PRODUTO", "Cód Produto")), 6);
    const p = produto(prodCod);
    const ttvVigente = numeroBr(campo(v, "TABELA VIGENTE")) ?? (p?.ttv ? Number(p.ttv) : null);
    const valorTabela = numeroBr(campo(v, "TOTAL R$")) ?? (ttvVigente !== null ? quantidade * ttvVigente : valorTotal);

    const ident = campo(v, "N° de identificação interna da boni", "Identificação", "IDENTIFICAÇÃO ÚNICA");
    const nBoni = numeroDoCodigo(ident);
    const bonificacaoId = nBoni !== null ? porNumero.get(nBoni) ?? null : null;

    const base = { nf, lojaCodigo: l?.codigo ?? codigo(texto(lojaCod), 3), produtoCodigo: prodCod, quantidade, valorTotal };
    const k0 = chaveRecebimento({ ...base, ocorrencia: 0 });
    const oc = ocorrencias.get(k0) ?? 0;
    ocorrencias.set(k0, oc + 1);
    const chave = chaveRecebimento({ ...base, ocorrencia: oc });

    const avisos: string[] = [];
    if (!l) avisos.push(`Loja "${texto(lojaCod) ?? lojaNome}" não cadastrada`);
    if (!p && prodCod) avisos.push(`Produto ${prodCod} não cadastrado`);
    if (nBoni !== null && !bonificacaoId) avisos.push(`${texto(ident)} não existe: entra sem vínculo`);

    const linhaPrevia: LinhaPrevia = {
      linha: numero,
      status: avisos.length ? "aviso" : "ok",
      mensagem: avisos.join("; ") || undefined,
      dados: {
        NF: nf,
        Emissão: texto(campo(v, "EMISSAO")) ?? null,
        Loja: l ? `${l.codigo} - ${l.nome}` : lojaNome,
        Produto: `${prodCod ?? ""} ${texto(campo(v, "DESCRICAO")) ?? ""}`.trim(),
        Qtde: quantidade,
        "Total R$": Math.round(valorTabela * 100) / 100,
        Área: texto(campo(v, "AREA ARMAZÉM")),
        Bonificação: bonificacaoId ? codigoBoni(nBoni!) : null,
      },
    };
    candidatas.push({
      previa: linhaPrevia,
      dado: {
        chave,
        nf,
        emissao: dataBr(campo(v, "EMISSAO")),
        dataAceite: dataBr(campo(v, "DATA DO ACEITE", "Data aceite", "DATA")),
        mesAlocacao: dataBr(campo(v, "DT Alocação", "Alocação")),
        lojaCodigo: l?.codigo ?? null,
        lojaNome: lojaNome ?? l?.nome ?? null,
        fornecedor: texto(campo(v, "NOME", "FORNECEDOR")),
        operacao: texto(campo(v, "OPERACAO")),
        produtoCodigo: p?.codigo ?? null,
        descricao: texto(campo(v, "DESCRICAO")),
        quantidade,
        valorUnitario: numeroBr(campo(v, "VALOR UNITARIO LIQUIDO")),
        valorTotal,
        ttvVigente,
        valorTabela: Math.round(valorTabela * 100) / 100,
        alocacao: texto(campo(v, "AREA ARMAZÉM", "Área")),
        referencia: texto(campo(v, "REFERÊNCIA")),
        pedidoBees: texto(campo(v, "N° de pedido do Bees", "N° Pedido Bees", "Pedido Bees")),
        observacao: texto(campo(v, "DESCRIÇÃO/OBS.", "Descrição")),
        bonificacaoId,
        identOriginal: nBoni !== null && !bonificacaoId ? texto(ident) : null,
        associadoPor: bonificacaoId ? `${opcoes.usuario} (importação)` : null,
        associadoEm: bonificacaoId ? new Date() : null,
        origem: opcoes.origem,
      },
    });
  }

  // Ignora o que já está no banco.
  const existentes = new Set<string>();
  const chaves = candidatas.map((c) => c.dado.chave);
  for (let i = 0; i < chaves.length; i += 5000) {
    const r = await prisma.recebimento.findMany({ where: { chave: { in: chaves.slice(i, i + 5000) } }, select: { chave: true } });
    r.forEach((x) => existentes.add(x.chave));
  }
  const novas = candidatas.filter((c) => {
    if (existentes.has(c.dado.chave)) {
      c.previa.status = "ignorada";
      c.previa.mensagem = "Já importada";
    }
    previa.push(c.previa);
    return !existentes.has(c.dado.chave);
  });

  let gravadas = 0;
  if (opcoes.gravar) {
    for (let i = 0; i < novas.length; i += 2000) {
      gravadas += (await prisma.recebimento.createMany({ data: novas.slice(i, i + 2000).map((n) => n.dado), skipDuplicates: true })).count;
    }
  }
  previa.sort((a, b) => a.linha - b.linha);
  return resumo(aba, previa, gravadas);
}

// ---------------------------------------------------------------- Cadastros

/** Tabela de produtos e TTV (formato "Tabela Atual Ambev"). Atualiza os que já existem. */
export async function importarProdutos(buffer: ArrayBuffer, opcoes: { gravar: boolean }) {
  const { linhas, aba } = await lerPlanilha(buffer, ["Cód Armazem", "Cód Arm.", "Código"]);
  const previa: LinhaPrevia[] = [];
  const dados: Prisma.ProdutoCreateInput[] = [];
  for (const { numero, valores: v } of linhas) {
    const cod = codigo(texto(campo(v, "Cód Armazem", "Cód Arm.", "Código")), 6);
    const descricao = texto(campo(v, "Descrição", "Nome Produto", "Produto"));
    if (!cod || !descricao) {
      previa.push({ linha: numero, status: "erro", mensagem: "Falta código ou descrição", dados: { Código: cod } });
      continue;
    }
    const ttv = numeroBr(campo(v, "TTV", "TTV Pós"));
    const d = {
      codigo: cod,
      codigoAmbev: texto(campo(v, "Cód Prod", "Cod.", "Cod Ambev")),
      descricao,
      nomeAmbev: texto(campo(v, "Nome Produto", "NOMENCLATURA AMBEV")),
      pack: texto(campo(v, "Pack")),
      unidadesCaixa: numeroBr(campo(v, "Un.", "Unidades por caixa")) ?? null,
      ttv,
      ttvAtualizado: ttv !== null ? new Date() : null,
    };
    dados.push(d);
    previa.push({ linha: numero, status: ttv === null ? "aviso" : "ok", mensagem: ttv === null ? "Sem TTV" : undefined, dados: { Código: cod, Descrição: descricao, Pack: d.pack, "Un/cx": d.unidadesCaixa, TTV: ttv } });
  }
  let gravadas = 0;
  if (opcoes.gravar) {
    for (const d of dados) {
      const { codigo: c, ...resto } = d;
      await prisma.produto.upsert({ where: { codigo: c }, create: d, update: resto });
      gravadas++;
    }
  }
  return resumo(aba, previa, gravadas);
}

/** Lojas (formato Dados_lojas ou De-para). */
export async function importarLojas(buffer: ArrayBuffer, opcoes: { gravar: boolean }) {
  const { linhas, aba } = await lerPlanilha(buffer, ["Código"]);
  const previa: LinhaPrevia[] = [];
  let gravadas = 0;
  for (const { numero, valores: v } of linhas) {
    const cod = codigo(texto(campo(v, "Código")), 3);
    const empresa = texto(campo(v, "Empresa"));
    const nome = texto(campo(v, "Loja")) ?? empresa?.replace(/^\d{3}\s*-\s*/, "") ?? null;
    if (!cod || !nome) {
      previa.push({ linha: numero, status: "erro", mensagem: "Falta código ou nome", dados: { Código: cod } });
      continue;
    }
    const d = {
      nome,
      cnpjAntigo: texto(campo(v, "CNPJ Antigo")),
      cnpjNovo: texto(campo(v, "CNPJ novo")),
      regiao: texto(campo(v, "REGIÃO")),
      regional: texto(campo(v, "REGIONAL")),
    };
    previa.push({ linha: numero, status: "ok", dados: { Código: cod, Nome: nome, Região: d.regiao, Regional: d.regional } });
    if (opcoes.gravar) {
      // Só sobrescreve campos que vieram preenchidos.
      const update = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== null));
      await prisma.loja.upsert({ where: { codigo: cod }, create: { codigo: cod, ...d }, update });
      gravadas++;
    }
  }
  return resumo(aba, previa, gravadas);
}
