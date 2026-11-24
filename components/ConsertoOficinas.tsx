"use client";

import { formatarMinutos } from "@/lib/producao";

export type ResumoConsertos = {
  minutos: number;
  porOficina: { oficina: string; minutos: number; costureiras: string[] }[];
  porCostureira: { nome: string; minutos: number }[];
};

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Tempo que a costura gastou consertando serviço de oficinas externas no período.
 * Esse tempo já sai da conta das costureiras; aqui ele aparece para saber o custo de cada oficina.
 */
export default function ConsertoOficinas({
  consertos,
  minutosTrabalhados,
  carregando,
}: {
  consertos: ResumoConsertos;
  minutosTrabalhados: number; // disponível da equipe + o próprio conserto
  carregando: boolean;
}) {
  const maior = Math.max(1, ...consertos.porOficina.map((o) => o.minutos));
  return (
    <section className="bloco" aria-busy={carregando} style={{ opacity: carregando ? 0.5 : 1 }}>
      <div className="bloco-cabecalho" style={{ alignItems: "flex-start" }}>
        <div>
          <h2>Conserto de oficina</h2>
          <span className="fraco" style={{ fontSize: 13 }}>
            <strong className="num" style={{ color: "var(--tinta)" }}>
              {formatarMinutos(consertos.minutos)}
            </strong>{" "}
            consertando serviço de fora
            {minutosTrabalhados > 0 && <span className="num"> · {pct(consertos.minutos / minutosTrabalhados)} do tempo da costura</span>}
          </span>
        </div>
      </div>
      <div className="conserto-lista">
        {consertos.porOficina.map((o) => (
          <div key={o.oficina} className="conserto-linha">
            <div className="conserto-nome">
              <span>{o.oficina}</span>
              {o.costureiras.length > 0 && <small className="fraco">{o.costureiras.join(", ")}</small>}
            </div>
            <div className="fila-barra conserto-barra" aria-hidden>
              <span style={{ width: `${(o.minutos / maior) * 100}%` }} />
            </div>
            <span className="fila-valor num">{formatarMinutos(o.minutos)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
