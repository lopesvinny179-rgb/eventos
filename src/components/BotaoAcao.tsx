"use client";
import { useTransition } from "react";

/** Botão que chama uma server action, com confirmação opcional. */
export function BotaoAcao({ acao, confirmar, className, children }: { acao: () => Promise<unknown>; confirmar?: string; className?: string; children: React.ReactNode }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pendente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => { await acao(); });
      }}
    >
      {pendente ? "..." : children}
    </button>
  );
}
