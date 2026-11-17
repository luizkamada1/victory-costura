"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMinutos } from "@/lib/producao";
import { pct } from "@/components/Medidas";

export type BarraCostureira = {
  id: number;
  nome: string;
  produzido: number;
  disponivel: number; // base da eficiência (desconta as ausências)
  previsto: number; // base da produtividade (não desconta as ausências)
};

export type Ordem = "eficiencia" | "produtividade";

const ALTURA_UTIL = 200;
const M = { topo: 24, direita: 48, esquerda: 44 };
const LARGURA_MIN = 46; // espaço mínimo de cada costureira; abaixo disso o gráfico rola na horizontal

/**
 * Eficiência e produtividade de cada costureira no período, lado a lado,
 * da maior para a menor (pela medida escolhida). A distância entre as duas barras
 * mostra o quanto as ausências pesaram. A linha de 100% marca a meta.
 */
export default function GraficoCostureiras({
  barras,
  ordem,
  carregando,
}: {
  barras: BarraCostureira[];
  ordem: Ordem;
  carregando?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [barras.length === 0]);

  if (barras.length === 0) {
    return (
      <div ref={caixa} className="grafico">
        <div className="vazio" style={{ height: 180, display: "grid", placeContent: "center" }}>
          <strong>Nenhuma costureira com jornada neste período</strong>
          As barras aparecem quando houver jornada no período.
        </div>
      </div>
    );
  }

  const ordenadas = barras
    .map((b) => ({
      ...b,
      ef: b.disponivel > 0 ? (b.produzido / b.disponivel) * 100 : 0,
      prod: b.previsto > 0 ? (b.produzido / b.previsto) * 100 : 0,
    }))
    .sort((a, b) => (ordem === "eficiencia" ? b.ef - a.ef : b.prod - a.prod) || a.nome.localeCompare(b.nome, "pt-BR"));

  // nomes inclinados quando não cabem deitados; aí a margem esquerda cresce para o primeiro nome caber
  const inclinar = (Math.max(largura, ordenadas.length * LARGURA_MIN) - M.esquerda - M.direita) / ordenadas.length < 78;
  const esq = inclinar ? M.esquerda + 28 : M.esquerda;
  const larguraTotal = Math.max(largura, esq + M.direita + ordenadas.length * LARGURA_MIN);
  const larguraUtil = larguraTotal - esq - M.direita;
  const faixa = larguraUtil / ordenadas.length;
  const larguraBarra = Math.min(30, (faixa * 0.7) / 2);
  const baixo = inclinar ? 64 : 30;
  const altura = M.topo + ALTURA_UTIL + baixo;

  const maior = Math.max(...ordenadas.map((b) => Math.max(b.ef, b.prod)));
  const topo = Math.max(125, Math.ceil(maior / 25) * 25);
  const marcas = Array.from({ length: topo / 25 + 1 }, (_, i) => i * 25);
  const y = (v: number) => M.topo + ALTURA_UTIL - (v / topo) * ALTURA_UTIL;
  const centro = (i: number) => esq + faixa * i + faixa / 2;
  const curto = (nome: string, max: number) => (nome.length > max ? nome.slice(0, max - 1) + "…" : nome);
  const rotulos = larguraBarra >= 17;

  const b = ativo !== null ? ordenadas[ativo] : null;
  const dicaEsquerda = ativo !== null ? Math.min(Math.max(centro(ativo) - 100, 0), larguraTotal - 200) : 0;

  return (
    <div ref={caixa} className="grafico grafico-barras" style={{ opacity: carregando ? 0.5 : 1 }}>
      <div className="grafico-rolagem">
        <svg
          width={larguraTotal}
          height={altura}
          role="img"
          aria-label={`Eficiência e produtividade por costureira: ${ordenadas
            .map((o) => `${o.nome}, eficiência ${pct(o.ef / 100)}, produtividade ${pct(o.prod / 100)}`)
            .join("; ")}.`}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line x1={esq} x2={larguraTotal - M.direita} y1={y(m)} y2={y(m)} className={m === 100 ? "grafico-meta" : "grafico-grade"} />
              <text x={esq - 8} y={y(m)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
                {m}%
              </text>
            </g>
          ))}
          <text x={larguraTotal - M.direita + 6} y={y(100)} className="grafico-eixo" dominantBaseline="middle">
            meta
          </text>

          {ordenadas.map((o, i) => {
            const xEf = centro(i) - larguraBarra - 1;
            const xProd = centro(i) + 1;
            return (
              <g
                key={o.id}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                style={{ opacity: ativo !== null && ativo !== i ? 0.45 : 1, transition: "opacity 120ms ease" }}
              >
                {/* área de toque da faixa inteira */}
                <rect x={esq + faixa * i} y={M.topo} width={faixa} height={ALTURA_UTIL} fill="transparent" />
                <path d={barraArredondada(xEf, y(o.ef), larguraBarra, y(0) - y(o.ef), 3)} className="barra-ef" />
                <path d={barraArredondada(xProd, y(o.prod), larguraBarra, y(0) - y(o.prod), 3)} className="barra-prod" />
                {rotulos && (
                  <>
                    <text x={xEf + larguraBarra / 2} y={y(o.ef) - 5} className="grafico-rotulo-barra" textAnchor="middle">
                      {Math.round(o.ef)}
                    </text>
                    <text x={xProd + larguraBarra / 2} y={y(o.prod) - 5} className="grafico-rotulo-barra fraco-svg" textAnchor="middle">
                      {Math.round(o.prod)}
                    </text>
                  </>
                )}
                {inclinar ? (
                  <text x={centro(i)} y={y(0) + 12} className="grafico-eixo" textAnchor="end" transform={`rotate(-40 ${centro(i)} ${y(0) + 12})`}>
                    {curto(nomeCurto(o.nome), 12)}
                  </text>
                ) : (
                  <text x={centro(i)} y={y(0) + 18} className="grafico-eixo" textAnchor="middle">
                    {curto(nomeCurto(o.nome), Math.max(6, Math.floor(faixa / 7.5)))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* dentro da área que rola, para acompanhar a barra quando há muitas costureiras */}
        {b && ativo !== null && (
          <div className="grafico-dica" style={{ width: 200, left: dicaEsquerda, top: Math.max(0, y(Math.max(b.ef, b.prod)) - 112) }}>
            <span style={{ color: "var(--tinta)", fontWeight: 600 }}>{b.nome}</span>
            <span className="dica-linha">
              <i className="legenda-ef" /> Eficiência <b>{pct(b.ef / 100)}</b>
            </span>
            <span className="dica-linha">
              <i className="legenda-prod" /> Produtividade <b>{pct(b.prod / 100)}</b>
            </span>
            <span>
              {formatarMinutos(b.produzido)} produzidos
              {b.previsto > b.disponivel ? ` · ${formatarMinutos(b.previsto - b.disponivel)} de ausências` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// barra com os cantos de cima arredondados e a base reta
function barraArredondada(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const raio = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + raio} Q${x},${y} ${x + raio},${y} H${x + w - raio} Q${x + w},${y} ${x + w},${y + raio} V${y + h} Z`;
}

// "Maria da Silva Souza" → "Maria S." (o nome inteiro aparece ao passar o mouse)
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? "";
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
