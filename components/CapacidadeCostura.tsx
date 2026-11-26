"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, mensagemErro } from "@/components/Layout";
import type { DiaCapacidade } from "@/app/api/capacidade/route";
import { DIAS_SEMANA, diaSemana, formatarMinutos } from "@/lib/producao";

type Resposta = {
  dias: DiaCapacidade[];
  entrou: number;
  saiu: number;
  saldo: number;
  pecasEntrada: number;
  filaInicio: number;
  filaInicioDias: number | null;
  filaAgora: number;
  filaAgoraDias: number | null;
  capacidadeDia: number;
  limite: string;
};

const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dias = (v: number | null) => (v === null ? "—" : `${n1(v)} ${v >= 0.95 && v < 1.05 ? "dia" : "dias"}`);

/**
 * A costura está dando conta? Compara o serviço que entrou (tickets gerados) com o que saiu
 * (cupons apontados) e mostra a fila, em dias de trabalho, ao fim de cada dia útil do período.
 */
export default function CapacidadeCostura({ inicio, fim, pecasSaida }: { inicio: string; fim: string; pecasSaida: number }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!inicio || !fim) return;
    setCarregando(true);
    api<Resposta>(`/api/capacidade?inicio=${inicio}&fim=${fim}`)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(mensagemErro(e)))
      .finally(() => setCarregando(false));
  }, [inicio, fim]);

  const acumulou = (dados?.saldo ?? 0) > 0;
  const variacao =
    dados && dados.filaAgoraDias !== null && dados.filaInicioDias !== null ? dados.filaAgoraDias - dados.filaInicioDias : null;

  return (
    <section className="bloco" aria-busy={carregando}>
      <div className="bloco-cabecalho" style={{ alignItems: "flex-start" }}>
        <div>
          <h2>A costura está dando conta?</h2>
          {dados && dados.entrou + dados.saiu > 0 && (
            <span className="situacao" style={{ color: acumulou ? "var(--erro)" : "var(--ok)", marginTop: 4 }}>
              {acumulou ? <AlertTriangle size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
              {acumulou ? "Acumulando serviço: entrou mais do que saiu" : "Dando conta: saiu tanto ou mais do que entrou"}
            </span>
          )}
        </div>
      </div>
      {erro && <p className="fraco">{erro}</p>}

      <div className="capacidade-kpis num" style={{ opacity: carregando ? 0.5 : 1 }}>
        <div>
          <span className="indicador-rotulo">Entrou</span>
          <strong>{dados ? formatarMinutos(dados.entrou) : "—"}</strong>
          <span className="kpi-nota">{dados ? `${dados.pecasEntrada.toLocaleString("pt-BR")} peças` : ""}</span>
        </div>
        <div>
          <span className="indicador-rotulo">Saiu</span>
          <strong>{dados ? formatarMinutos(dados.saiu) : "—"}</strong>
          <span className="kpi-nota">{pecasSaida.toLocaleString("pt-BR")} peças prontas</span>
        </div>
        <div>
          <span className="indicador-rotulo">Saldo</span>
          <strong style={{ color: !dados || dados.saldo === 0 ? undefined : acumulou ? "var(--erro)" : "var(--ok)" }}>
            {dados ? `${dados.saldo > 0 ? "+" : dados.saldo < 0 ? "−" : ""}${formatarMinutos(Math.abs(dados.saldo))}` : "—"}
          </strong>
          <span className="kpi-nota">{dados ? (acumulou ? "a fila cresceu" : dados.saldo < 0 ? "a fila diminuiu" : "fila igual") : ""}</span>
        </div>
        <div>
          <span className="indicador-rotulo">Fila hoje</span>
          <strong>{dados ? dias(dados.filaAgoraDias) : "—"}</strong>
          <span className="kpi-nota">
            {dados ? `${formatarMinutos(dados.filaAgora)} de costura` : ""}
            {variacao !== null && dados?.filaInicioDias !== null ? ` · era ${dias(dados!.filaInicioDias)}` : ""}
          </span>
        </div>
      </div>

      <h3 className="detalhe-titulo" style={{ marginTop: 14 }}>
        Fila ao fim de cada dia útil <span className="fraco" style={{ fontWeight: 400 }}>· em dias de trabalho</span>
      </h3>
      <GraficoFila dias={dados?.dias ?? []} carregando={carregando} />
    </section>
  );
}

const ALTURA = 170;
const M = { topo: 16, direita: 56, baixo: 28, esquerda: 44 };

function GraficoFila({ dias: pontos, carregando }: { dias: DiaCapacidade[]; carregando?: boolean }) {
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

  const valores = pontos.map((p) => p.filaDias ?? 0);
  if (pontos.length === 0 || pontos.every((p) => p.filaDias === null)) {
    return (
      <div ref={caixa} className="grafico">
        <div className="vazio" style={{ height: ALTURA, display: "grid", placeContent: "center" }}>
          <strong>Sem dados de fila neste período</strong>
          Aparece quando houver tickets gerados e costureiras ativas.
        </div>
      </div>
    );
  }

  const maior = Math.max(1, ...valores);
  const passo = maior <= 2 ? 0.5 : maior <= 5 ? 1 : maior <= 10 ? 2 : 5;
  const topo = Math.ceil(maior / passo) * passo;
  const marcas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const larguraUtil = largura - M.esquerda - M.direita;
  const alturaUtil = ALTURA - M.topo - M.baixo;
  const x = (i: number) => M.esquerda + (pontos.length === 1 ? larguraUtil / 2 : (i / (pontos.length - 1)) * larguraUtil);
  const y = (v: number) => M.topo + alturaUtil - (v / topo) * alturaUtil;
  const linha = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(valores.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ultimo = pontos.length - 1;
  const passoDatas = Math.max(1, Math.ceil((pontos.length * 46) / larguraUtil));
  const subiu = valores[ultimo] > valores[0];

  function apontar(e: React.PointerEvent<SVGRectElement>) {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let melhor = 0;
    for (let i = 1; i < pontos.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setAtivo(melhor);
  }

  const p = ativo !== null ? pontos[ativo] : null;
  const dicaEsquerda = ativo !== null ? Math.min(Math.max(x(ativo) - 95, 0), largura - 190) : 0;

  return (
    <div ref={caixa} className="grafico" style={{ opacity: carregando ? 0.5 : 1 }}>
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label={`Fila em dias de trabalho: começou com ${n1(valores[0])} e terminou com ${n1(valores[ultimo])}.`}
      >
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(m)} y2={y(m)} className="grafico-grade" />
            <text x={M.esquerda - 8} y={y(m)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
              {m.toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {pontos.map((pt, i) =>
          (ultimo - i) % passoDatas === 0 ? (
            <text key={pt.data} x={x(i)} y={ALTURA - 8} className="grafico-eixo" textAnchor="middle">
              {diaMes(pt.data)}
            </text>
          ) : null
        )}
        <path d={area} className={subiu ? "fila-area fila-area-sobe" : "fila-area"} />
        {ativo !== null && <line x1={x(ativo)} x2={x(ativo)} y1={M.topo} y2={M.topo + alturaUtil} className="grafico-mira" />}
        <path d={linha} className={subiu ? "grafico-linha fila-linha-sobe" : "grafico-linha fila-linha-desce"} />
        {ativo !== null && <circle cx={x(ativo)} cy={y(valores[ativo])} r={5} className="grafico-ponto" />}
        <text x={x(ultimo) + 8} y={y(valores[ultimo])} className="grafico-rotulo" dominantBaseline="middle">
          {n1(valores[ultimo])}
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
        <div className="grafico-dica" style={{ width: 190, left: dicaEsquerda, top: Math.max(0, y(valores[ativo]) - 104) }}>
          <strong>{dias(p.filaDias)}</strong>
          <span>
            {diaMes(p.data)} · {DIAS_SEMANA[diaSemana(p.data)]}
          </span>
          <span>
            Entrou {formatarMinutos(p.entrada)} · saiu {formatarMinutos(p.saida)}
          </span>
          <span>Fila {formatarMinutos(p.fila)}</span>
        </div>
      )}
    </div>
  );
}
