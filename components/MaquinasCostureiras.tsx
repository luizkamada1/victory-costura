"use client";

import { useState } from "react";
import { formatarMinutos } from "@/lib/producao";

type LinhaMaquinas = { id: number; nome: string; maquinas?: { maquina: string; minutos: number }[] };

// cores das máquinas, da mais usada pela equipe para a menos usada; o resto vira "Outras"
const CORES = ["#c2416b", "#3b7dd8", "#2f9e6e", "#d99a2b", "#8a5cc7", "#4aa3b5"];
const COR_OUTRAS = "#9aa1a9";
const OUTRAS = "Outras";

const pctTexto = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Proporção de máquinas de cada costureira no período: em que máquinas foi o tempo que ela produziu
 * (minutos dos cupons apontados). Ex.: Aline 60% overloque, 40% galoneira.
 */
export default function MaquinasCostureiras({ linhas, carregando }: { linhas: LinhaMaquinas[]; carregando: boolean }) {
  const [foco, setFoco] = useState<string | null>(null);

  const totalEquipe = new Map<string, number>();
  for (const l of linhas) for (const m of l.maquinas ?? []) totalEquipe.set(m.maquina, (totalEquipe.get(m.maquina) ?? 0) + m.minutos);
  const ordemMaquinas = Array.from(totalEquipe.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);
  const principais = ordemMaquinas.length > CORES.length ? ordemMaquinas.slice(0, CORES.length - 1) : ordemMaquinas;
  const temOutras = ordemMaquinas.length > principais.length;
  const cor = (m: string) => (m === OUTRAS ? COR_OUTRAS : CORES[principais.indexOf(m)] ?? COR_OUTRAS);

  const barras = linhas
    .map((l) => {
      const total = (l.maquinas ?? []).reduce((s, m) => s + m.minutos, 0);
      const fatias = new Map<string, number>();
      for (const m of l.maquinas ?? []) {
        const nome = principais.includes(m.maquina) ? m.maquina : OUTRAS;
        fatias.set(nome, (fatias.get(nome) ?? 0) + m.minutos);
      }
      const partes = [...principais, OUTRAS]
        .filter((m) => fatias.has(m))
        .map((m) => ({ maquina: m, minutos: fatias.get(m)!, parte: total > 0 ? fatias.get(m)! / total : 0 }));
      // detalhe completo para a dica (inclui as máquinas agrupadas em "Outras")
      const dica = (l.maquinas ?? [])
        .map((m) => `${m.maquina}: ${pctTexto(total > 0 ? m.minutos / total : 0)} (${formatarMinutos(m.minutos)})`)
        .join("\n");
      const principal = partes.reduce<(typeof partes)[number] | null>((a, b) => (!a || b.parte > a.parte ? b : a), null);
      return { id: l.id, nome: l.nome, total, partes, dica, principal };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => {
      if (foco) {
        const pa = a.partes.find((p) => p.maquina === foco)?.parte ?? 0;
        const pb = b.partes.find((p) => p.maquina === foco)?.parte ?? 0;
        if (pa !== pb) return pb - pa;
      } else {
        // agrupa pela máquina principal (na ordem da legenda) e, dentro dela, de quem fica mais nela
        const ia = [...principais, OUTRAS].indexOf(a.principal?.maquina ?? OUTRAS);
        const ib = [...principais, OUTRAS].indexOf(b.principal?.maquina ?? OUTRAS);
        if (ia !== ib) return ia - ib;
        if ((a.principal?.parte ?? 0) !== (b.principal?.parte ?? 0)) return (b.principal?.parte ?? 0) - (a.principal?.parte ?? 0);
      }
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  if (!barras.length) return null;

  return (
    <section className="bloco" aria-busy={carregando} style={{ opacity: carregando ? 0.5 : 1 }}>
      <div className="bloco-cabecalho" style={{ marginBottom: 8 }}>
        <h2>Máquinas por costureira</h2>
      </div>
      <div className="legenda maq-legenda" role="group" aria-label="Ordenar pela máquina">
        {[...principais, ...(temOutras ? [OUTRAS] : [])].map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={foco === m}
            title={foco === m ? "Voltar à ordem normal" : `Ordenar por quem fica mais em ${m}`}
            onClick={() => setFoco(foco === m ? null : m)}
          >
            <i style={{ background: cor(m) }} />
            {m}
          </button>
        ))}
      </div>
      <div className="maq-lista">
        {barras.map((b) => (
          <div key={b.id} className="maq-linha" title={`${b.nome}\n${b.dica}`}>
            <span className="maq-nome">{b.nome}</span>
            <div
              className="maq-barra"
              role="img"
              aria-label={`${b.nome}: ${b.partes.map((p) => `${p.maquina} ${pctTexto(p.parte)}`).join(", ")}`}
            >
              {b.partes.map((p) => (
                <span
                  key={p.maquina}
                  style={{
                    width: `${p.parte * 100}%`,
                    background: cor(p.maquina),
                    opacity: foco && foco !== p.maquina ? 0.35 : 1,
                  }}
                >
                  {p.parte >= 0.12 ? pctTexto(p.parte) : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
