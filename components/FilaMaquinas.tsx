"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, mensagemErro } from "@/components/Layout";
import type { FilaMaquina } from "@/app/api/fila/route";
import { formatarMinutos } from "@/lib/producao";

/**
 * Fila de agora por máquina: minutos de costura ainda não apontados, da maior fila para a menor.
 * A maior barra mostra onde a produção vai travar. Clicar numa máquina mostra as OPs da fila dela.
 */
export default function FilaMaquinas() {
  const [maquinas, setMaquinas] = useState<FilaMaquina[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () =>
      api<{ maquinas: FilaMaquina[]; total: number }>("/api/fila")
        .then((r) => {
          setMaquinas(r.maquinas);
          setTotal(r.total);
          setErro(null);
        })
        .catch((e) => setErro(mensagemErro(e)));
    carregar();
    // atualiza ao voltar para a aba (ex: depois de apontar em outra janela)
    const voltar = () => {
      if (document.visibilityState === "visible") carregar();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, []);

  const maior = Math.max(1, ...(maquinas ?? []).map((m) => m.minutos));

  return (
    <section className="bloco" aria-busy={maquinas === null}>
      <div className="bloco-cabecalho" style={{ marginBottom: 10 }}>
        <div>
          <h2>Pendente por máquina</h2>
          <p className="bloco-descricao">
            Fila de agora, sem depender do período
            {maquinas?.length ? (
              <>
                {" · "}
                <span className="num">{formatarMinutos(total)}</span> de costura a fazer
              </>
            ) : null}
          </p>
        </div>
      </div>

      {erro && <p className="fraco">{erro}</p>}
      {maquinas !== null && maquinas.length === 0 && <div className="vazio">Nada na fila: todos os cupons foram apontados.</div>}
      {maquinas === null && !erro && <div className="vazio">Carregando…</div>}

      {maquinas && maquinas.length > 0 && (
        <ul className="fila-maquinas">
          {maquinas.map((m) => {
            const aberto = aberta === m.maquina;
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
      )}
    </section>
  );
}
