"use client";

import { useEffect, useRef, useState } from "react";
import { DIAS_SEMANA, diaSemana, formatarMinutos } from "@/lib/producao";
import { pct } from "@/components/Medidas";

export type PontoEficiencia = { data: string; produzido: number; disponivel: number };

const ALTURA = 240;
const M = { topo: 18, direita: 56, baixo: 30, esquerda: 44 };

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Eficiência da equipe por dia: uma série só, eixo y em %, eixo x com as datas.
 * A linha de 100% fica marcada; o último ponto leva o valor escrito; o resto
 * aparece ao passar o mouse (ou com as setas do teclado).
 */
export default function GraficoEficiencia({ pontos, carregando }: { pontos: PontoEficiencia[]; carregando?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [pontos.length === 0]);

  if (pontos.length === 0) {
    return (
      <div ref={caixa} className="grafico">
        <div className="vazio" style={{ height: ALTURA, display: "grid", placeContent: "center" }}>
          <strong>Nenhum dia apurado neste período</strong>
          Os dias aparecem aqui quando houver cupons apontados.
        </div>
      </div>
    );
  }

  const valores = pontos.map((p) => (p.disponivel > 0 ? (p.produzido / p.disponivel) * 100 : 0));
  // eixo de 0 até pelo menos 125%, em passos de 25
  const topo = Math.max(125, Math.ceil(Math.max(...valores) / 25) * 25);
  const marcas = Array.from({ length: topo / 25 + 1 }, (_, i) => i * 25);

  const larguraUtil = largura - M.esquerda - M.direita;
  const alturaUtil = ALTURA - M.topo - M.baixo;
  const x = (i: number) => M.esquerda + (pontos.length === 1 ? larguraUtil / 2 : (i / (pontos.length - 1)) * larguraUtil);
  const y = (v: number) => M.topo + alturaUtil - (v / topo) * alturaUtil;
  const caminho = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ultimo = pontos.length - 1;
  // cada data ocupa uns 46px; com mais dias do que cabe, mostra uma a cada N
  const passoDatas = Math.max(1, Math.ceil((pontos.length * 46) / larguraUtil));

  function apontar(e: React.PointerEvent<SVGRectElement>) {
    const caixaSvg = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - caixaSvg.left;
    let melhor = 0;
    for (let i = 1; i < pontos.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setAtivo(melhor);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setAtivo((a) => Math.max(0, (a ?? ultimo + 1) - 1));
    else if (e.key === "ArrowRight") setAtivo((a) => Math.min(ultimo, (a ?? -1) + 1));
    else if (e.key === "Escape") setAtivo(null);
    else return;
    e.preventDefault();
  }

  const p = ativo !== null ? pontos[ativo] : null;
  const dicaEsquerda = ativo !== null ? Math.min(Math.max(x(ativo) - 90, 0), largura - 180) : 0;

  return (
    <div ref={caixa} className="grafico" style={{ opacity: carregando ? 0.5 : 1 }}>
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label={`Eficiência da equipe em ${pontos.length} dias apurados do período. Último dia: ${pct(valores[ultimo] / 100)}.`}
        tabIndex={0}
        onKeyDown={teclado}
        onBlur={() => setAtivo(null)}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line
              x1={M.esquerda}
              x2={largura - M.direita}
              y1={y(m)}
              y2={y(m)}
              className={m === 100 ? "grafico-meta" : "grafico-grade"}
            />
            <text x={M.esquerda - 8} y={y(m)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
              {m}%
            </text>
          </g>
        ))}
        <text x={largura - M.direita + 6} y={y(100)} className="grafico-eixo" dominantBaseline="middle">
          meta
        </text>

        {pontos.map((pt, i) =>
          (ultimo - i) % passoDatas === 0 ? (
            <text key={pt.data} x={x(i)} y={ALTURA - 8} className="grafico-eixo" textAnchor="middle">
              {diaMes(pt.data)}
            </text>
          ) : null
        )}

        {ativo !== null && <line x1={x(ativo)} x2={x(ativo)} y1={M.topo} y2={M.topo + alturaUtil} className="grafico-mira" />}

        <path d={caminho} className="grafico-linha" />
        {valores.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={ativo === i ? 6 : 4} className="grafico-ponto" />
        ))}

        <text x={x(ultimo) + 10} y={y(valores[ultimo])} className="grafico-rotulo" dominantBaseline="middle">
          {pct(valores[ultimo] / 100)}
        </text>

        <rect
          x={M.esquerda - 12}
          y={M.topo}
          width={larguraUtil + 24}
          height={alturaUtil}
          fill="transparent"
          onPointerMove={apontar}
          onPointerLeave={() => setAtivo(null)}
        />
      </svg>

      {p && ativo !== null && (
        <div className="grafico-dica" style={{ left: dicaEsquerda, top: Math.max(0, y(valores[ativo]) - 78) }}>
          <strong>{pct(valores[ativo] / 100)}</strong>
          <span>
            {diaMes(p.data)} · {DIAS_SEMANA[diaSemana(p.data)]}
          </span>
          <span>
            {formatarMinutos(p.produzido)} de {formatarMinutos(p.disponivel)}
          </span>
        </div>
      )}
    </div>
  );
}
