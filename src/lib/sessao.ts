// Sessão de login assinada (JWT em cookie httpOnly). Usado pelo middleware e pelas páginas.
import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESSAO = "eventos_sessao";

export type Sessao = { id: number; email: string; nome: string; papel: "ADMIN" | "USUARIO" };

function segredo() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET ausente ou curto demais");
  return new TextEncoder().encode(s);
}

export async function assinarSessao(s: Sessao) {
  return new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(segredo());
}

export async function lerSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo());
    return payload as unknown as Sessao;
  } catch {
    return null;
  }
}
