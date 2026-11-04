import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { sair } from "../login/acoes";

const MENU = [
  ["/", "Painel"],
  ["/bonificacoes/nova", "Nova bonificação"],
  ["/importar", "Importar planilhas"],
  ["/associacao", "Associação de NFs"],
  ["/pendencias", "Pendências"],
  ["/cadastros", "Cadastros"],
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual();
  return (
    <div>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
          <Link href="/" className="font-semibold text-marca">Eventos e Bonificações</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {MENU.map(([href, rotulo]) => (
              <Link key={href} href={href} className="text-stone-700 hover:text-marca">{rotulo}</Link>
            ))}
          </nav>
          <form action={sair} className="ml-auto flex items-center gap-2 text-sm text-stone-500">
            <span>{u.nome}</span>
            <button className="underline hover:text-marca">sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
