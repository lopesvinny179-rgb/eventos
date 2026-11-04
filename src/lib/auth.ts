import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, lerSessao, type Sessao } from "./sessao";

export async function usuarioAtual(): Promise<Sessao> {
  const s = await lerSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!s) redirect("/login");
  return s;
}

export async function exigirAdmin(): Promise<Sessao> {
  const s = await usuarioAtual();
  if (s.papel !== "ADMIN") throw new Error("Apenas administradores podem fazer isso.");
  return s;
}
