import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerSessao } from "@/lib/sessao";

export async function middleware(req: NextRequest) {
  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("volta", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!login|_next|favicon.ico).*)"] };
