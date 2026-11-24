"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { api, mensagemErro } from "@/components/Layout";
import type { EscopoFila, FilaMaquina, FilaRecorte } from "@/app/api/fila/route";
import { Costureira, Jornada, contaNosIndicadores, formatarMinutos } from "@/lib/producao";

const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Divide as costureiras entre as máquinas na proporção da fila de cada uma (maiores restos)
function distribuir(maquinas: FilaMaquina[], pessoas: number) {
  const total = maquinas.reduce((s, m) => s + m.minutos, 0);
  if (total <= 0 || pessoas <= 0) return maquinas.map(() => ({ ideal: 0, inteiro: 0 }));
  const ideais = maquinas.map((m) => (m.minutos / total) * pessoas);
  const inteiros = ideais.map(Math.floor);
  let sobra = pessoas - inteiros.reduce((s, v) => s + v, 0);
  const ordem = ideais.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) {
    if (sobra <= 0) break;
    inteiros[i] += 1;
    sobra -= 1;
  }
  return ideais.map((ideal, i) => ({ ideal, inteiro: inteiros[i] }));
}

/**
 * Fila de agora por máquina: minutos de costura ainda não apontados, da maior fila para a menor,
 * e quantas costureiras pôr em cada máquina para a fila andar por igual.
 */
export default function FilaMaquinas() {
  const [recortes, setRecortes] = useState<Record<EscopoFila, FilaRecorte> | null>(null);
  const [escopo, setEscopo] = useState<EscopoFila>("todos");
  const [pessoas, setPessoas] = useState(15);
  const [jornadaDia, setJornadaDia] = useState(510);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () =>
      api<Record<EscopoFila, FilaRecorte>>("/api/fila")
        .then((r) => {
          setRecortes(r);
          setErro(null);
        })
        .catch((e) => setErro(mensagemErro(e)));
    carregar();
    // começa com as costureiras ativas e a jornada média de um dia de trabalho
    api<{ costureiras: Costureira[] }>("/api/costureiras")
      .then((r) => {
        const ativas = r.costureiras.filter((c) => c.ativa && contaNosIndicadores(c)).length;
        if (ativas > 0) setPessoas(ativas);
      })
      .catch(() => {});
    api<{ jornada: Jornada }>("/api/jornada")
      .then((r) => {
        const dias = Object.values(r.jornada).map(Number).filter((v) => v > 0);
        if (dias.length) setJornadaDia(dias.reduce((s, v) => s + v, 0) / dias.length);
      })
      .catch(() => {});
    // atualiza ao voltar para a aba (ex: depois de apontar em outra janela)
    const voltar = () => {
      if (document.visibilityState === "visible") carregar();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, []);

  const recorte = recortes?.[escopo] ?? null;
  const maquinas = recorte?.maquinas ?? null;
  const total = recorte?.total ?? 0;
  const lista = maquinas ?? [];
  const maior = Math.max(1, ...lista.map((m) => m.minutos));
  const divisao = distribuir(lista, pessoas);
  const diasFila = pessoas > 0 && jornadaDia > 0 ? total / (pessoas * jornadaDia) : null;

  return (
    <section className="bloco fila-bloco" aria-busy={recortes === null}>
      <div className="fila-cabecalho">
        <div className="fila-titulo">
          <h2>Pendente por máquina</h2>
          <div className="periodo-fichas fichas-pequenas" role="group" aria-label="Quais OPs considerar">
            {(
              [
                ["andamento", "Em andamento"],
                ["aguardando", "Aguardando"],
                ["todos", "Ambos"],
              ] as [EscopoFila, string][]
            ).map(([id, rotulo]) => (
              <button key={id} type="button" className="ficha" aria-pressed={escopo === id} onClick={() => setEscopo(id)}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="fila-pessoas">
          <span className="fraco">Costureiras hoje</span>
          <div className="contador">
            <button type="button" aria-label="Menos uma costureira" onClick={() => setPessoas((p) => Math.max(1, p - 1))}>
              <Minus size={14} aria-hidden />
            </button>
            <input
              className="num"
              inputMode="numeric"
              aria-label="Costureiras trabalhando hoje"
              value={pessoas}
              onChange={(e) => setPessoas(Math.max(0, Math.min(99, Number(e.target.value.replace(/\D/g, "")) || 0)))}
            />
            <button type="button" aria-label="Mais uma costureira" onClick={() => setPessoas((p) => Math.min(99, p + 1))}>
              <Plus size={14} aria-hidden />
            </button>
          </div>
          {diasFila !== null && lista.length > 0 && (
            <span className="fila-resumo num">
              {(recorte?.pecas ?? 0).toLocaleString("pt-BR")} peças · <strong>{n1(diasFila)} {diasFila >= 0.95 && diasFila < 1.05 ? "dia" : "dias"}</strong>{" "}
              de trabalho
            </span>
          )}
        </div>
      </div>

      {erro && <p className="fraco">{erro}</p>}
      {recortes !== null && lista.length === 0 && (
        <div className="vazio">
          {escopo === "andamento"
            ? "Nenhuma OP em andamento com cupons faltando."
            : escopo === "aguardando"
              ? "Nenhuma OP aguardando."
              : "Nada na fila: todos os cupons foram apontados."}
        </div>
      )}
      {recortes === null && !erro && <div className="vazio">Carregando…</div>}

      {lista.length > 0 && (
        <>
          <div className="fila-titulos fraco" aria-hidden>
            <span>Máquina</span>
            <span />
            <span>Fila</span>
            <span>Costureiras ideais</span>
          </div>
          <ul className="fila-maquinas">
            {lista.map((m, i) => {
              const aberto = aberta === m.maquina;
              const { ideal, inteiro } = divisao[i];
              return (
                <Fragment key={m.maquina}>
                  <li>
                    <button
                      type="button"
                      className="fila-linha"
                      aria-expanded={aberto}
                      onClick={() => setAberta(aberto ? null : m.maquina)}
                    >
                      <span className="fila-nome">
                        <ChevronRight size={14} aria-hidden style={{ transform: aberto ? "rotate(90deg)" : "none" }} />
                        {m.maquina}
                      </span>
                      <span className="fila-barra" aria-hidden>
                        <span style={{ width: `${(m.minutos / maior) * 100}%` }} />
                      </span>
                      <span className="fila-valor num">
                        <strong>{formatarMinutos(m.minutos)}</strong>
                        <span className="fraco"> · {total > 0 ? Math.round((m.minutos / total) * 100) : 0}%</span>
                      </span>
                      <span className="fila-ideal num" title={`Proporção exata: ${n1(ideal)} costureiras`}>
                        {inteiro > 0 ? (
                          <>
                            <strong>{inteiro}</strong> {inteiro === 1 ? "costureira" : "costureiras"}
                          </>
                        ) : (
                          <span className="fraco">quem ficar livre</span>
                        )}
                      </span>
                    </button>
                    {aberto && (
                      <div className="fila-ops">
                        <span className="fraco">
                          {m.cupons} {m.cupons === 1 ? "cupom" : "cupons"} em {m.ops.length} {m.ops.length === 1 ? "OP" : "OPs"}:
                        </span>
                        {m.ops.slice(0, 12).map((o) => (
                          <span key={o.op} className="fila-op num">
                            OP {o.op} <span className="fraco">{formatarMinutos(o.minutos)}</span>
                          </span>
                        ))}
                        {m.ops.length > 12 && <span className="fraco">e mais {m.ops.length - 12}</span>}
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
