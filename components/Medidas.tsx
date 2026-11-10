"use client";

import { corEficiencia, formatarMinutos } from "@/lib/producao";

// Todas as barras de eficiência usam a mesma escala: 0 a 120%, com a marca de 100%
// sempre no mesmo lugar, para que comparar duas pessoas seja comparar comprimentos.
const ESCALA = 1.2;
const POS_META = `${(1 / ESCALA) * 100}%`;

export function pct(ef: number | null) {
  return ef === null ? "—" : `${(ef * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function BarraEficiencia({ ef }: { ef: number | null }) {
  const cor = corEficiencia(ef);
  const largura = ef === null ? 0 : Math.min(ef / ESCALA, 1) * 100;
  return (
    <div className="eficiencia">
      <div className="barra" role="img" aria-label={`Eficiência ${pct(ef)}`}>
        <div className="barra-preenchida" style={{ width: `${largura}%`, backgroundColor: cor }} />
        <div className="barra-meta" style={{ left: POS_META }} title="100%" />
      </div>
      <strong style={{ color: cor }}>{pct(ef)}</strong>
    </div>
  );
}

export type Nervura = { id: number; minutos: number; rotulo: string };

/**
 * O dia tricotado: cada cupom apontado vira uma nervura, com largura proporcional
 * aos minutos dele. A régua vai até 120% da jornada; o traço escuro marca os 100%.
 */
export function FaixaJornada({
  nervuras,
  disponivel,
  novaId,
}: {
  nervuras: Nervura[];
  disponivel: number;
  novaId?: number | null;
}) {
  const produzido = nervuras.reduce((s, n) => s + n.minutos, 0);
  const total = Math.max(disponivel * ESCALA, produzido, 1);
  const ef = disponivel > 0 ? produzido / disponivel : null;
  return (
    <div>
      <div className="faixa" role="img" aria-label={`${Math.round(produzido)} de ${disponivel} minutos`}>
        <div className="faixa-nervuras">
          {nervuras.map((n) => (
            <div
              key={n.id}
              className="nervura"
              data-nova={n.id === novaId}
              style={{ width: `${(n.minutos / total) * 100}%` }}
              title={n.rotulo}
            />
          ))}
        </div>
        {disponivel > 0 && <div className="faixa-meta" style={{ left: `${(disponivel / total) * 100}%` }} />}
      </div>
      <div className="faixa-legenda">
        <span className="num">
          {nervuras.length} {nervuras.length === 1 ? "cupom" : "cupons"} · cada nervura é um cupom
        </span>
        <span className="num">
          {disponivel > 0
            ? `${formatarMinutos(produzido)} de ${formatarMinutos(disponivel)} · ${pct(ef)}`
            : `${formatarMinutos(produzido)} · dia sem jornada`}
        </span>
      </div>
    </div>
  );
}
