"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search, Ticket as IconeTicket, X } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import type { CartaoOP, Situacao } from "@/app/api/producao/route";
import { Costureira, NOME_PARTE, PARTES, Ticket, dataBrasilia, formatarData, formatarMinutos } from "@/lib/producao";

// Em andamento sem apontamento há mais dias que isso ganha o alerta de parada
const DIAS_ALERTA = 3;

const COLUNAS: { id: Situacao; titulo: string; descricao: string }[] = [
  { id: "aguardando", titulo: "Aguardando", descricao: "Tickets gerados, nenhum cupom apontado" },
  { id: "andamento", titulo: "Em andamento", descricao: "Com cupons apontados, faltando outros" },
  { id: "finalizado", titulo: "Finalizado", descricao: "Todos os cupons apontados" },
];

const pctTexto = (v: number) => `${Math.floor(v * 100)}%`;
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function diasDesde(dataISO: string) {
  return Math.round((Date.parse(dataBrasilia() + "T00:00:00Z") - Date.parse(dataISO + "T00:00:00Z")) / 86400000);
}
function quando(dataISO: string) {
  const d = diasDesde(dataISO);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
}

export default function ProducaoPage() {
  const [cartoes, setCartoes] = useState<CartaoOP[]>([]);
  const [diasFinalizadas, setDiasFinalizadas] = useState(30);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [colecao, setColecao] = useState("");
  const [aberta, setAberta] = useState<CartaoOP | null>(null);

  async function carregar() {
    try {
      const r = await api<{ cartoes: CartaoOP[]; diasFinalizadas: number }>("/api/producao");
      setCartoes(r.cartoes);
      setDiasFinalizadas(r.diasFinalizadas);
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    // atualiza ao voltar para a aba (ex: depois de apontar em outra janela)
    const voltar = () => {
      if (document.visibilityState === "visible") carregar();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, []);

  const colecoes = Array.from(new Set(cartoes.flatMap((c) => c.colecoes))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const termo = normal(busca.trim());
  const visiveis = cartoes.filter(
    (c) =>
      (!colecao || c.colecoes.includes(colecao)) &&
      (!termo || normal([c.op, ...c.referencias, ...c.nomes, ...c.cores].join(" ")).includes(termo))
  );

  const ordenar = (situacao: Situacao, lista: CartaoOP[]) =>
    [...lista].sort((a, b) => {
      // aguardando: as mais antigas primeiro (fila); andamento: as mais adiantadas primeiro; finalizado: as mais recentes
      if (situacao === "aguardando") return a.geradoEm.localeCompare(b.geradoEm) || a.op.localeCompare(b.op, "pt-BR", { numeric: true });
      if (situacao === "andamento") return b.minutosApontados / (b.minutos || 1) - a.minutosApontados / (a.minutos || 1);
      return (b.ultimoApontamento ?? "").localeCompare(a.ultimoApontamento ?? "");
    });

  return (
    <ProducaoLayout titulo="Produção" subtitulo="Cada OP anda sozinha pelo quadro conforme os cupons são apontados.">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="kanban-filtros">
        <label className="kanban-busca">
          <Search size={16} aria-hidden />
          <input placeholder="Buscar OP, referência, pijama ou cor" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && (
            <button type="button" className="botao botao-pequeno botao-icone botao-fantasma" aria-label="Limpar busca" onClick={() => setBusca("")}>
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        {colecoes.length > 0 && (
          <select className="entrada" style={{ width: "auto" }} aria-label="Coleção" value={colecao} onChange={(e) => setColecao(e.target.value)}>
            <option value="">Todas as coleções</option>
            {colecoes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="kanban" aria-busy={carregando}>
        {COLUNAS.map((col) => {
          const lista = ordenar(col.id, visiveis.filter((c) => c.situacao === col.id));
          const pecas = lista.reduce((s, c) => s + c.pecas, 0);
          return (
            <section key={col.id} className="kanban-coluna" data-situacao={col.id} aria-label={col.titulo}>
              <header className="kanban-cabecalho">
                <div>
                  <h2>
                    {col.titulo}
                    <span className="contagem">{lista.length}</span>
                  </h2>
                  <p className="fraco">
                    {col.id === "finalizado" ? `Últimos ${diasFinalizadas} dias` : col.descricao}
                  </p>
                </div>
                <span className="kanban-pecas num">
                  {pecas.toLocaleString("pt-BR")} <span className="fraco">peças</span>
                </span>
              </header>
              <div className="kanban-cartoes">
                {lista.map((c) => (
                  <CartaoKanban key={c.op} cartao={c} onAbrir={() => setAberta(c)} />
                ))}
                {!carregando && lista.length === 0 && <div className="kanban-vazio">Nenhuma OP aqui.</div>}
                {carregando && lista.length === 0 && <div className="kanban-vazio">Carregando…</div>}
              </div>
            </section>
          );
        })}
      </div>

      {aberta && <DetalheOP cartao={aberta} onFechar={() => setAberta(null)} />}
    </ProducaoLayout>
  );
}

function CartaoKanban({ cartao: c, onAbrir }: { cartao: CartaoOP; onAbrir: () => void }) {
  const progresso = c.minutos > 0 ? c.minutosApontados / c.minutos : 0;
  const ultimo = c.ultimoApontamento ? dataBrasilia(c.ultimoApontamento) : null;
  const parado = c.situacao === "andamento" && ultimo !== null && diasDesde(ultimo) >= DIAS_ALERTA;
  const partes = PARTES.filter((p) => c.partes[p]);
  return (
    <button type="button" className="kanban-cartao" data-parado={parado} onClick={onAbrir}>
      <div className="kanban-cartao-topo">
        <strong className="kanban-op num">OP {c.op}</strong>
        <span className="num fraco">{c.pecas.toLocaleString("pt-BR")} pç</span>
      </div>
      <div className="kanban-item">
        <span className="num">{c.referencias.join(", ")}</span>
        {c.nomes.length > 0 && <span className="fraco"> · {c.nomes.join(", ")}</span>}
      </div>
      {c.cores.length > 0 && <div className="kanban-cores fraco">{c.cores.join(" · ")}</div>}

      {c.situacao !== "aguardando" && (
        <div className="kanban-progresso">
          <div className="kanban-barra" role="img" aria-label={`${pctTexto(progresso)} da costura apontada`}>
            <div style={{ width: `${progresso * 100}%` }} />
          </div>
          <span className="num">{pctTexto(progresso)}</span>
        </div>
      )}
      {c.situacao === "andamento" && partes.length > 1 && (
        <div className="kanban-partes num">
          {partes.map((p) => {
            const v = c.partes[p]!;
            return (
              <span key={p}>
                {NOME_PARTE[p].replace("Parte ", "")} <strong>{pctTexto(v.minutos > 0 ? v.apontados / v.minutos : 0)}</strong>
              </span>
            );
          })}
        </div>
      )}

      <div className="kanban-rodape">
        {c.situacao === "aguardando" && <span>Gerada {quando(c.geradoEm)}</span>}
        {c.situacao === "andamento" &&
          (parado ? (
            <span className="kanban-alerta">
              <AlertTriangle size={13} aria-hidden />
              Sem apontamento {quando(ultimo!)}
            </span>
          ) : (
            <span>Último apontamento {ultimo ? quando(ultimo) : "—"}</span>
          ))}
        {c.situacao === "finalizado" && <span>Finalizada {ultimo ? `em ${formatarData(ultimo)}` : ""}</span>}
        <span className="num">{formatarMinutos(c.minutos)}</span>
      </div>
    </button>
  );
}

// Janela com o que falta costurar na OP e quem já trabalhou nela
function DetalheOP({ cartao: c, onFechar }: { cartao: CartaoOP; onFechar: () => void }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    janela.current?.showModal();
    Promise.all([
      api<{ tickets: Ticket[] }>(`/api/tickets?op=${encodeURIComponent(c.op)}`),
      api<{ costureiras: Costureira[] }>("/api/costureiras"),
    ])
      .then(([t, k]) => {
        setTickets(t.tickets);
        setCostureiras(k.costureiras);
      })
      .catch((e) => setErro(mensagemErro(e)));
  }, [c.op]);

  const cupons = (tickets ?? []).flatMap((t) => t.operacoes);
  // o que falta: cupons ainda não apontados, por operação
  const faltam = new Map<string, { parte: string; nome: string; ordem: number; cupons: number; pecas: number; minutos: number }>();
  for (const o of cupons.filter((o) => o.costureira_id === null)) {
    const k = `${o.parte}|${o.nome_operacao}`;
    const atual = faltam.get(k) ?? { parte: o.parte, nome: o.nome_operacao, ordem: o.ordem, cupons: 0, pecas: 0, minutos: 0 };
    atual.cupons += 1;
    atual.pecas += o.quantidade;
    atual.minutos += Number(o.minutos_total);
    atual.ordem = Math.min(atual.ordem, o.ordem);
    faltam.set(k, atual);
  }
  const listaFaltam = Array.from(faltam.values()).sort(
    (a, b) => PARTES.indexOf(a.parte as never) - PARTES.indexOf(b.parte as never) || a.ordem - b.ordem
  );
  // quem já costurou
  const nomePor = new Map(costureiras.map((k) => [k.id, k.nome]));
  const porCostureira = new Map<number, { minutos: number; cupons: number }>();
  for (const o of cupons.filter((o) => o.costureira_id !== null)) {
    const atual = porCostureira.get(o.costureira_id!) ?? { minutos: 0, cupons: 0 };
    atual.minutos += Number(o.minutos_total);
    atual.cupons += 1;
    porCostureira.set(o.costureira_id!, atual);
  }
  const listaCostureiras = Array.from(porCostureira.entries()).sort((a, b) => b[1].minutos - a[1].minutos);
  const progresso = c.minutos > 0 ? c.minutosApontados / c.minutos : 0;

  return (
    <dialog ref={janela} className="modal modal-largo" onClose={onFechar}>
      <div className="modal-conteudo">
        <div className="modal-cabecalho">
          <div>
            <h2 className="num">OP {c.op}</h2>
            <p className="bloco-descricao">
              {c.referencias.join(", ")}
              {c.nomes.length ? ` · ${c.nomes.join(", ")}` : ""} · {c.pecas.toLocaleString("pt-BR")} peças ·{" "}
              {pctTexto(progresso)} apontado ({formatarMinutos(c.minutosApontados)} de {formatarMinutos(c.minutos)})
            </p>
          </div>
          <button type="button" className="botao botao-pequeno botao-icone botao-fantasma" onClick={() => janela.current?.close()} aria-label="Fechar">
            <X size={16} aria-hidden />
          </button>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!tickets && !erro && <div className="vazio">Carregando…</div>}

        {tickets && (
          <>
            <h3 className="detalhe-titulo">{listaFaltam.length ? "Falta costurar" : "Nada falta: todos os cupons foram apontados"}</h3>
            {listaFaltam.length > 0 && (
              <table className="tabela tabela-compacta">
                <thead>
                  <tr>
                    <th>Operação</th>
                    <th style={{ textAlign: "right" }}>Cupons</th>
                    <th style={{ textAlign: "right" }}>Peças</th>
                    <th style={{ textAlign: "right" }}>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {listaFaltam.map((f) => (
                    <tr key={`${f.parte}|${f.nome}`}>
                      <td>
                        <span className={`selo selo-${f.parte}`}>{NOME_PARTE[f.parte as keyof typeof NOME_PARTE].replace("Parte ", "")}</span>{" "}
                        {f.nome}
                      </td>
                      <td className="direita num">{f.cupons}</td>
                      <td className="direita num">{f.pecas.toLocaleString("pt-BR")}</td>
                      <td className="direita num">{formatarMinutos(f.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {listaCostureiras.length > 0 && (
              <>
                <h3 className="detalhe-titulo">Quem já costurou</h3>
                <ul className="detalhe-costureiras">
                  {listaCostureiras.map(([id, v]) => (
                    <li key={id}>
                      <span>{nomePor.get(id) ?? `#${id}`}</span>
                      <span className="fraco num">
                        {v.cupons} {v.cupons === 1 ? "cupom" : "cupons"} · {formatarMinutos(v.minutos)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <div className="modal-rodape">
          <button type="button" className="botao botao-contorno" onClick={() => janela.current?.close()}>
            Fechar
          </button>
          <Link href={`/tickets?op=${encodeURIComponent(c.op)}`} className="botao botao-primario">
            <IconeTicket size={16} aria-hidden />
            Ver tickets
          </Link>
        </div>
      </div>
    </dialog>
  );
}
