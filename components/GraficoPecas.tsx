"use client";

import { useEffect, useRef, useState } from "react";
import { DIAS_SEMANA, diaSemana } from "@/lib/producao";
import type { PecasDia } from "@/lib/pecas";

const ALTURA_UTIL = 132;
const M = { topo: 22, direita: 56, baixo: 28, esquerda: 44 };
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const n = (v: number) => v.toLocaleString("pt-BR");

// escala "redonda" para o eixo: 1, 2, 2.5 ou 5 × 10^k
function passoBonito(max: number) {
  const bruto = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pot >= bruto) return m * pot;
  return 10 * pot;
}

/** Peças produzidas por dia: uma barra por dia apurado, o valor em cima e a linha da média. */
export default function GraficoPecas({ dias, carregando }: { dias: PecasDia[]; carregando?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [dias.length === 0]);

  if (dias.length === 0) {
    return (
      <div ref={caixa} className="grafico">
        <div className="vazio" style={{ height: ALTURA_UTIL + M.topo + M.baixo, display: "grid", placeContent: "center" }}>
          <strong>Nenhuma peça concluída neste período</strong>
          A peça conta quando todos os cupons dela são apontados.
        </div>
      </div>
    );
  }

  const maior = Math.max(...dias.map((d) => d.pecas), 1);
  const passo = passoBonito(maior);
  const topo = Math.ceil(maior / passo) * passo;
  const marcas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const altura = M.topo + ALTURA_UTIL + M.baixo;
  const larguraUtil = largura - M.esquerda - M.direita;
  const faixa = larguraUtil / dias.length;
  const larguraBarra = Math.min(44, faixa * 0.64);
  const y = (v: number) => M.topo + ALTURA_UTIL - (v / topo) * ALTURA_UTIL;
  const centro = (i: number) => M.esquerda + faixa * i + faixa / 2;
  const media = dias.reduce((s, d) => s + d.pecas, 0) / dias.length;
  const passoDatas = Math.max(1, Math.ceil((dias.length * 46) / larguraUtil));
  const rotulos = faixa >= 30;

  const d = ativo !== null ? dias[ativo] : null;
  const dicaEsquerda = ativo !== null ? Math.min(Math.max(centro(ativo) - 90, 0), largura - 180) : 0;

  return (
    <div ref={caixa} className="grafico" style={{ opacity: carregando ? 0.5 : 1 }}>
      <svg
        width={largura}
        height={altura}
        role="img"
        aria-label={`Peças produzidas em ${dias.length} dias. Média de ${n(Math.round(media))} por dia.`}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(m)} y2={y(m)} className="grafico-grade" />
            <text x={M.esquerda - 8} y={y(m)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
              {n(m)}
            </text>
          </g>
        ))}

        {dias.map((p, i) => {
          const h = y(0) - y(p.pecas);
          const x = centro(i) - larguraBarra / 2;
          const raio = Math.min(4, h, larguraBarra / 2);
          return (
            <g
              key={p.data}
              onPointerEnter={() => setAtivo(i)}
              onPointerLeave={() => setAtivo(null)}
              style={{ opacity: ativo !== null && ativo !== i ? 0.5 : 1, transition: "opacity 120ms ease" }}
            >
              <rect x={M.esquerda + faixa * i} y={M.topo} width={faixa} height={ALTURA_UTIL} fill="transparent" />
              {h > 0 && (
                <path
                  className="barra-pecas"
                  d={`M${x},${y(0)} V${y(p.pecas) + raio} Q${x},${y(p.pecas)} ${x + raio},${y(p.pecas)} H${x + larguraBarra - raio} Q${x + larguraBarra},${y(p.pecas)} ${x + larguraBarra},${y(p.pecas) + raio} V${y(0)} Z`}
                />
              )}
              {rotulos && p.pecas > 0 && (
                <text x={centro(i)} y={y(p.pecas) - 5} className="grafico-rotulo-barra" textAnchor="middle">
                  {n(p.pecas)}
                </text>
              )}
              {(dias.length - 1 - i) % passoDatas === 0 && (
                <text x={centro(i)} y={altura - 8} className="grafico-eixo" textAnchor="middle">
                  {diaMes(p.data)}
                </text>
              )}
            </g>
          );
        })}

        {dias.length > 1 && (
          <>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(media)} y2={y(media)} className="grafico-media" />
            <text x={largura - M.direita + 6} y={y(media)} className="grafico-eixo" dominantBaseline="middle">
              média
            </text>
          </>
        )}
      </svg>

      {d && ativo !== null && (
        <div className="grafico-dica" style={{ left: dicaEsquerda, top: Math.max(0, y(d.pecas) - 96) }}>
          <strong>{n(d.pecas)} peças prontas</strong>
          <span>
            {diaMes(d.data)} · {DIAS_SEMANA[diaSemana(d.data)]}
          </span>
          <span>
            Parte superior {n(d.superior)} · inferior {n(d.inferior)}
          </span>
        </div>
      )}
    </div>
  );
}
