import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Eventos e Bonificações", description: "Armazém da Cerveja" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-stone-100 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
