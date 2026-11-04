import { Importador } from "@/components/Importador";

export default function Importar() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Importar planilhas</h1>
      <p className="text-sm text-stone-600">Escolha o arquivo e clique em Conferir: nada é gravado antes de você ver a prévia e confirmar.</p>

      <Bloco titulo="Produtos das bonificações" texto="Uma linha por produto aberto, com a coluna Identificação (IDENT_BONI_xxx). Aceita o modelo ou o formato da aba Aberturas_DG.">
        <Importador tipo="itens" modelo="/modelos/itens" />
      </Bloco>
      <Bloco titulo="Notas de bonificação recebidas (FWI)" texto="Extração do FWI no formato da Boni_entrada ou Base_recebimentos. Linhas já importadas são ignoradas; se a planilha tiver a identificação da boni, a nota já entra vinculada.">
        <Importador tipo="notas" />
      </Bloco>
      <Bloco titulo="Tabela de produtos e TTV" texto="Formato da aba Tabela Atual Ambev (Cód Armazem, Descrição, Pack, Un., TTV). Produtos existentes são atualizados.">
        <Importador tipo="produtos" />
      </Bloco>
      <Bloco titulo="Lojas" texto="Formato da aba Dados_lojas ou De-para (Código, Empresa/Loja, CNPJ, Região, Regional).">
        <Importador tipo="lojas" />
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <section className="cartao space-y-2">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-sm text-stone-600">{texto}</p>
      {children}
    </section>
  );
}
