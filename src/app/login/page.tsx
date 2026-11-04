import { entrar } from "./acoes";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string; volta?: string }> }) {
  const { erro, volta } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={entrar} className="cartao w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">Eventos e Bonificações</h1>
        <input type="hidden" name="volta" value={volta ?? "/"} />
        <div>
          <label className="rotulo" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" required autoFocus />
        </div>
        <div>
          <label className="rotulo" htmlFor="senha">Senha</label>
          <input className="input" id="senha" name="senha" type="password" required />
        </div>
        {erro && <p className="text-sm text-red-700">E-mail ou senha incorretos.</p>}
        <button className="btn w-full justify-center">Entrar</button>
      </form>
    </main>
  );
}
