#!/usr/bin/env python3
"""
Carga inicial do histórico a partir das planilhas atuais.

  pip install openpyxl "psycopg[binary]"
  DATABASE_URL=postgresql://... python3 scripts/carga_inicial.py \
      --mae "Abertura de eventos Centralizado- 2026.xlsx" \
      --compras "Compras_Sistema FWI.xlsm" [--anos 2026,2025] [--conferir]

O que entra:
  planilha mãe  -> lojas (Dados_lojas), bonificações (Consolidado_aberturas),
                   itens abertos (Aberturas_DG e Aberturas_Pontos), recebimentos (Base_recebimentos)
  COMPRAS       -> lojas com região (De-para), produtos e TTV (Tabela Atual Ambev),
                   recebimentos de bonificação (Boni_entrada_<ano>)

Pode ser rodado de novo: lojas e produtos são atualizados, bonificações existentes são
mantidas (os itens são recarregados só para bonificações sem itens) e notas repetidas são ignoradas.
"""
import argparse
import datetime as dt
import os
import re
import sys
import unicodedata
from collections import defaultdict

import openpyxl
import psycopg

FATOR_PONTOS = 0.0079


# ------------------------------------------------------------------ utilitários
def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.replace("\xa0", " ").lower()).strip()


def linhas(wb, aba, procurar):
    """Devolve (cabecalho_normalizado, lista de dicts) a partir da linha que contém `procurar`."""
    ws = wb[aba]
    cab = None
    out = []
    alvo = norm(procurar)
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if cab is None:
            vals = [norm(c) for c in r]
            if alvo in vals:
                vistos = defaultdict(int)
                cab = []
                for v in vals:
                    vistos[v] += 1
                    cab.append(v if vistos[v] == 1 else f"{v} {vistos[v]}")
            elif i > 15:
                raise SystemExit(f"Cabeçalho '{procurar}' não encontrado na aba {aba}")
            continue
        if not any(c not in (None, "") for c in r[: len(cab)]):
            continue
        out.append({h: (r[j] if j < len(r) else None) for j, h in enumerate(cab) if h})
    return out


def g(d, *nomes):
    for n in nomes:
        v = d.get(norm(n))
        if v not in (None, ""):
            return v
    return None


def txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if s == "" or s.upper() in ("N/A", "#N/A", "-") else s


def num(v):
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def data(v):
    if v in (None, ""):
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, (int, float)):
        return dt.date(1899, 12, 30) + dt.timedelta(days=int(v))
    s = str(v).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return dt.date(int(m[3]), int(m[2]), int(m[1]))
    m = re.match(r"^(\d{1,2})/(\d{4})$", s)
    if m:
        return dt.date(int(m[2]), int(m[1]), 1)
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3]))
    return None


def cod(v, n):
    s = txt(v)
    if s is None:
        return None
    if isinstance(v, float) and v.is_integer():
        s = str(int(v))
    return s.zfill(n) if s.isdigit() else s


def num_boni(v):
    m = re.match(r"^(?:IDENT_BONI_)?(\d+)$", str(v or "").strip().upper())
    return int(m[1]) if m else None


def tipo(v):
    t = str(v or "").upper()
    if "PONTO" in t:
        return "PONTO_BEES"
    if "DEP" in t:
        return "DEPOSITO"
    return "DG"


def arred(v, c):
    return None if v is None else round(v, c)


def chave(nf, loja, prod, qtd, valor, oc):
    # Mesmo formato de chaveRecebimento() em src/lib/regras.ts
    def f(x, c):
        x = round(x, c)
        return str(int(x)) if float(x).is_integer() else repr(x)
    return "|".join([nf, loja or "", prod or "", f(qtd, 3), f(valor, 2), str(oc)])


# ------------------------------------------------------------------ carga
class Carga:
    def __init__(self, con):
        self.con = con
        self.cur = con.cursor()
        self.lojas = {}
        self.produtos = {}
        self.bonis = {}

    def loja(self, codigo, nome=None, **extra):
        if not codigo:
            return None
        if codigo not in self.lojas or any(extra.values()):
            nome = nome or self.lojas.get(codigo) or codigo
            self.cur.execute(
                """insert into "Loja"(codigo, nome, "cnpjAntigo", "cnpjNovo", regiao, regional)
                   values (%s,%s,%s,%s,%s,%s)
                   on conflict (codigo) do update set
                     nome = coalesce(excluded.nome, "Loja".nome),
                     "cnpjAntigo" = coalesce(excluded."cnpjAntigo", "Loja"."cnpjAntigo"),
                     "cnpjNovo" = coalesce(excluded."cnpjNovo", "Loja"."cnpjNovo"),
                     regiao = coalesce(excluded.regiao, "Loja".regiao),
                     regional = coalesce(excluded.regional, "Loja".regional)""",
                (codigo, nome, extra.get("cnpjAntigo"), extra.get("cnpjNovo"), extra.get("regiao"), extra.get("regional")),
            )
            self.lojas[codigo] = nome
        return codigo

    def produto(self, codigo, descricao):
        if not codigo:
            return None
        if codigo not in self.produtos:
            self.cur.execute(
                """insert into "Produto"(codigo, descricao) values (%s,%s) on conflict (codigo) do nothing""",
                (codigo, (descricao or codigo).strip()),
            )
            self.produtos[codigo] = True
        return codigo

    def opcao(self, t, v):
        v = txt(v)
        if v:
            self.cur.execute("""insert into "Opcao"(tipo, valor) values (%s,%s) on conflict do nothing""", (t, v))

    # -------------------------------------------------- cadastros
    def carregar_lojas(self, mae, compras):
        for r in linhas(mae, "Dados_lojas", "Código"):
            c = cod(g(r, "Código"), 3)
            emp = txt(g(r, "Empresa")) or ""
            self.loja(c, re.sub(r"^\d{3}\s*-\s*", "", emp) or c, cnpjAntigo=txt(g(r, "CNPJ Antigo")), cnpjNovo=txt(g(r, "CNPJ novo")))
        if compras:
            for r in linhas(compras, "De-para", "Código"):
                c = cod(g(r, "Código"), 3)
                self.loja(c, txt(g(r, "Loja")), regiao=txt(g(r, "REGIÃO")), regional=txt(g(r, "REGIONAL")))
        print(f"  lojas: {len(self.lojas)}")

    def carregar_produtos(self, compras):
        n = 0
        for r in linhas(compras, "Tabela Atual Ambev", "Cód Armazem"):
            c = cod(g(r, "Cód Armazem"), 6)
            desc = txt(g(r, "Descrição")) or txt(g(r, "Nome Produto"))
            if not c or not desc:
                continue
            ttv = num(g(r, "TTV"))
            un = num(g(r, "Un."))
            self.cur.execute(
                """insert into "Produto"(codigo, "codigoAmbev", descricao, "nomeAmbev", pack, "unidadesCaixa", ttv, "ttvAtualizado")
                   values (%s,%s,%s,%s,%s,%s,%s, now())
                   on conflict (codigo) do update set "codigoAmbev"=excluded."codigoAmbev", descricao=excluded.descricao,
                     "nomeAmbev"=excluded."nomeAmbev", pack=excluded.pack, "unidadesCaixa"=excluded."unidadesCaixa",
                     ttv=excluded.ttv, "ttvAtualizado"=now()""",
                (c, txt(g(r, "Cód Prod")), desc, txt(g(r, "Nome Produto")), txt(g(r, "Pack")), int(un) if un else None, ttv),
            )
            self.produtos[c] = True
            n += 1
        print(f"  produtos (Tabela Atual Ambev): {n}")

    # -------------------------------------------------- bonificações e itens
    def carregar_bonificacoes(self, mae):
        self.cur.execute('select numero, id from "Bonificacao"')
        self.bonis = dict(self.cur.fetchall())
        novas = 0
        for r in linhas(mae, "Consolidado_aberturas", "IDENTIFICAÇÃO ÚNICA"):
            n = num_boni(g(r, "IDENTIFICAÇÃO ÚNICA"))
            if n is None:
                continue
            for t, k in [("AREA_ARMAZEM", "AREA ARMAZÉM"), ("AREA_AMBEV", "ÁREA AMBEV (Eventos)"), ("SUBAREA_AMBEV", "SUB ÁREA AMBEV (Eventos)"),
                         ("DONO_ARMAZEM", "DONO ARMAZÉM"), ("DONO_AMBEV", "DONO AMBEV")]:
                self.opcao(t, g(r, k))
            if n in self.bonis:
                continue
            self.cur.execute(
                """insert into "Bonificacao"(numero, "dataSolicitacao", "dataEvento", "areaArmazem", "areaAmbev", "subareaAmbev",
                     "donoArmazem", "donoAmbev", referencia, "tipoPagamento", "valorAbrir", observacao, "criadoPor", "atualizadoEm")
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Carga inicial', now()) returning id""",
                (
                    n, data(g(r, "DATA SOLICITAÇÃO")) or dt.date.today(), data(g(r, "DATA EVENTO")),
                    txt(g(r, "AREA ARMAZÉM")) or "EVENTOS", txt(g(r, "ÁREA AMBEV (Eventos)")), txt(g(r, "SUB ÁREA AMBEV (Eventos)")),
                    txt(g(r, "DONO ARMAZÉM")), txt(g(r, "DONO AMBEV")), txt(g(r, "REFERÊNCIA / NOME DO PAGAMENTO")) or "(sem referência)",
                    tipo(g(r, "TIPO DE PAGAMENTO")), num(g(r, "VALOR À SER ABERTO")) or 0, txt(g(r, "x")),
                ),
            )
            self.bonis[n] = self.cur.fetchone()[0]
            novas += 1
        print(f"  bonificações: {novas} novas, {len(self.bonis)} no total")

    def carregar_itens(self, mae):
        self.cur.execute('select distinct "bonificacaoId" from "ItemAberto"')
        com_itens = {x[0] for x in self.cur.fetchall()}
        ins = 0
        sem_boni = set()

        def inserir(bid, loja, prod, desc, caixas, un, ttv, total, pontos, pedido, entrega, status, obs, extras):
            nonlocal ins
            self.cur.execute(
                """insert into "ItemAberto"("bonificacaoId","lojaCodigo","produtoCodigo",descricao,caixas,"unidadesCaixa",unidades,ttv,total,pontos,
                     "pedidoBees","dataEntrega","statusEntrega",observacao,extras)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (bid, loja, prod, desc, caixas, un, arred(caixas * (un or 1), 3) if caixas is not None else None, ttv, total, pontos,
                 pedido, entrega, status, obs, psycopg.types.json.Jsonb(extras) if extras else None),
            )
            ins += 1

        for r in linhas(mae, "Aberturas_DG", "IDENTIFICAÇÃO ÚNICA"):
            n = num_boni(g(r, "IDENTIFICAÇÃO ÚNICA"))
            bid = self.bonis.get(n)
            if bid is None:
                sem_boni.add(n)
                continue
            if bid in com_itens:
                continue
            loja = self.loja(cod(g(r, "Filial"), 3), txt(g(r, "Loja")))
            desc = txt(g(r, "Descricao do Produto"))
            prod = self.produto(cod(g(r, "Cód AC"), 6), desc)
            caixas, un, ttv = num(g(r, "TT SKU")), num(g(r, "SKU")), num(g(r, "TTV"))
            total = num(g(r, "Pedido original"))
            if total is None and caixas is not None and ttv is not None:
                total = caixas * (un or 1) * ttv
            st1, st2 = txt(g(r, "Status")), txt(g(r, "Stt2"))
            extras = {k: g(r, k) for k in ("Cod Cia", "OP", "PDV", "CDD") if g(r, k) is not None}
            inserir(bid, loja, prod, desc, caixas, int(un) if un else None, ttv, arred(total, 2), None,
                    txt(g(r, "N° Pedido Bees")), data(g(r, "Dt Entrega")), st2 or st1, st1 if st2 else None, extras)

        for r in linhas(mae, "Aberturas_Pontos", "IDENTIFICAÇÃO ÚNICA"):
            n = num_boni(g(r, "IDENTIFICAÇÃO ÚNICA"))
            bid = self.bonis.get(n)
            if bid is None:
                sem_boni.add(n)
                continue
            if bid in com_itens:
                continue
            loja = self.loja(cod(g(r, "Cód."), 3), txt(g(r, "Loja")))
            desc = txt(g(r, "Produto"))
            prod = self.produto(cod(g(r, "Cód. 2"), 6), desc)
            qtde, ttv = num(g(r, "Qtde")), num(g(r, "TTV"))
            total = num(g(r, "TT R$"))
            inserir(bid, loja, prod, desc, qtde, 1 if qtde is not None else None, ttv, arred(total, 2),
                    arred(total / FATOR_PONTOS, 2) if total else None, txt(g(r, "N° Pedido Bees")), data(g(r, "Dt Entrega")),
                    txt(g(r, "Status")), None, None)
        print(f"  itens abertos: {ins}" + (f" (ignorados, boni inexistente: {sorted(x for x in sem_boni if x)})" if sem_boni else ""))

    # -------------------------------------------------- recebimentos
    def carregar_recebimentos(self, rows, origem):
        self.cur.execute('select chave from "Recebimento"')
        existentes = {x[0] for x in self.cur.fetchall()}
        oc = defaultdict(int)
        novos, vinculados, sem = 0, 0, 0
        for r in rows:
            nf = txt(g(r, "NF"))
            qtd, valor = num(g(r, "QUANTIDADE")), num(g(r, "VALOR TOTAL"))
            if valor is None and qtd is not None:
                # Algumas linhas vêm sem VALOR TOTAL: usa quantidade × valor unitário, ou o TOTAL R$.
                vu = num(g(r, "VALOR UNITARIO LIQUIDO"))
                valor = round(qtd * vu, 2) if vu is not None else num(g(r, "TOTAL R$"))
            if not nf or qtd is None or valor is None:
                continue
            nome_loja = txt(g(r, "LOJA", "Loja"))
            loja = cod(g(r, "Cód."), 3)
            if loja:
                self.loja(loja, nome_loja or re.sub(r"^\d{3}\s*-\s*", "", txt(g(r, "Nomenclatura")) or "") or None)
            prod = self.produto(cod(g(r, "PRODUTO"), 6), txt(g(r, "DESCRICAO")))
            k0 = chave(nf, loja, prod, qtd, valor, 0)
            k = chave(nf, loja, prod, qtd, valor, oc[k0])
            oc[k0] += 1

            ident = txt(g(r, "N° de identificação interna da boni"))
            n = num_boni(ident)
            bid = self.bonis.get(n)
            if k in existentes:
                # Já existe (veio da outra planilha): só completa o vínculo se faltar.
                if bid:
                    self.cur.execute(
                        """update "Recebimento" set "bonificacaoId"=%s, "identOriginal"=null, "associadoPor"='Carga inicial', "associadoEm"=now()
                           where chave=%s and "bonificacaoId" is null""", (bid, k))
                    vinculados += self.cur.rowcount
                continue
            tabela = num(g(r, "TABELA VIGENTE"))
            total_tab = num(g(r, "TOTAL R$"))
            if total_tab is None:
                total_tab = qtd * tabela if tabela is not None else valor
            aloc = txt(g(r, "AREA ARMAZÉM"))
            self.opcao("ALOCACAO", aloc)
            self.cur.execute(
                """insert into "Recebimento"(chave,nf,emissao,"dataAceite","mesAlocacao","lojaCodigo","lojaNome",fornecedor,operacao,
                     "produtoCodigo",descricao,quantidade,"valorUnitario","valorTotal","ttvVigente","valorTabela",alocacao,referencia,
                     "pedidoBees",observacao,"bonificacaoId","identOriginal","associadoPor","associadoEm",origem)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (k, nf, data(g(r, "EMISSAO")), data(g(r, "DATA DO ACEITE", "Data aceite", "DATA")), data(g(r, "DT Alocação", "Alocação")),
                 loja, nome_loja, txt(g(r, "NOME")), txt(g(r, "OPERACAO")), prod, txt(g(r, "DESCRICAO")), qtd,
                 num(g(r, "VALOR UNITARIO LIQUIDO")), valor, tabela, round(total_tab, 2), aloc, txt(g(r, "REFERÊNCIA")),
                 txt(g(r, "N° de pedido do Bees")), txt(g(r, "DESCRIÇÃO/OBS.", "Descrição")),
                 bid, ident if (n is not None and bid is None) else None,
                 "Carga inicial" if bid else None, dt.datetime.now() if bid else None, origem),
            )
            existentes.add(k)
            novos += 1
            if bid:
                vinculados += 1
            elif n is not None:
                sem += 1
        print(f"  recebimentos de {origem}: {novos} novos, {vinculados} vinculados" + (f", {sem} com identificação fora do sistema" if sem else ""))

    # -------------------------------------------------- conferência
    def conferir(self, mae):
        self.cur.execute(
            """select b.numero, coalesce(sum(r."valorTabela"),0) from "Bonificacao" b
               left join "Recebimento" r on r."bonificacaoId"=b.id group by b.numero""")
        sistema = {n: float(v) for n, v in self.cur.fetchall()}
        dif = []
        for r in linhas(mae, "Resumo 2", "IDENTIFICAÇÃO ÚNICA"):
            n = num_boni(g(r, "IDENTIFICAÇÃO ÚNICA"))
            plan = num(g(r, "Recebido"))
            if n is None or plan is None:
                continue
            s = sistema.get(n, 0.0)
            if abs(s - plan) > 1:
                dif.append((n, plan, s))
        print(f"\nConferência com Resumo 2: {len(sistema)} bonificações, {len(dif)} com diferença acima de R$ 1")
        for n, p, s in sorted(dif):
            print(f"  IDENT_BONI_{n}: planilha {p:>14,.2f}  sistema {s:>14,.2f}  dif {s - p:>12,.2f}")
        return dif


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mae", required=True, help="Abertura de eventos Centralizado- 2026.xlsx")
    ap.add_argument("--compras", help="Compras_Sistema FWI.xlsm")
    ap.add_argument("--anos", default="2026", help="Abas Boni_entrada_<ano> a carregar, separadas por vírgula")
    ap.add_argument("--conferir", action="store_true", help="Só compara os totais com o Resumo 2, sem gravar")
    a = ap.parse_args()

    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Defina DATABASE_URL")
    print("Lendo planilha mãe...")
    mae = openpyxl.load_workbook(a.mae, read_only=True, data_only=True)
    compras = None
    if a.compras:
        print("Lendo COMPRAS (arquivo grande, pode levar alguns minutos)...")
        compras = openpyxl.load_workbook(a.compras, read_only=True, data_only=True, keep_vba=False)

    with psycopg.connect(url) as con:
        c = Carga(con)
        if a.conferir:
            c.conferir(mae)
            return
        print("Carregando:")
        c.carregar_lojas(mae, compras)
        if compras:
            c.carregar_produtos(compras)
        c.carregar_bonificacoes(mae)
        c.carregar_itens(mae)
        if compras:
            for ano in [x.strip() for x in a.anos.split(",") if x.strip()]:
                aba = f"Boni_entrada_{ano}"
                if aba in compras.sheetnames:
                    c.carregar_recebimentos(linhas(compras, aba, "NF"), aba)
                else:
                    print(f"  aba {aba} não existe, ignorada")
        c.carregar_recebimentos(linhas(mae, "Base_recebimentos", "NF"), "Base_recebimentos (planilha mãe)")
        con.commit()
        c.conferir(mae)


if __name__ == "__main__":
    main()
