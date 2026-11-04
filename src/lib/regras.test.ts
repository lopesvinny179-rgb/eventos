import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularItem, chaveRecebimento, codigo, numeroDoCodigo, pendencia, statusCalculado, tipoDeTexto } from "./regras";

test("item DG: caixas × unidades × TTV (linha IDENT_BONI_213 da planilha)", () => {
  const r = calcularItem({ caixas: 26, unidadesCaixa: 12, ttv: 3.4325, tipo: "DG" });
  assert.equal(r.unidades, 312);
  assert.equal(r.total, 1070.94);
  assert.equal(r.pontos, null);
});

test("item Ponto Bees calcula pontos pelo fator 0,0079", () => {
  const r = calcularItem({ caixas: 112, unidadesCaixa: 1, ttv: 50.26, tipo: "PONTO_BEES" });
  assert.equal(r.total, 5629.12);
  assert.equal(r.pontos, 712546.84);
});

test("status pelo recebido", () => {
  assert.equal(statusCalculado(69432.57, 0), "Não identificado");
  assert.equal(statusCalculado(45213.39, 41518.92), "Pagamento parcial");
  assert.equal(statusCalculado(58000, 57689), "Finalizado");
  assert.equal(statusCalculado(14000, 15002.56), "Recebido a maior");
});

test("pendências seguem o critério da aba Pendências_Boni", () => {
  assert.deepEqual(pendencia("DG", []), { situacao: "Não lançada", campos: [] });
  assert.deepEqual(pendencia("DG", [{ pedidoBees: "", dataEntrega: null, statusEntrega: "Entregue" }]), {
    situacao: "Lançamento incompleto",
    campos: ["N° Pedido Bees", "Dt Entrega"],
  });
  // campo preenchido em pelo menos uma linha não conta como pendente
  assert.equal(
    pendencia("DG", [
      { pedidoBees: "1", dataEntrega: new Date(), statusEntrega: "ok" },
      { pedidoBees: null, dataEntrega: null, statusEntrega: null },
    ]),
    null,
  );
  assert.equal(pendencia("DEPOSITO", []), null);
});

test("conversões de texto", () => {
  assert.equal(tipoDeTexto("DG / BONIFICAÇÃO"), "DG");
  assert.equal(tipoDeTexto("PONTO BEES"), "PONTO_BEES");
  assert.equal(tipoDeTexto("DEPÓSITO EM CONTA"), "DEPOSITO");
  assert.equal(numeroDoCodigo("IDENT_BONI_215"), 215);
  assert.equal(numeroDoCodigo(" 300 "), 300);
  assert.equal(numeroDoCodigo("N/A"), null);
  assert.equal(codigo(18, 6), "000018");
  assert.equal(codigo("17", 3), "017");
});

test("chave de NF diferencia linhas repetidas", () => {
  const base = { nf: "868188", lojaCodigo: "001", produtoCodigo: "000018", quantidade: 144, valorTotal: 448.13 };
  assert.notEqual(chaveRecebimento({ ...base, ocorrencia: 0 }), chaveRecebimento({ ...base, ocorrencia: 1 }));
});
