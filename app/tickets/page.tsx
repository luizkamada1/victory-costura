"use client";

import { Fragment, useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import {
  Costureira,
  Item,
  NOME_PARTE,
  Operacao,
  PARTES,
  Parte,
  Ticket,
  codigoBarras,
  formatarData,
} from "@/lib/producao";

type OpcaoParte = "ambas" | Parte;

export default function TicketsPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  // formulário de geração
  const [op, setOp] = useState("");
  const [itemId, setItemId] = useState("");
  const [cor, setCor] = useState("");
  const [parte, setParte] = useState<OpcaoParte>("ambas");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [tamanhoLivre, setTamanhoLivre] = useState("");
  const [porPacote, setPorPacote] = useState("");

  // lista
  const [buscaOp, setBuscaOp] = useState("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [i, o, c] = await Promise.all([
          api<{ itens: Item[] }>("/api/itens"),
          api<{ operacoes: Operacao[] }>("/api/operacoes"),
          api<{ costureiras: Costureira[] }>("/api/costureiras"),
        ]);
        setItens(i.itens);
        setOperacoes(o.operacoes);
        setCostureiras(c.costureiras);
      } catch (e) {
        setErro(mensagemErro(e));
      }
    })();
    carregarTickets("");
  }, []);

  async function carregarTickets(filtroOp: string) {
    try {
      const r = await api<{ tickets: Ticket[] }>(
        `/api/tickets${filtroOp.trim() ? `?op=${encodeURIComponent(filtroOp.trim())}` : ""}`
      );
      setTickets(r.tickets);
      setSelecionados(new Set());
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const item = itens.find((i) => String(i.id) === itemId);
  const partesItem = item?.partes ?? [];
  const partesEscolhidas: Parte[] = parte === "ambas" ? partesItem : partesItem.filter((p) => p === parte);
  const opPorId = new Map(operacoes.map((o) => [o.id, o]));
  const sequencia = (item?.operacoes ?? [])
    .map((v) => opPorId.get(v.operacao_id))
    .filter((o): o is Operacao => !!o && partesEscolhidas.includes(o.parte));
  const tempoPeca = sequencia.reduce((s, o) => s + o.tempo_minutos, 0);

  const tamanhos = item?.tamanhos.length ? item.tamanhos : [];
  const linhas = tamanhos.length
    ? tamanhos.map((t) => ({ tamanho: t, quantidade: Number(quantidades[t]) || 0 }))
    : [{ tamanho: tamanhoLivre, quantidade: Number(quantidades[""]) || 0 }];
  const totalPecas = linhas.reduce((s, l) => s + l.quantidade, 0);
  const pacote = Number(porPacote) || 0;
  const qtdTickets = linhas.reduce(
    (s, l) => s + (l.quantidade <= 0 ? 0 : pacote > 0 ? Math.ceil(l.quantidade / pacote) : 1),
    0
  );

  function escolherItem(id: string) {
    setItemId(id);
    const novo = itens.find((i) => String(i.id) === id);
    setCor(novo?.cores.length === 1 ? novo.cores[0] : "");
    setParte(novo && novo.partes.length === 1 ? novo.partes[0] : "ambas");
    setQuantidades({});
  }

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setGerando(true);
    // abre a aba antes do await para o navegador não bloquear como pop-up
    const aba = window.open("", "_blank");
    try {
      const r = await api<{ ids: number[] }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          op,
          item_id: item?.id,
          cor,
          partes: partesEscolhidas,
          pecas_por_pacote: pacote,
          linhas,
        }),
      });
      const url = `/tickets/imprimir?ids=${r.ids.join(",")}`;
      if (aba) aba.location.href = url;
      else window.location.href = url;
      setQuantidades({});
      setBuscaOp(op);
      await carregarTickets(op);
    } catch (e) {
      aba?.close();
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function excluir(t: Ticket) {
    if (!confirm(`Excluir o ticket #${t.id} (OP ${t.op}, ${t.tamanho ?? ""})?`)) return;
    try {
      await api(`/api/tickets?id=${t.id}`, { method: "DELETE" });
      await carregarTickets(buscaOp);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  function imprimir(ids: number[]) {
    window.open(`/tickets/imprimir?ids=${ids.join(",")}`, "_blank");
  }

  const nomeCostureira = (id: number | null) => costureiras.find((c) => c.id === id)?.nome ?? "—";

  return (
    <ProducaoLayout titulo="Tickets de Produção" subtitulo="Geração e impressão dos tickets com código de barras">
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}

      <form style={ui.secao} onSubmit={gerar}>
        <h2 style={ui.secaoTitulo}>Gerar tickets</h2>
        <p style={ui.secaoDescricao}>
          É gerado um ticket por tamanho. Cada operação do ticket vira um cupom destacável com código de barras próprio.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <label style={ui.campo}>
            <span style={ui.label}>OP</span>
            <input style={ui.input} value={op} onChange={(e) => setOp(e.target.value)} autoFocus />
          </label>
          <label style={{ ...ui.campo, gridColumn: "span 2" }}>
            <span style={ui.label}>Referência</span>
            <select style={ui.input} value={itemId} onChange={(e) => escolherItem(e.target.value)}>
              <option value="">Selecione…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.referencia} — {i.nome}
                </option>
              ))}
            </select>
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Cor</span>
            <input style={ui.input} list="lista-cores" value={cor} onChange={(e) => setCor(e.target.value)} />
            <datalist id="lista-cores">
              {item?.cores.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Parte</span>
            <select
              style={ui.input}
              value={parte}
              onChange={(e) => setParte(e.target.value as OpcaoParte)}
              disabled={!item}
            >
              {partesItem.length > 1 && <option value="ambas">Ambas</option>}
              {PARTES.filter((p) => partesItem.includes(p)).map((p) => (
                <option key={p} value={p}>
                  {NOME_PARTE[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {item && (
          <>
            <div style={{ marginTop: 16 }}>
              <span style={ui.label}>Quantidade por tamanho</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {tamanhos.length > 0 ? (
                  tamanhos.map((t) => (
                    <label key={t} style={{ ...ui.campo, width: 90 }}>
                      <span style={{ ...ui.label, textAlign: "center" }}>{t}</span>
                      <input
                        type="number"
                        min={0}
                        style={{ ...ui.input, textAlign: "center" }}
                        value={quantidades[t] ?? ""}
                        onChange={(e) => setQuantidades({ ...quantidades, [t]: e.target.value })}
                      />
                    </label>
                  ))
                ) : (
                  <>
                    <label style={{ ...ui.campo, width: 120 }}>
                      <span style={ui.label}>Tamanho</span>
                      <input style={ui.input} value={tamanhoLivre} onChange={(e) => setTamanhoLivre(e.target.value)} />
                    </label>
                    <label style={{ ...ui.campo, width: 120 }}>
                      <span style={ui.label}>Quantidade</span>
                      <input
                        type="number"
                        min={0}
                        style={ui.input}
                        value={quantidades[""] ?? ""}
                        onChange={(e) => setQuantidades({ "": e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label style={{ ...ui.campo, width: 150, marginLeft: "auto" }}>
                  <span style={ui.label}>Peças por pacote (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    style={ui.input}
                    placeholder="sem divisão"
                    value={porPacote}
                    onChange={(e) => setPorPacote(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div style={resumo}>
              <span>
                <b>{sequencia.length}</b> operações ·{" "}
                <b>{tempoPeca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</b> min/peça
              </span>
              <span>
                <b>{totalPecas}</b> peças → <b>{qtdTickets}</b> ticket(s) ·{" "}
                <b>{Math.round(tempoPeca * totalPecas).toLocaleString("pt-BR")}</b> min de costura
              </span>
            </div>
            {sequencia.length === 0 && (
              <p style={{ fontSize: 13, color: "#b45309", margin: "8px 0 0" }}>
                Esse item não tem operações vinculadas para essa parte. Vincule em{" "}
                <a href="/itens">Itens</a>.
              </p>
            )}
          </>
        )}

        <button
          type="submit"
          style={{ ...ui.botaoPrimario, marginTop: 16 }}
          disabled={gerando || !item || !op.trim() || totalPecas <= 0 || sequencia.length === 0}
        >
          {gerando ? "Gerando..." : "Gerar e imprimir tickets"}
        </button>
      </form>

      <section style={ui.secao}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={ui.secaoTitulo}>Tickets gerados</h2>
          <form
            style={{ display: "flex", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              carregarTickets(buscaOp);
            }}
          >
            <input
              style={{ ...ui.input, width: 180 }}
              placeholder="Filtrar por OP"
              value={buscaOp}
              onChange={(e) => setBuscaOp(e.target.value)}
            />
            <button type="submit" style={ui.botaoSecundario}>
              Buscar
            </button>
            {selecionados.size > 0 && (
              <button type="button" style={ui.botaoPrimario} onClick={() => imprimir(Array.from(selecionados))}>
                Imprimir {selecionados.size} selecionado(s)
              </button>
            )}
          </form>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={ui.tabela}>
            <thead>
              <tr>
                <th style={ui.th}>
                  <input
                    type="checkbox"
                    checked={tickets.length > 0 && selecionados.size === tickets.length}
                    onChange={(e) => setSelecionados(new Set(e.target.checked ? tickets.map((t) => t.id) : []))}
                  />
                </th>
                <th style={ui.th}>Ticket</th>
                <th style={ui.th}>OP</th>
                <th style={ui.th}>Ref.</th>
                <th style={ui.th}>Cor</th>
                <th style={ui.th}>Tam.</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Qtd</th>
                <th style={ui.th}>Apontadas</th>
                <th style={ui.th}>Gerado em</th>
                <th style={ui.th}></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const feitas = t.operacoes.filter((o) => o.costureira_id).length;
                const total = t.operacoes.length;
                return (
                  <Fragment key={t.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setAberto(aberto === t.id ? null : t.id)}>
                      <td style={ui.td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(t.id)}
                          onChange={(e) => {
                            const s = new Set(selecionados);
                            if (e.target.checked) s.add(t.id);
                            else s.delete(t.id);
                            setSelecionados(s);
                          }}
                        />
                      </td>
                      <td style={{ ...ui.td, color: "#6b7280" }}>#{t.id}</td>
                      <td style={{ ...ui.td, fontWeight: 700 }}>{t.op}</td>
                      <td style={ui.td}>{t.referencia}</td>
                      <td style={ui.td}>{t.cor ?? "—"}</td>
                      <td style={ui.td}>{t.tamanho ?? "—"}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>{t.quantidade}</td>
                      <td style={ui.td}>
                        <div style={barraFundo}>
                          <div
                            style={{
                              ...barra,
                              width: `${total ? (feitas / total) * 100 : 0}%`,
                              background: feitas === total && total > 0 ? "#22c55e" : "#818cf8",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                          {feitas}/{total}
                        </span>
                      </td>
                      <td style={{ ...ui.td, fontSize: 12.5 }}>{formatarData(t.created_at)}</td>
                      <td style={{ ...ui.td, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        <button style={ui.botaoSecundario} onClick={() => imprimir([t.id])}>
                          Imprimir
                        </button>{" "}
                        <button style={ui.botaoPerigo} onClick={() => excluir(t)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                    {aberto === t.id && (
                      <tr>
                        <td colSpan={10} style={{ ...ui.td, background: "#fafafa", padding: "10px 16px" }}>
                          <table style={{ ...ui.tabela, fontSize: 12.5 }}>
                            <tbody>
                              {t.operacoes.map((o) => (
                                <tr key={o.id}>
                                  <td style={{ padding: "3px 8px", color: "#6b7280", width: 110 }}>{NOME_PARTE[o.parte]}</td>
                                  <td style={{ padding: "3px 8px", width: 30, fontWeight: 700 }}>{o.ordem}º</td>
                                  <td style={{ padding: "3px 8px" }}>{o.nome_operacao}</td>
                                  <td style={{ padding: "3px 8px", color: "#6b7280" }}>{o.maquina ?? "—"}</td>
                                  <td style={{ padding: "3px 8px", fontFamily: "monospace" }}>{codigoBarras(o.id)}</td>
                                  <td style={{ padding: "3px 8px", fontWeight: 600, color: o.costureira_id ? "#15803d" : "#9ca3af" }}>
                                    {o.costureira_id
                                      ? `${nomeCostureira(o.costureira_id)} · ${formatarData(o.data_producao ?? "")}`
                                      : "pendente"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {tickets.length === 0 && <p style={ui.vazio}>Nenhum ticket encontrado.</p>}
        </div>
      </section>
    </ProducaoLayout>
  );
}

const resumo: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 16,
  background: "#f5f7ff",
  border: "1px solid #e0e7ff",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  color: "#374151",
};
const barraFundo: React.CSSProperties = {
  width: 80,
  height: 6,
  background: "#e5e7eb",
  borderRadius: 3,
  overflow: "hidden",
};
const barra: React.CSSProperties = { height: "100%", borderRadius: 3 };
