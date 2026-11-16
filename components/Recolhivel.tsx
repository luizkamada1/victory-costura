"use client";

import { ChevronDown } from "lucide-react";

// Título de bloco que abre e fecha o conteúdo ao clicar
export function TituloRecolhivel({ aberto, onAlternar, children }: { aberto: boolean; onAlternar: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="titulo-recolhivel" onClick={onAlternar} aria-expanded={aberto}>
      <ChevronDown size={18} aria-hidden style={{ transform: aberto ? "none" : "rotate(-90deg)" }} />
      <h2>{children}</h2>
    </button>
  );
}
