"use client";

import { useEffect, useRef, useState } from "react";

type Opcao = { id: number; nome: string };

/**
 * Lista suspensa com caixas de marcar para escolher uma ou mais costureiras.
 * Nenhuma marcada = equipe toda (rótulo `rotuloTodas`).
 */
export default function SeletorCostureiras({
  opcoes,
  marcadas,
  onChange,
  rotuloTodas,
}: {
  opcoes: Opcao[];
  marcadas: number[];
  onChange: (ids: number[]) => void;
  rotuloTodas: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const ordenadas = [...opcoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const validas = marcadas.filter((id) => opcoes.some((o) => o.id === id));
  const rotulo =
    validas.length === 0
      ? rotuloTodas
      : validas.length === 1
        ? opcoes.find((o) => o.id === validas[0])!.nome
        : `${validas.length} costureiras`;

  const alternar = (id: number) =>
    onChange(validas.includes(id) ? validas.filter((x) => x !== id) : [...validas, id]);

  return (
    <div className="seletor-costureiras" ref={caixa}>
      <button
        type="button"
        className="entrada entrada-pequena seletor-botao"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Costureiras do gráfico"
        onClick={() => setAberto((a) => !a)}
      >
        {rotulo}
      </button>
      {aberto && (
        <div className="seletor-lista" role="listbox" aria-multiselectable="true">
          <label className={validas.length === 0 ? "seletor-todas ativa" : "seletor-todas"}>
            <input type="checkbox" checked={validas.length === 0} onChange={() => onChange([])} />
            {rotuloTodas}
          </label>
          {ordenadas.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={validas.includes(o.id)} onChange={() => alternar(o.id)} />
              {o.nome}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
