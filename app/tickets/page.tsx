"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FilePlus2, Printer, Search, TicketPlus, Trash2, X } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import {
  AJUSTES_PADRAO,
  AjustesGrade,
  Costureira,
  Item,
  NOME_PARTE,
  Operacao,
  PARTES,
  Parte,
  Ticket,
  TicketOperacao,
  codigoBarras,
  fatorGrade,
  formatarData,
} from "@/lib/producao";

type OpcaoParte = "ambas" | Parte;
const rotuloItem = (i: Item) => `${i.referencia} · ${i.nome}`;

// tamanho gravado no ticket quando a cor vai inteira, sem separar por tamanho
const TAMANHO_UNICO = "Único";

type GrupoCor = { chave: number; cor: string; qtd: Record<string, string> };

let proximaChave = 0;
const novoGrupo = (cor: string): GrupoCor => ({ chave: ++proximaChave, cor, qtd: {} });

const min = (m: number) => m.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function TicketsPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerados, setGerados] = useState<number | null>(null);
  const [ticketCupons, setTicketCupons] = useState<number[] | null>(null);
  const [avisoLista, setAvisoLista] = useState<{ tipo: "ok" | "alerta"; texto: string } | null>(null);
  const [ajustes, setAjustes] = useState<AjustesGrade>({ ...AJUSTES_PADRAO });

  // formulário de geração
  const [op, setOp] = useState("");
  const [itemId, setItemId] = useState("");
  const [textoRef, setTextoRef] = useState("");
  const [parte, setParte] = useState<OpcaoParte>("ambas");
  const [grupos, setGrupos] = useState<GrupoCor[]>([novoGrupo("")]);
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
        const a = await api<{ ajustes: AjustesGrade }>("/api/ajustes-grade").catch(() => null);
        if (a) setAjustes(a.ajustes);
      } catch (e) {
        setErro(mensagemErro(e));
      }
    })();
    // vindo do quadro de Produção (/tickets?op=123), já abre com a OP buscada
    const opDaUrl = new URLSearchParams(window.location.search).get("op")?.trim() ?? "";
    if (opDaUrl) setBuscaOp(opDaUrl);
    carregarTickets(opDaUrl);
  }, []);

  // ao voltar da aba de impressão, atualiza a coluna Impresso sem perder busca e seleção
  const estado = useRef({ buscaOp, selecionados });
  estado.current = { buscaOp, selecionados };
  useEffect(() => {
    const voltar = () => {
      if (document.visibilityState === "visible") carregarTickets(estado.current.buscaOp, estado.current.selecionados);
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarTickets(filtroOp: string, manterSelecao?: Set<number>) {
    try {
      const r = await api<{ tickets: Ticket[] }>(`/api/tickets${filtroOp.trim() ? `?op=${encodeURIComponent(filtroOp.trim())}` : ""}`);
      setTickets(r.tickets);
      setSelecionados(manterSelecao ?? new Set());
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
  // mesmo cálculo do servidor: tempo cadastrado (grade Adulto) × ajuste da grade do item
  const tempoPeca = sequencia.reduce((s, o) => s + o.tempo_minutos, 0) * fatorGrade(item?.grades, ajustes);

  // Sem tamanhos cadastrados, a grade tem uma coluna só, com o tamanho digitado à mão
  // A 1ª coluna é sempre "Único": a quantidade da cor sem separar por tamanho, num ticket só
  const tamanhos = [TAMANHO_UNICO, ...(item?.tamanhos.length ? item.tamanhos : [tamanhoLivre])];
  const linhasDo = (g: GrupoCor) => tamanhos.map((t) => ({ tamanho: t, quantidade: Number(g.qtd[t]) || 0 }));
  const totalDo = (g: GrupoCor) => linhasDo(g).reduce((s, l) => s + l.quantidade, 0);
  const totalPecas = grupos.reduce((s, g) => s + totalDo(g), 0);
  const pacote = Number(porPacote) || 0;
  const qtdTickets = grupos
    .flatMap(linhasDo)
    .reduce((s, l) => s + (l.quantidade <= 0 ? 0 : pacote > 0 ? Math.ceil(l.quantidade / pacote) : 1), 0);

  // aceita o texto escolhido na lista ("27100 · Nome") ou só a referência digitada ("27100")
  function digitarReferencia(texto: string) {
    setTextoRef(texto);
    const limpo = texto.trim().toLowerCase();
    const achado = itens.find((i) => rotuloItem(i).toLowerCase() === limpo || i.referencia.toLowerCase() === limpo);
    const id = achado ? String(achado.id) : "";
    if (id !== itemId) escolherItem(id);
  }

  function escolherItem(id: string) {
    setItemId(id);
    const novo = itens.find((i) => String(i.id) === id);
    setParte(novo && novo.partes.length === 1 ? novo.partes[0] : "ambas");
    // uma linha para cada cor cadastrada no item; as que ficarem zeradas não geram ticket
    setGrupos(novo?.cores.length ? novo.cores.map(novoGrupo) : [novoGrupo("")]);
  }

  // Com quantidade no Único, a cor vai inteira num ticket só: os tamanhos dela são apagados e ficam bloqueados
  function mudarQuantidade(chave: number, tamanho: string, valor: string) {
    setGrupos((atual) =>
      atual.map((g) => {
        if (g.chave !== chave) return g;
        if (tamanho === TAMANHO_UNICO && Number(valor) > 0) return { ...g, qtd: { [TAMANHO_UNICO]: valor } };
        return { ...g, qtd: { ...g.qtd, [tamanho]: valor } };
      })
    );
  }

  // imprimirAgora = false gera e deixa os tickets marcados na lista, para imprimir vários juntos depois
  async function gerar(imprimirAgora: boolean) {
    setErro(null);
    setGerados(null);
    setGerando(true);
    // abre a aba antes do await para o navegador não bloquear como pop-up
    const aba = imprimirAgora ? window.open("", "_blank") : null;
    try {
      const r = await api<{ ids: number[] }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          op,
          item_id: item?.id,
          partes: partesEscolhidas,
          pecas_por_pacote: pacote,
          grupos: grupos.map((g) => ({ cor: g.cor, linhas: linhasDo(g) })),
        }),
      });
      setGrupos((atual) => atual.map((g) => ({ ...g, qtd: {} })));
      if (imprimirAgora) {
        const url = `/tickets/imprimir?ids=${r.ids.join(",")}`;
        if (aba) aba.location.href = url;
        else window.location.href = url;
        setBuscaOp(op);
        await carregarTickets(op);
      } else {
        // mostra os mais recentes de todas as OPs, somando os novos à seleção que já existia
        setBuscaOp("");
        await carregarTickets("", new Set([...Array.from(selecionados), ...r.ids]));
        setGerados(r.ids.length);
      }
    } catch (e) {
      aba?.close();
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function excluir(t: Ticket) {
    if (!confirm(`Excluir o ticket #${t.id} (OP ${t.op}, tamanho ${t.tamanho ?? "—"})? Os cupons impressos deixam de valer.`)) return;
    try {
      await api(`/api/tickets?id=${t.id}`, { method: "DELETE" });
      await carregarTickets(buscaOp);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // Exclui os selecionados depois de confirmar. Os que têm cupons apontados nunca são excluídos.
  async function excluirSelecionados() {
    const escolhidos = tickets.filter((t) => selecionados.has(t.id));
    if (!escolhidos.length) return;
    const comApontamento = escolhidos.filter((t) => apontadas(t) > 0);
    const podem = escolhidos.filter((t) => apontadas(t) === 0);
    if (!podem.length) {
      alert(
        `Nenhum dos tickets selecionados pode ser excluído: todos têm cupons já apontados (${comApontamento
          .map((t) => `#${t.id}`)
          .join(", ")}). Desfaça os apontamentos antes.`
      );
      return;
    }
    const ops = Array.from(new Set(podem.map((t) => t.op)));
    const impressos = podem.filter((t) => t.impresso_em).length;
    const linhas = [
      `Excluir ${podem.length} ${podem.length === 1 ? "ticket" : "tickets"} (${ops.length === 1 ? "OP" : "OPs"} ${ops.join(", ")})?`,
      "",
      impressos
        ? `• ${impressos} ${impressos === 1 ? "já foi impresso" : "já foram impressos"}: os cupons impressos deixam de valer e não poderão ser apontados.`
        : "",
      comApontamento.length
        ? `• ${comApontamento.length} ${comApontamento.length === 1 ? "tem" : "têm"} cupons apontados e não ${comApontamento.length === 1 ? "será excluído" : "serão excluídos"} (${comApontamento.map((t) => `#${t.id}`).join(", ")}).`
        : "",
      "",
      "Essa ação não pode ser desfeita.",
    ].filter((l, i, todas) => l !== "" || (i > 0 && todas[i - 1] !== ""));
    if (!confirm(linhas.join("\n"))) return;

    setErro(null);
    setAvisoLista(null);
    try {
      const r = await api<{ excluidos: number[]; bloqueados: number[] }>(
        `/api/tickets?ids=${escolhidos.map((t) => t.id).join(",")}`,
        { method: "DELETE" }
      );
      await carregarTickets(buscaOp);
      setAvisoLista({
        tipo: r.bloqueados.length ? "alerta" : "ok",
        texto:
          `${r.excluidos.length} ${r.excluidos.length === 1 ? "ticket excluído" : "tickets excluídos"}.` +
          (r.bloqueados.length
            ? ` ${r.bloqueados.length} não ${r.bloqueados.length === 1 ? "foi excluído" : "foram excluídos"} por ter cupons apontados (${r.bloqueados.map((id) => `#${id}`).join(", ")}).`
            : ""),
      });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // Ao imprimir tickets que já têm cupons apontados, pergunta se imprime só o que falta ou tudo
  const [perguntaImpressao, setPerguntaImpressao] = useState<number[] | null>(null);
  function imprimir(ids: number[]) {
    const escolhidos = tickets.filter((t) => ids.includes(t.id));
    const temApontado = escolhidos.some((t) => t.operacoes.some((o) => o.costureira_id));
    const temPendente = escolhidos.some((t) => t.operacoes.some((o) => !o.costureira_id));
    if (temApontado && temPendente) setPerguntaImpressao(ids);
    else window.open(`/tickets/imprimir?ids=${ids.join(",")}`, "_blank");
  }
  function imprimirPendentes(ids: number[]) {
    const escolhidos = tickets.filter((t) => ids.includes(t.id));
    const cupons = escolhidos.flatMap((t) => t.operacoes.filter((o) => !o.costureira_id).map((o) => o.id));
    const comPendente = escolhidos.filter((t) => t.operacoes.some((o) => !o.costureira_id)).map((t) => t.id);
    window.open(`/tickets/imprimir?ids=${comPendente.join(",")}&cupons=${cupons.join(",")}`, "_blank");
  }

  const nomeCostureira = (id: number | null) => costureiras.find((c) => c.id === id)?.nome ?? "—";
  const apontadas = (t: Ticket) => t.operacoes.filter((o) => o.costureira_id).length;
  const situacao = (t: Ticket) => {
    const f = apontadas(t);
    return f === 0 ? "pendente" : f === t.operacoes.length ? "completo" : "em andamento";
  };

  // As linhas visíveis só existem depois do useTabela; o checkbox do título lê esta variável
  // ao renderizar (o que acontece depois desta função terminar), então sempre vê o valor atual.
  let idsVisiveis: number[] = [];
  const tabela = useTabela<Ticket>(
    tickets,
    [
      {
        id: "selecao",
        titulo: <MarcarTodos ids={() => idsVisiveis} selecionados={selecionados} onChange={setSelecionados} />,
        ordenavel: false,
        filtravel: false,
        largura: 36,
      },
      { id: "id", titulo: "Ticket", valor: (t) => t.id, texto: (t) => `#${t.id}` },
      { id: "op", titulo: "OP", valor: (t) => t.op },
      { id: "referencia", titulo: "Ref.", valor: (t) => t.referencia },
      { id: "cor", titulo: "Cor", valor: (t) => t.cor },
      { id: "tamanho", titulo: "Tam.", valor: (t) => t.tamanho },
      { id: "parte", titulo: "Parte", valor: (t) => abreviarPartes(t.partes) },
      { id: "quantidade", titulo: "Peças", alinhar: "right", valor: (t) => t.quantidade },
      {
        id: "apontadas",
        titulo: "Cupons",
        valor: (t) => (t.operacoes.length ? apontadas(t) / t.operacoes.length : 0),
        texto: situacao,
      },
      { id: "criado", titulo: "Gerado", valor: (t) => t.created_at, texto: (t) => formatarData(t.created_at) },
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "id", direcao: "desc" }
  );
  idsVisiveis = tabela.visiveis.map((t) => t.id);

  const podeGerar = !!item && !!op.trim() && totalPecas > 0 && sequencia.length > 0;

  return (
    <ProducaoLayout titulo="Tickets" subtitulo="Gere os tickets de uma OP. Cada operação vira um cupom destacável com código de barras.">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <form
        className="bloco"
        onSubmit={(e) => {
          e.preventDefault();
          gerar(true);
        }}
      >
        <div className="bloco-cabecalho">
          <div>
            <h2>Gerar tickets</h2>
            <p className="bloco-descricao">
              Sai um ticket para cada cor e tamanho com quantidade, ou vários se você dividir em pacotes.
            </p>
          </div>
        </div>
        <div className="campos grade-ticket">
          <label className="campo">
            <span>OP</span>
            <input className="entrada num" value={op} onChange={(e) => setOp(e.target.value)} autoFocus />
          </label>
          <label className="campo">
            <span>Referência</span>
            {/* campo de busca: digitar parte da referência ou do nome filtra a lista de sugestões */}
            <input
              className="entrada"
              list="lista-referencias"
              placeholder="Digite a referência ou o nome do item"
              value={textoRef}
              onChange={(e) => digitarReferencia(e.target.value)}
              onBlur={() => item && setTextoRef(rotuloItem(item))}
            />
            <datalist id="lista-referencias">
              {itens.map((i) => (
                <option key={i.id} value={rotuloItem(i)} />
              ))}
            </datalist>
            {textoRef.trim() &&
              !item &&
              !itens.some((i) => rotuloItem(i).toLowerCase().includes(textoRef.trim().toLowerCase())) && (
                <small style={{ color: "var(--alerta)" }}>Nenhuma referência encontrada</small>
              )}
          </label>
          <label className="campo">
            <span>Parte</span>
            <select className="entrada" value={parte} onChange={(e) => setParte(e.target.value as OpcaoParte)} disabled={!item}>
              {partesItem.length !== 1 && <option value="ambas">Superior e inferior</option>}
              {PARTES.filter((p) => partesItem.includes(p)).map((p) => (
                <option key={p} value={p}>
                  {NOME_PARTE[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {item && (
          <div className="cores-tamanhos">
            {!item.tamanhos.length && (
              <label className="campo" style={{ width: 160, marginBottom: 12 }}>
                <span>Tamanho</span>
                <input className="entrada" value={tamanhoLivre} onChange={(e) => setTamanhoLivre(e.target.value)} />
              </label>
            )}
            <div className="tabela-caixa">
              <table className="tabela grade-quantidades">
                <thead>
                  <tr>
                    <th>Cor</th>
                    {tamanhos.map((t, i) => (
                      <th
                        key={i}
                        className={`direita ${t === TAMANHO_UNICO ? "col-unico" : ""}`}
                        style={{ textAlign: "center" }}
                        title={t === TAMANHO_UNICO ? "Todos os tamanhos juntos, num ticket só" : undefined}
                      >
                        {t === TAMANHO_UNICO ? "Único" : item.tamanhos.length ? t : "Peças"}
                      </th>
                    ))}
                    <th className="direita">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr key={g.chave}>
                      <td className="forte">{g.cor || <span className="fraco">Sem cor cadastrada</span>}</td>
                      {tamanhos.map((t, i) => (
                        <td key={i} className={t === TAMANHO_UNICO ? "col-unico" : undefined}>
                          {/* texto só com números: sem setinhas e sem a rodinha do mouse mudar o valor */}
                          <input
                            inputMode="numeric"
                            autoComplete="off"
                            className="entrada num qtd"
                            aria-label={`${g.cor || "Cor"}, tamanho ${t}`}
                            value={g.qtd[t] ?? ""}
                            disabled={t !== TAMANHO_UNICO && Number(g.qtd[TAMANHO_UNICO]) > 0}
                            title={
                              t !== TAMANHO_UNICO && Number(g.qtd[TAMANHO_UNICO]) > 0
                                ? "Bloqueado: esta cor vai inteira no Único"
                                : undefined
                            }
                            onChange={(e) => mudarQuantidade(g.chave, t, e.target.value.replace(/\D/g, ""))}
                          />
                        </td>
                      ))}
                      <td className="direita forte">{totalDo(g) || <span className="fraco">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!item.cores.length && (
              <p className="bloco-descricao" style={{ marginTop: 8 }}>
                Este item não tem cores cadastradas, então os tickets saem sem cor. Cadastre as cores em{" "}
                <a href="/itens">Itens</a>.
              </p>
            )}
            <div className="cores-rodape">
              <label className="campo" style={{ width: 180 }}>
                <span>Peças por pacote</span>
                <input
                  type="number"
                  min={0}
                  className="entrada num"
                  placeholder="Sem dividir"
                  value={porPacote}
                  onChange={(e) => setPorPacote(e.target.value)}
                />
                <small>Opcional</small>
              </label>
            </div>
          </div>
        )}

        {item && sequencia.length === 0 && (
          <Aviso tipo="alerta">
            Este item não tem operações na sequência para essa parte. Monte a sequência em <a href="/itens">Itens</a>.
          </Aviso>
        )}

        <div className="gerar-rodape">
          <button type="submit" className="botao botao-contorno" disabled={gerando || !podeGerar}>
            <Printer size={16} aria-hidden />
            {gerando ? "Gerando…" : "Gerar e imprimir"}
          </button>
          <button type="button" className="botao botao-contorno" disabled={gerando || !podeGerar} onClick={() => gerar(false)}>
            <FilePlus2 size={16} aria-hidden />
            Somente gerar
          </button>
          {item && (
            <span className="num fraco">
              {sequencia.length} operações · {min(tempoPeca)} min por peça ·{" "}
              {grupos.filter((g) => totalDo(g) > 0).length} {grupos.filter((g) => totalDo(g) > 0).length === 1 ? "cor" : "cores"} ·{" "}
              {totalPecas} peças em {qtdTickets}{" "}
              {qtdTickets === 1 ? "ticket" : "tickets"} · {Math.round(tempoPeca * totalPecas).toLocaleString("pt-BR")} min de costura
            </span>
          )}
        </div>
        {gerados !== null && (
          <div style={{ marginTop: 14 }}>
            <Aviso tipo="ok">
              {gerados} {gerados === 1 ? "ticket gerado e marcado" : "tickets gerados e marcados"} na lista abaixo. Gere
              outros se quiser e clique em <strong>Imprimir</strong> para imprimir todos juntos.
            </Aviso>
          </div>
        )}
      </form>

      {perguntaImpressao !== null && (
        <ModalPerguntaImpressao
          tickets={tickets.filter((t) => perguntaImpressao.includes(t.id))}
          onFechar={() => setPerguntaImpressao(null)}
          onPendentes={() => {
            imprimirPendentes(perguntaImpressao);
            setPerguntaImpressao(null);
          }}
          onTudo={() => {
            window.open(`/tickets/imprimir?ids=${perguntaImpressao.join(",")}`, "_blank");
            setPerguntaImpressao(null);
          }}
        />
      )}

      {ticketCupons !== null && (
        <ModalCupons
          ticketIds={ticketCupons}
          onFechar={() => setTicketCupons(null)}
          onMudou={() => carregarTickets(buscaOp, selecionados)}
        />
      )}

      <section className="bloco">
        <div className="bloco-cabecalho">
          <h2>
            Tickets gerados<span className="contagem">{tickets.length}</span>
          </h2>
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              carregarTickets(buscaOp);
            }}
          >
            {tickets.some((t) => t.impresso_em === null) && (
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => setSelecionados(new Set(tickets.filter((t) => t.impresso_em === null).map((t) => t.id)))}
              >
                Selecionar não impressos
              </button>
            )}
            {selecionados.size > 0 && (
              <button type="button" className="botao botao-contorno botao-excluir" onClick={excluirSelecionados}>
                <Trash2 size={16} aria-hidden />
                Excluir {selecionados.size}
              </button>
            )}
            {selecionados.size > 0 && (
              <button type="button" className="botao botao-primario" onClick={() => imprimir(Array.from(selecionados))}>
                <Printer size={16} aria-hidden />
                Imprimir {selecionados.size}
              </button>
            )}
            <input
              className="entrada"
              style={{ width: 170 }}
              placeholder="Buscar uma OP"
              aria-label="Buscar uma OP"
              value={buscaOp}
              onChange={(e) => setBuscaOp(e.target.value)}
            />
            <button type="submit" className="botao botao-secundario">
              <Search size={15} aria-hidden />
              Buscar
            </button>
          </form>
        </div>
        <p className="bloco-descricao" style={{ margin: "-6px 0 12px" }}>
          {buscaOp.trim() ? `Tickets da OP ${buscaOp.trim()}.` : "Os 200 tickets mais recentes."} Clique numa linha para ver quem fez cada operação.
        </p>
        {avisoLista && <Aviso tipo={avisoLista.tipo}>{avisoLista.texto}</Aviso>}
        {tickets.length === 0 ? (
          <div className="vazio">
            <strong>Nenhum ticket encontrado</strong>
            Gere os tickets de uma OP no formulário acima.
          </div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              {tabela.thead}
              <tbody>
                {tabela.visiveis.map((t) => {
                  const feitas = apontadas(t);
                  const total = t.operacoes.length;
                  const estaAberto = aberto === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setAberto(estaAberto ? null : t.id)}
                        data-selecionada={selecionados.has(t.id) || estaAberto}
                        aria-expanded={estaAberto}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ticket ${t.id}`}
                            checked={selecionados.has(t.id)}
                            onChange={(e) => {
                              const s = new Set(selecionados);
                              if (e.target.checked) s.add(t.id);
                              else s.delete(t.id);
                              setSelecionados(s);
                            }}
                          />
                        </td>
                        <td className="fraco num">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <ChevronRight
                              size={14}
                              aria-hidden
                              style={{ transform: estaAberto ? "rotate(90deg)" : "none", transition: "transform 160ms ease-out" }}
                            />
                            {t.id}
                          </span>
                        </td>
                        <td className="forte num">{t.op}</td>
                        <td className="num">{t.referencia}</td>
                        <td className="quebra">{t.cor ?? <span className="fraco">—</span>}</td>
                        <td>{t.tamanho ?? <span className="fraco">—</span>}</td>
                        <td title={(t.partes ?? []).map((p) => (p === "superior" ? "Parte superior" : "Parte inferior")).join(" e ")}>
                          {abreviarPartes(t.partes) || <span className="fraco">—</span>}
                        </td>
                        <td className="direita">{t.quantidade}</td>
                        <td>
                          <div className="progresso">
                            <div className="barra">
                              <div
                                className="barra-preenchida"
                                style={{
                                  width: `${total ? (feitas / total) * 100 : 0}%`,
                                  backgroundColor: feitas === total && total > 0 ? "var(--ok)" : "var(--rosa)",
                                }}
                              />
                            </div>
                            <span className="num">
                              {feitas}/{total}
                            </span>
                          </div>
                        </td>
                        <td className="num">
                          <span className="data-longa">{formatarData(t.created_at)}</span>
                          <span className="data-curta">{formatarData(t.created_at).slice(0, 5)}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="acoes">
                            {/* rosa: ainda não impresso */}
                            <button
                              type="button"
                              className={`botao botao-pequeno botao-fantasma ${t.impresso_em === null ? "imprimir-pendente" : ""}`}
                              onClick={() => imprimir([t.id])}
                              title={
                                t.impresso_em
                                  ? `Impresso em ${formatarData(t.impresso_em)}`
                                  : t.impresso_em === null
                                    ? "Ainda não impresso"
                                    : undefined
                              }
                            >
                              <Printer size={14} aria-hidden />
                              Imprimir
                            </button>
                            <button
                              type="button"
                              className="botao botao-pequeno botao-icone botao-fantasma"
                              onClick={() => setTicketCupons([t.id])}
                              aria-label={`Imprimir cupons avulsos do ticket ${t.id}`}
                              title="Imprimir cupons avulsos"
                            >
                              <TicketPlus size={15} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="botao botao-pequeno botao-icone botao-perigo"
                              onClick={() => excluir(t)}
                              aria-label={`Excluir ticket ${t.id}`}
                              title="Excluir"
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {estaAberto && (
                        <tr className="detalhe">
                          <td colSpan={10} style={{ padding: "8px 20px 16px" }}>
                            <OperacoesDoTicket operacoes={t.operacoes} nomeCostureira={nomeCostureira} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {tabela.rodape}
            {tabela.visiveis.length === 0 && <div className="vazio">Nenhum ticket encontrado.</div>}
          </div>
        )}
      </section>
    </ProducaoLayout>
  );
}

function MarcarTodos({
  ids,
  selecionados,
  onChange,
}: {
  ids: () => number[];
  selecionados: Set<number>;
  onChange: (s: Set<number>) => void;
}) {
  const lista = ids();
  const todos = lista.length > 0 && lista.every((id) => selecionados.has(id));
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todos os visíveis"
      title="Selecionar todos os visíveis"
      checked={todos}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(new Set(e.target.checked ? lista : []))}
    />
  );
}

// "Sup", "Inf" ou "Sup+Inf": curto para não alargar a tabela
function abreviarPartes(partes: Parte[] | null | undefined) {
  return (partes ?? [])
    .slice()
    .sort((x, y) => (x === y ? 0 : x === "superior" ? -1 : 1))
    .map((p) => (p === "superior" ? "Sup" : "Inf"))
    .join("+");
}

function OperacoesDoTicket({
  operacoes,
  nomeCostureira,
}: {
  operacoes: TicketOperacao[];
  nomeCostureira: (id: number | null) => string;
}) {
  const situacao = (o: TicketOperacao) =>
    o.costureira_id ? `${nomeCostureira(o.costureira_id)} · ${formatarData(o.data_producao ?? "")}` : "pendente";
  const tabela = useTabela<TicketOperacao>(operacoes, [
    { id: "parte", titulo: "Parte", valor: (o) => NOME_PARTE[o.parte] },
    { id: "ordem", titulo: "Ordem", valor: (o) => o.ordem, texto: (o) => `${o.ordem}ª` },
    { id: "nome", titulo: "Operação", valor: (o) => o.nome_operacao },
    { id: "maquina", titulo: "Máquina", valor: (o) => o.maquina },
    { id: "codigo", titulo: "Código", valor: (o) => codigoBarras(o.id) },
    { id: "situacao", titulo: "Feita por", valor: situacao },
  ]);
  return (
    <>
      <table className="tabela">
        {tabela.thead}
        <tbody>
          {tabela.visiveis.map((o) => (
            <tr key={o.id}>
              <td>
                <span className={`selo selo-${o.parte}`}>{NOME_PARTE[o.parte].replace("Parte ", "")}</span>
              </td>
              <td className="forte num">{o.ordem}ª</td>
              <td>{o.nome_operacao}</td>
              <td className="fraco">{o.maquina ?? "—"}</td>
              <td className="codigo fraco">{codigoBarras(o.id)}</td>
              <td className={o.costureira_id ? "forte" : "fraco"} style={o.costureira_id ? { color: "var(--ok)" } : undefined}>
                {situacao(o)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tabela.rodape}
    </>
  );
}

type OperacaoDoItem = {
  chave: string; // "operacao:vez": a mesma operação pode estar mais de uma vez no item
  vez: number;
  operacao_id: number;
  nome: string;
  maquina: string | null;
  parte: Parte;
  ordem: number;
  cupom_id: number | null;
  apontado: boolean;
};
type DadosCupons = {
  ticket: { id: number; op: string; referencia: string; cor: string | null; tamanho: string | null; quantidade: number };
  sequencia: OperacaoDoItem[];
};

// Janela de cupons de um ou vários tickets: lista as operações atuais dos itens. Com as marcadas dá para
// imprimir (o servidor cria o cupom que o ticket ainda não tiver) ou dar como concluídas (feitas fora do
// sistema: os cupons não apontados delas saem dos tickets e não contam na eficiência de ninguém).
function ModalCupons({ ticketIds, onFechar, onMudou }: { ticketIds: number[]; onFechar: () => void; onMudou: () => void }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [dados, setDados] = useState<DadosCupons[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const varios = ticketIds.length > 1;

  function carregar() {
    return Promise.all(ticketIds.map((id) => api<DadosCupons>(`/api/tickets/cupons?ticket=${id}`)))
      .then(setDados)
      .catch((e) => setErro(mensagemErro(e)));
  }
  useEffect(() => {
    janela.current?.showModal();
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // operações de todos os tickets, uma linha por operação (a mesma operação pode estar em vários)
  type Linha = OperacaoDoItem & { tickets: number; apontados: number; comCupom: number };
  const linhas: Linha[] = [];
  for (const d of dados ?? []) {
    for (const o of d.sequencia) {
      const atual = linhas.find((l) => l.chave === o.chave);
      if (atual) {
        atual.tickets += 1;
        if (o.apontado) atual.apontados += 1;
        if (o.cupom_id) atual.comCupom += 1;
      } else linhas.push({ ...o, tickets: 1, apontados: o.apontado ? 1 : 0, comCupom: o.cupom_id ? 1 : 0 });
    }
  }
  linhas.sort((a, b) => PARTES.indexOf(a.parte) - PARTES.indexOf(b.parte) || a.ordem - b.ordem);

  function alternar(id: string) {
    const n = new Set(marcadas);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setMarcadas(n);
  }

  // cupons marcados, por ticket
  const marcadosPorTicket = (dados ?? []).map((d) => ({ d, ops: d.sequencia.filter((o) => marcadas.has(o.chave)) }));
  const totalImprimir = marcadosPorTicket.reduce((s, x) => s + x.ops.length, 0);
  // os que podem ser dados como concluídos: têm cupom e ainda não foram apontados
  const concluiveis = marcadosPorTicket.flatMap((x) => x.ops.filter((o) => o.cupom_id && !o.apontado));

  async function imprimir() {
    if (!dados || !marcadas.size) return;
    setErro(null);
    setOcupado(true);
    const aba = window.open("", "_blank");
    try {
      const cupons: number[] = [];
      const impressos: number[] = [];
      for (const { d, ops } of marcadosPorTicket) {
        if (!ops.length) continue;
        const r = await api<{ cupons: number[] }>("/api/tickets/cupons", {
          method: "POST",
          body: JSON.stringify({ ticket_id: d.ticket.id, chaves: ops.map((o) => o.chave) }),
        });
        cupons.push(...r.cupons);
        impressos.push(d.ticket.id);
      }
      const url = `/tickets/imprimir?ids=${impressos.join(",")}&cupons=${cupons.join(",")}`;
      if (aba) aba.location.href = url;
      else window.open(url, "_blank");
      onMudou();
      onFechar();
    } catch (e) {
      aba?.close();
      setErro(mensagemErro(e));
      onMudou();
    } finally {
      setOcupado(false);
    }
  }

  async function concluir() {
    if (!dados || !concluiveis.length) return;
    const nomes = Array.from(new Set(concluiveis.map((o) => o.nome)));
    if (
      !confirm(
        `Dar como concluídas: ${nomes.join(", ")}.\n\n${concluiveis.length} ${concluiveis.length === 1 ? "cupom sai" : "cupons saem"} ` +
          `${varios ? "dos tickets" : "do ticket"} e não ${concluiveis.length === 1 ? "conta" : "contam"} na eficiência de ninguém. ` +
          "Use para operações feitas fora do sistema. Continuar?"
      )
    )
      return;
    setErro(null);
    setOcupado(true);
    try {
      let feitos = 0;
      for (const { d, ops } of marcadosPorTicket) {
        const ids = ops.filter((o) => o.cupom_id && !o.apontado).map((o) => o.cupom_id as number);
        if (!ids.length) continue;
        const r = await api<{ concluidas: number }>("/api/tickets/cupons", {
          method: "PATCH",
          body: JSON.stringify({ ticket_id: d.ticket.id, cupom_ids: ids }),
        });
        feitos += r.concluidas;
      }
      setMarcadas(new Set());
      setAviso(`${feitos} ${feitos === 1 ? "cupom dado como concluído" : "cupons dados como concluídos"}. Agora é só marcar o que falta e imprimir.`);
      await carregar();
      onMudou();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={janela}
      className="modal modal-cupons"
      onClose={onFechar}
      onClick={(e) => e.target === janela.current && janela.current?.close()}
    >
      <div className="modal-conteudo">
        <div className="modal-cabecalho">
          <div>
            <h2>{varios ? `Cupons de ${ticketIds.length} tickets` : `Cupons do ticket #${ticketIds[0]}`}</h2>
            {dados && !varios && (
              <p className="bloco-descricao num">
                OP {dados[0].ticket.op} · Ref {dados[0].ticket.referencia} · {dados[0].ticket.cor ?? "—"} · Tam{" "}
                {dados[0].ticket.tamanho ?? "—"} · {dados[0].ticket.quantidade} peças
              </p>
            )}
            {dados && varios && (
              <p className="bloco-descricao num">
                {Array.from(new Set(dados.map((d) => `OP ${d.ticket.op}`))).join(", ")} ·{" "}
                {dados.reduce((s, d) => s + d.ticket.quantidade, 0).toLocaleString("pt-BR")} peças
              </p>
            )}
          </div>
          <button
            type="button"
            className="botao botao-pequeno botao-icone botao-fantasma"
            onClick={() => janela.current?.close()}
            aria-label="Fechar"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
        {!dados && !erro && <div className="vazio">Carregando as operações…</div>}

        {dados && (
          <>
            <p className="bloco-descricao" style={{ margin: "0 0 8px" }}>
              Marque as operações e escolha: imprimir os cupons delas ou dar como concluídas
              {varios ? ". Vale para todos os tickets que tiverem cada uma" : ""}.
            </p>
            {linhas.length === 0 ? (
              <div className="vazio">O item {varios ? "desses tickets" : "deste ticket"} não tem operações cadastradas.</div>
            ) : (
              <ul className="modal-lista">
                {linhas.map((o) => {
                  const concluida = o.comCupom === 0 && o.apontados === 0;
                  return (
                    <li key={o.chave}>
                      <label data-marcada={marcadas.has(o.chave)}>
                        <input type="checkbox" checked={marcadas.has(o.chave)} onChange={() => alternar(o.chave)} />
                        <span className={`selo selo-${o.parte}`}>{NOME_PARTE[o.parte].replace("Parte ", "")}</span>
                        <span className="forte num">{o.ordem}ª</span>
                        <span className="modal-lista-nome">{o.nome}</span>
                        <span className="fraco">{o.maquina ?? "—"}</span>
                        <span className="num">
                          {varios && o.tickets < dados.length && (
                            <span className="fraco" style={{ marginRight: 6 }}>
                              {o.tickets} de {dados.length}
                            </span>
                          )}
                          {o.apontados > 0 ? (
                            <span className="selo selo-tipo-extra">
                              {o.apontados === o.tickets ? "apontada" : `apontada em ${o.apontados}`}
                            </span>
                          ) : concluida ? (
                            <span className="selo" title="Sem cupom no ticket: dada como concluída ou incluída no item depois">
                              sem cupom
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <div className="modal-rodape">
          <button type="button" className="botao botao-contorno" onClick={() => janela.current?.close()}>
            Fechar
          </button>
          <button
            type="button"
            className="botao botao-contorno"
            disabled={!concluiveis.length || ocupado}
            onClick={concluir}
            title="Para operações feitas fora do sistema: saem do ticket sem contar para ninguém"
          >
            <Check size={16} aria-hidden />
            Dar como concluídas
          </button>
          <button type="button" className="botao botao-primario" disabled={!marcadas.size || ocupado} onClick={imprimir}>
            <Printer size={16} aria-hidden />
            {ocupado ? "Aguarde…" : `Imprimir ${totalImprimir || ""} ${totalImprimir === 1 ? "cupom" : "cupons"}`.replace("  ", " ")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

// Pergunta, ao imprimir tickets que já têm cupons apontados, se sai só o que falta fazer ou tudo
function ModalPerguntaImpressao({
  tickets,
  onFechar,
  onPendentes,
  onTudo,
}: {
  tickets: Ticket[];
  onFechar: () => void;
  onPendentes: () => void;
  onTudo: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    janela.current?.showModal();
  }, []);
  const todos = tickets.reduce((s, t) => s + t.operacoes.length, 0);
  const pendentes = tickets.reduce((s, t) => s + t.operacoes.filter((o) => !o.costureira_id).length, 0);
  const varios = tickets.length > 1;
  return (
    <dialog
      ref={janela}
      className="modal"
      onClose={onFechar}
      onClick={(e) => e.target === janela.current && janela.current?.close()}
    >
      <div className="modal-conteudo">
        <div className="modal-cabecalho">
          <div>
            <h2>O que imprimir?</h2>
            <p className="bloco-descricao">
              {varios ? `Desses ${tickets.length} tickets, ` : "Deste ticket, "}
              {todos - pendentes} de {todos} cupons já foram apontados.
            </p>
          </div>
          <button type="button" className="botao botao-pequeno botao-icone botao-fantasma" onClick={() => janela.current?.close()} aria-label="Fechar">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="escolha-impressao">
          <button type="button" className="escolha-opcao" onClick={onPendentes} autoFocus>
            <strong>Só o que falta fazer</strong>
            <span className="fraco num">
              {pendentes} {pendentes === 1 ? "cupom" : "cupons"}: o ticket sai só com as operações pendentes
            </span>
          </button>
          <button type="button" className="escolha-opcao" onClick={onTudo}>
            <strong>Tudo</strong>
            <span className="fraco num">{todos} cupons: o ticket sai com todas as operações</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}

