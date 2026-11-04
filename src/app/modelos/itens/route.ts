import { usuarioAtual } from "@/lib/auth";
import { gerarPlanilha } from "@/lib/planilha";

// Modelo para lançar produtos de bonificações por planilha.
export async function GET() {
  await usuarioAtual();
  const buf = await gerarPlanilha([
    {
      nome: "Itens",
      colunas: [
        { titulo: "Identificação", chave: "a", largura: 18 },
        { titulo: "Cód Loja", chave: "b", largura: 10 },
        { titulo: "Cód Produto", chave: "c", largura: 12 },
        { titulo: "Caixas", chave: "d", largura: 10 },
        { titulo: "Unidades por caixa", chave: "e", largura: 18 },
        { titulo: "TTV", chave: "f", largura: 10 },
        { titulo: "N° Pedido Bees", chave: "g", largura: 16 },
        { titulo: "Dt Entrega", chave: "h", largura: 12, formato: "dd/mm/yyyy" },
        { titulo: "Status", chave: "i", largura: 14 },
        { titulo: "Observação", chave: "j", largura: 30 },
      ],
      linhas: [{ a: "IDENT_BONI_213", b: "020", c: "000025", d: 26, e: "", f: "", g: "", h: "", i: "", j: "Exemplo: apague esta linha. Un/cx e TTV vazios usam o cadastro do produto." }],
    },
  ]);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-itens-bonificacao.xlsx"',
    },
  });
}
