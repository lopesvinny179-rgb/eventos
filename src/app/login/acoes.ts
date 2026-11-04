"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assinarSessao, COOKIE_SESSAO } from "@/lib/sessao";

export async function entrar(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const voltaBruta = String(form.get("volta") ?? "/");
  const volta = voltaBruta.startsWith("/") && !voltaBruta.startsWith("//") ? voltaBruta : "/";
  const u = await prisma.usuario.findUnique({ where: { email } });
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senhaHash))) redirect("/login?erro=1");
  const token = await assinarSessao({ id: u.id, email: u.email, nome: u.nome, papel: u.papel });
  (await cookies()).set(COOKIE_SESSAO, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  redirect(volta);
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
