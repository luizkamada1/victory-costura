"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { AJUSTES_PADRAO, AjustesGrade, GRADES, Item, NOME_PARTE, Operacao, PARTES, Parte, fatorGrade } from "@/lib/producao";

type Form = {
  id?: number;
  referencia: string;
  nome: string;
  grades: string[];
  tamanhos: string;
  cores: string;
  colecao: string;
  partes: Parte[];
  sequencia: Record<Parte, number[]>;
};

const VAZIO: Form = {
  referencia: "",
  nome: "",
  grades: [],
  tamanhos: "",
  cores: "",
  colecao: "",
  partes: ["superior", "inferior"],
  sequencia: { superior: [], inferior: [] },
};

const separar = (texto: string) =>
  texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const min = (m: number) => m.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ItensPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criandoOperacao, setCriandoOperacao] = useState(false);
  const [ajustes, setAjustes] = useState<AjustesGrade>({ ...AJUSTES_PADRAO });

  async function carregar() {
    try {
      const [i, o] = await Promise.all([api<{ itens: Item[] }>("/api/itens"), api<{ operacoes: Operacao[] }>("/api/operacoes")]);
      setItens(i.itens);
      setOperacoes(o.operacoes);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    carregar();
    api<{ ajustes: AjustesGrade }>("/api/ajustes-grade")
      .then((r) => setAjustes(r.ajustes))
      .catch(() => {
        // sem os ajustes, mostra os tempos com os valores iniciais
      });
  }, []);

  const porId = new Map(operacoes.map((o) => [o.id, o]));

  function editar(item: Item) {
    const sequencia: Record<Parte, number[]> = { superior: [], inferior: [] };
    for (const v of item.operacoes) {
      const op = porId.get(v.operacao_id);
      if (op) sequencia[op.parte].push(op.id);
    }
    setForm({
      id: item.id,
      referencia: item.referencia,
      nome: item.nome,
      grades: item.grades,
      tamanhos: item.tamanhos.join(", "),
      cores: item.cores.join(", "),
      colecao: item.colecao ?? "",
      partes: item.partes,
      sequencia,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicar(item: Item) {
    editar(item);
    setForm((f) => f && { ...f, id: undefined, referencia: "" });
  }

  // Um item tem uma grade só: escolher outra troca a grade e os tamanhos sugeridos
  function escolherGrade(grade: string) {
    if (!form || form.grades.length === 1 && form.grades[0] === grade) return;
    setForm({ ...form, grades: [grade], tamanhos: GRADES[grade].join(", ") });
  }

  function alternarParte(parte: Parte) {
    if (!form) return;
    const partes = form.partes.includes(parte) ? form.partes.filter((p) => p !== parte) : [...form.partes, parte];
    setForm({ ...form, partes: PARTES.filter((p) => partes.includes(p)) });
  }

  function mudarSequencia(parte: Parte, nova: number[]) {
    if (!form) return;
    setForm({ ...form, sequencia: { ...form.sequencia, [parte]: nova } });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro(null);
    try {
      await api("/api/itens", {
        method: "POST",
        body: JSON.stringify({
          id: form.id,
          referencia: form.referencia,
          nome: form.nome,
          grades: form.grades,
          tamanhos: separar(form.tamanhos),
          cores: separar(form.cores),
          colecao: form.colecao,
          partes: form.partes,
          operacoes: form.partes.flatMap((p) => form.sequencia[p]),
        }),
      });
      setForm(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(item: Item) {
    if (!confirm(`Excluir o item ${item.referencia} — ${item.nome}? Tickets já gerados não mudam.`)) return;
    try {
      await api(`/api/itens?id=${item.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // tempos mostrados já com o ajuste da grade do item (o cadastrado é o da grade Adulto)
  const fatorForm = form ? fatorGrade(form.grades, ajustes) : 1;
  const tempoParte = (ids: number[]) => ids.reduce((s, id) => s + (porId.get(id)?.tempo_minutos ?? 0), 0) * fatorForm;
  const colecoes = Array.from(new Set(itens.map((i) => i.colecao).filter(Boolean))).sort() as string[];
  const opsDoItem = (item: Item) => item.operacoes.map((v) => porId.get(v.operacao_id)).filter(Boolean) as Operacao[];
  const tabela = useTabela<Item>(
    itens,
    [
      { id: "referencia", titulo: "Ref.", valor: (i) => i.referencia },
      { id: "nome", titulo: "Nome", valor: (i) => i.nome },
      { id: "colecao", titulo: "Coleção", valor: (i) => i.colecao ?? "" },
      { id: "grade", titulo: "Grade e tamanhos", valor: (i) => i.grades.join(", "), texto: (i) => `${i.grades.join(", ")} ${i.tamanhos.join(" ")}` },
      { id: "cores", titulo: "Cores", valor: (i) => i.cores.join(", ") },
      {
        id: "operacoes",
        titulo: "Operações",
        valor: (i) => opsDoItem(i).reduce((s, o) => s + o.tempo_minutos, 0) * fatorGrade(i.grades, ajustes),
        texto: (i) => i.partes.map((p) => NOME_PARTE[p]).join(" "),
      },
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "referencia", direcao: "asc" }
  );

  return (
    <ProducaoLayout
      titulo="Itens"
      subtitulo="Cada referência com sua grade, cores e a sequência de operações de cada parte."
      acoes={
        !form && (
          <button type="button" className="botao botao-primario" onClick={() => setForm({ ...VAZIO })}>
            <Plus size={16} aria-hidden />
            Novo item
          </button>
        )
      }
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {form && (
        <form className="bloco" onSubmit={salvar}>
          <div className="bloco-cabecalho">
            <h2>{form.id ? `Editar item ${form.referencia}` : "Novo item"}</h2>
          </div>
          <div className="campos grade-item">
            <label className="campo">
              <span>Referência</span>
              <input
                autoFocus
                className="entrada num"
                placeholder="27100"
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Nome</span>
              <input
                className="entrada"
                placeholder="Pijama canelado tradicional"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Coleção</span>
              <input
                className="entrada"
                list="lista-colecoes"
                placeholder="Inverno 2027"
                value={form.colecao}
                onChange={(e) => setForm({ ...form, colecao: e.target.value })}
              />
              <datalist id="lista-colecoes">
                {colecoes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="campos grade-2" style={{ marginTop: 14 }}>
            <div className="campo">
              <span>Grade</span>
              <div className="fichas" role="radiogroup" aria-label="Grade">
                {Object.keys(GRADES).map((g) => {
                  const escolhida = form.grades.length === 1 && form.grades[0] === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      className="ficha"
                      aria-checked={escolhida}
                      aria-pressed={escolhida}
                      onClick={() => escolherGrade(g)}
                    >
                      {escolhida && <Check size={14} aria-hidden />}
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="campo">
              <span>Partes do item</span>
              <div className="fichas" role="group" aria-label="Partes do item">
                {PARTES.map((p) => (
                  <button key={p} type="button" className="ficha" aria-pressed={form.partes.includes(p)} onClick={() => alternarParte(p)}>
                    {form.partes.includes(p) && <Check size={14} aria-hidden />}
                    {NOME_PARTE[p]}
                  </button>
                ))}
              </div>
            </div>
            <label className="campo">
              <span>Tamanhos</span>
              <input className="entrada" placeholder="P, M, G, GG" value={form.tamanhos} onChange={(e) => setForm({ ...form, tamanhos: e.target.value })} />
              <small>Separados por vírgula. Escolher a grade preenche os tamanhos dela.</small>
            </label>
            <label className="campo">
              <span>Cores</span>
              <input
                className="entrada"
                placeholder="Azul, Rosa, Cinza Mescla"
                value={form.cores}
                onChange={(e) => setForm({ ...form, cores: e.target.value })}
              />
              <small>Separadas por vírgula.</small>
            </label>
          </div>

          <div className="sequencias-topo">
            <span className="campo">
              <span>Sequência de operações</span>
            </span>
            <button type="button" className="botao botao-pequeno botao-contorno" onClick={() => setCriandoOperacao(true)}>
              <Plus size={14} aria-hidden />
              Criar operação
            </button>
          </div>
          <div className="sequencias">
            {form.partes.map((parte) => {
              const seq = form.sequencia[parte];
              const disponiveis = operacoes.filter((o) => o.parte === parte && !seq.includes(o.id));
              return (
                <div key={parte} className="sequencia">
                  <div className="sequencia-cabecalho">
                    <h3>{NOME_PARTE[parte]}</h3>
                    <span className="num fraco">
                      {min(tempoParte(seq))} min por peça
                      {fatorForm !== 1 && ` (${form.grades[0]} ${fatorForm > 1 ? "+" : ""}${Math.round((fatorForm - 1) * 1000) / 10}%)`}
                    </span>
                  </div>
                  {seq.length === 0 ? (
                    <p className="fraco" style={{ fontSize: 13, margin: "10px 0" }}>
                      Nenhuma operação na sequência ainda.
                    </p>
                  ) : (
                    <ol className="sequencia-lista">
                      {seq.map((id, i) => {
                        const op = porId.get(id);
                        return (
                          <li key={id}>
                            <span className="sequencia-ordem num">{i + 1}ª</span>
                            <span className="sequencia-nome">
                              <strong>{op?.nome}</strong>
                              <span className="fraco">{op?.maquina ?? "sem máquina"}</span>
                            </span>
                            <span className="num direita">{op ? min(op.tempo_minutos * fatorForm) : "—"}</span>
                            <span className="acoes">
                              <button
                                type="button"
                                className="botao botao-pequeno botao-icone botao-fantasma"
                                disabled={i === 0}
                                aria-label="Subir"
                                title="Subir"
                                onClick={() => {
                                  const n = [...seq];
                                  [n[i - 1], n[i]] = [n[i], n[i - 1]];
                                  mudarSequencia(parte, n);
                                }}
                              >
                                <ArrowUp size={14} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="botao botao-pequeno botao-icone botao-fantasma"
                                disabled={i === seq.length - 1}
                                aria-label="Descer"
                                title="Descer"
                                onClick={() => {
                                  const n = [...seq];
                                  [n[i + 1], n[i]] = [n[i], n[i + 1]];
                                  mudarSequencia(parte, n);
                                }}
                              >
                                <ArrowDown size={14} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="botao botao-pequeno botao-icone botao-perigo"
                                aria-label="Tirar da sequência"
                                title="Tirar da sequência"
                                onClick={() => mudarSequencia(parte, seq.filter((x) => x !== id))}
                              >
                                <X size={14} aria-hidden />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  <BuscaOperacao
                    parte={parte}
                    disponiveis={disponiveis}
                    rotulo={(o) => `${o.nome} · ${o.maquina ?? "sem máquina"} · ${min(o.tempo_minutos * fatorForm)} min`}
                    onAdicionar={(id) => mudarSequencia(parte, [...seq, id])}
                  />
                </div>
              );
            })}
          </div>

          {criandoOperacao && (
            <ModalCriarOperacoes
              partesDoItem={form.partes}
              operacoes={operacoes}
              onFechar={() => setCriandoOperacao(false)}
              onCriadas={(novas) => {
                setOperacoes((atual) => [...atual, ...novas]);
                // cada uma entra no fim da sequência da sua parte (o item ainda precisa ser salvo)
                setForm((f) => {
                  if (!f) return f;
                  const sequencia = { ...f.sequencia };
                  for (const o of novas) if (f.partes.includes(o.parte)) sequencia[o.parte] = [...sequencia[o.parte], o.id];
                  return { ...f, sequencia };
                });
              }}
            />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar item"}
            </button>
            <button type="button" className="botao botao-secundario" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <section className="bloco">
        <div className="bloco-cabecalho">
          <h2>
            Referências<span className="contagem">{itens.length}</span>
          </h2>
        </div>
        {itens.length === 0 ? (
          <div className="vazio">
            <strong>Nenhum item cadastrado</strong>
            Cadastre as operações primeiro; depois monte aqui a sequência de cada referência.
          </div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              {tabela.thead}
              <tbody>
                {tabela.visiveis.map((item) => {
                  const ops = opsDoItem(item);
                  return (
                    <tr key={item.id} data-selecionada={form?.id === item.id}>
                      <td className="forte num">{item.referencia}</td>
                      <td className="quebra">{item.nome}</td>
                      <td className="quebra" style={{ fontSize: 13 }}>{item.colecao || <span className="fraco">—</span>}</td>
                      <td>
                        <div>{item.grades.join(", ") || <span className="fraco">—</span>}</div>
                        <div className="fraco" style={{ fontSize: 12 }}>
                          {item.tamanhos.join(" · ")}
                        </div>
                      </td>
                      <td className="quebra" style={{ fontSize: 13 }}>{item.cores.join(", ") || <span className="fraco">—</span>}</td>
                      <td>
                        <div className="ops-resumo">
                          {[...PARTES.map((p) => ({ rotulo: NOME_PARTE[p].replace("Parte ", ""), lista: ops.filter((o) => o.parte === p), tem: item.partes.includes(p) })),
                            { rotulo: "Total", lista: ops, tem: true }].map((linha) => (
                            <div key={linha.rotulo} className={linha.rotulo === "Total" ? "ops-total" : undefined}>
                              <span className="fraco">{linha.rotulo}</span>
                              {linha.tem ? (
                                <>
                                  <span>{linha.lista.length} op.</span>
                                  <span>{min(linha.lista.reduce((s, o) => s + o.tempo_minutos, 0) * fatorGrade(item.grades, ajustes))} min</span>
                                </>
                              ) : (
                                <>
                                  <span className="fraco">—</span>
                                  <span className="fraco">—</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="acoes">
                          <button
                            type="button"
                            className="botao botao-pequeno botao-icone botao-fantasma"
                            onClick={() => editar(item)}
                            aria-label={`Editar ${item.referencia}`}
                            title="Editar"
                          >
                            <Pencil size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="botao botao-pequeno botao-icone botao-fantasma"
                            onClick={() => duplicar(item)}
                            aria-label="Duplicar"
                            title="Criar um item novo a partir deste"
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="botao botao-pequeno botao-icone botao-perigo"
                            onClick={() => excluir(item)}
                            aria-label={`Excluir ${item.referencia}`}
                            title="Excluir"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tabela.rodape}
            {tabela.visiveis.length === 0 && <div className="vazio">Nenhum item encontrado.</div>}
          </div>
        )}
      </section>
    </ProducaoLayout>
  );
}

// Campo de busca para incluir uma operação na sequência: digitar parte do nome ou da máquina
// filtra as sugestões; ao escolher uma (ou digitar o nome exato), ela entra na lista e o campo limpa.
function BuscaOperacao({
  parte,
  disponiveis,
  rotulo,
  onAdicionar,
}: {
  parte: Parte;
  disponiveis: Operacao[];
  rotulo: (o: Operacao) => string;
  onAdicionar: (id: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const termo = texto.trim().toLowerCase();

  function digitar(valor: string) {
    setTexto(valor);
    const limpo = valor.trim().toLowerCase();
    if (!limpo) return;
    const porRotulo = disponiveis.find((o) => rotulo(o).toLowerCase() === limpo);
    const porNome = disponiveis.filter((o) => o.nome.toLowerCase() === limpo);
    const achada = porRotulo ?? (porNome.length === 1 ? porNome[0] : undefined);
    if (achada) {
      onAdicionar(achada.id);
      setTexto("");
    }
  }

  return (
    <div className="campo">
      <input
        className="entrada"
        list={`operacoes-${parte}`}
        placeholder="Adicionar operação: digite o nome ou a máquina"
        aria-label={`Adicionar operação à ${NOME_PARTE[parte]}`}
        value={texto}
        onChange={(e) => digitar(e.target.value)}
      />
      <datalist id={`operacoes-${parte}`}>
        {disponiveis.map((o) => (
          <option key={o.id} value={rotulo(o)} />
        ))}
      </datalist>
      {termo && !disponiveis.some((o) => rotulo(o).toLowerCase().includes(termo)) && (
        <small style={{ color: "var(--alerta)" }}>Nenhuma operação encontrada</small>
      )}
    </div>
  );
}

type Rascunho = { chave: number; nome: string; tempo: string; maquina: string; parte: Parte };
let proximoRascunho = 0;

// Janela para criar operações novas sem sair do cadastro do item. Monta uma lista que pode ser
// editada ou ter linhas excluídas; ao confirmar, cadastra todas em Operações e devolve as criadas.
function ModalCriarOperacoes({
  partesDoItem,
  operacoes,
  onFechar,
  onCriadas,
}: {
  partesDoItem: Parte[];
  operacoes: Operacao[];
  onFechar: () => void;
  onCriadas: (novas: Operacao[]) => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const campoNome = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState<Rascunho[]>([]);
  const partePadrao: Parte = partesDoItem[0] ?? "superior";
  const [rascunho, setRascunho] = useState<Rascunho>({ chave: 0, nome: "", tempo: "", maquina: "", parte: partePadrao });
  const [editando, setEditando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  const maquinas = Array.from(new Set(operacoes.map((o) => o.maquina).filter(Boolean))).sort() as string[];
  const tempoNumero = (t: string) => Number(t.replace(",", "."));
  const normal = (t: string) => t.trim().toLowerCase();

  // confere o rascunho antes de pôr na lista
  function validar(r: Rascunho) {
    if (!r.nome.trim()) return "Informe o nome da operação.";
    if (!(tempoNumero(r.tempo) > 0)) return "Informe o tempo Adulto, maior que zero (ex: 0,45).";
    if (operacoes.some((o) => o.parte === r.parte && normal(o.nome) === normal(r.nome)))
      return `Já existe a operação "${r.nome.trim()}" na ${NOME_PARTE[r.parte]}. Use a busca para adicioná-la.`;
    if (lista.some((l) => l.chave !== r.chave && l.parte === r.parte && normal(l.nome) === normal(r.nome)))
      return `"${r.nome.trim()}" já está na lista para a ${NOME_PARTE[r.parte]}.`;
    return null;
  }

  function adicionarNaLista(e: React.FormEvent) {
    e.preventDefault();
    // não deixa o envio desta janela chegar ao formulário do item (que salvaria o item)
    e.stopPropagation();
    const problema = validar(rascunho);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    if (editando !== null) setLista((l) => l.map((x) => (x.chave === editando ? { ...rascunho, chave: editando } : x)));
    else setLista((l) => [...l, { ...rascunho, chave: ++proximoRascunho }]);
    setEditando(null);
    // mantém parte e máquina para agilizar operações em sequência
    setRascunho({ chave: 0, nome: "", tempo: "", maquina: rascunho.maquina, parte: rascunho.parte });
    campoNome.current?.focus();
  }

  function editar(r: Rascunho) {
    setEditando(r.chave);
    setRascunho(r);
    setErro(null);
    campoNome.current?.focus();
  }

  function excluir(chave: number) {
    setLista((l) => l.filter((x) => x.chave !== chave));
    if (editando === chave) {
      setEditando(null);
      setRascunho({ chave: 0, nome: "", tempo: "", maquina: "", parte: partePadrao });
    }
  }

  async function confirmar() {
    if (!lista.length) return;
    setErro(null);
    setSalvando(true);
    const criadas: Operacao[] = [];
    try {
      for (const r of lista) {
        const resposta = await api<{ id: number }>("/api/operacoes", {
          method: "POST",
          body: JSON.stringify({ nome: r.nome.trim(), tempo_minutos: tempoNumero(r.tempo), maquina: r.maquina.trim(), parte: r.parte }),
        });
        criadas.push({
          id: resposta.id,
          nome: r.nome.trim(),
          tempo_minutos: tempoNumero(r.tempo),
          maquina: r.maquina.trim() || null,
          parte: r.parte,
        });
      }
      onCriadas(criadas);
      janela.current?.close();
    } catch (e) {
      // as que já foram criadas entram no item; as que faltaram continuam na lista
      if (criadas.length) {
        onCriadas(criadas);
        setLista((l) => l.slice(criadas.length));
      }
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  // fica fora do formulário do item na página (um formulário não pode ficar dentro de outro)
  return createPortal(
    <dialog ref={janela} className="modal modal-largo" onClose={onFechar}>
      <div className="modal-conteudo">
        <div className="modal-cabecalho">
          <div>
            <h2>Criar operações</h2>
            <p className="bloco-descricao">
              Monte a lista e confirme. As operações entram no cadastro e na sequência da parte escolhida no item.
            </p>
          </div>
          <button type="button" className="botao botao-pequeno botao-icone botao-fantasma" onClick={() => janela.current?.close()} aria-label="Fechar">
            <X size={16} aria-hidden />
          </button>
        </div>

        <form className="campos grade-criar-op" onSubmit={adicionarNaLista}>
          <label className="campo">
            <span>Nome da operação</span>
            <input ref={campoNome} autoFocus className="entrada" value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
          </label>
          <label className="campo">
            <span>Tempo Adulto</span>
            <div className="entrada-sufixo">
              <input
                className="entrada num"
                inputMode="decimal"
                placeholder="0,45"
                value={rascunho.tempo}
                onChange={(e) => setRascunho({ ...rascunho, tempo: e.target.value.replace(/[^\d.,]/g, "") })}
              />
              <span>min</span>
            </div>
          </label>
          <label className="campo">
            <span>Máquina</span>
            <input className="entrada" list="maquinas-modal" value={rascunho.maquina} onChange={(e) => setRascunho({ ...rascunho, maquina: e.target.value })} />
            <datalist id="maquinas-modal">
              {maquinas.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="campo">
            <span>Parte</span>
            <select className="entrada" value={rascunho.parte} onChange={(e) => setRascunho({ ...rascunho, parte: e.target.value as Parte })}>
              {(partesDoItem.length ? partesDoItem : PARTES).map((p) => (
                <option key={p} value={p}>
                  {NOME_PARTE[p].replace("Parte ", "")}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="botao botao-contorno">
            {editando !== null ? (
              <>
                <Check size={15} aria-hidden />
                Salvar alteração
              </>
            ) : (
              <>
                <Plus size={15} aria-hidden />
                Adicionar à lista
              </>
            )}
          </button>
        </form>

        {erro && (
          <div style={{ marginTop: 12 }}>
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}

        {lista.length === 0 ? (
          <div className="vazio" style={{ marginTop: 8 }}>
            Nenhuma operação na lista ainda.
          </div>
        ) : (
          <ul className="modal-lista" style={{ marginTop: 14 }}>
            {lista.map((r) => (
              <li key={r.chave}>
                <div className="linha-rascunho" data-marcada={editando === r.chave}>
                  <span className={`selo selo-${r.parte}`}>{NOME_PARTE[r.parte].replace("Parte ", "")}</span>
                  <span className="forte">{r.nome}</span>
                  <span className="fraco">{r.maquina || "sem máquina"}</span>
                  <span className="num">{tempoNumero(r.tempo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} min</span>
                  <span className="acoes">
                    <button type="button" className="botao botao-pequeno botao-icone botao-fantasma" onClick={() => editar(r)} aria-label={`Editar ${r.nome}`} title="Editar">
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button type="button" className="botao botao-pequeno botao-icone botao-perigo" onClick={() => excluir(r.chave)} aria-label={`Excluir ${r.nome}`} title="Excluir">
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-rodape">
          <button type="button" className="botao botao-contorno" onClick={() => janela.current?.close()}>
            Cancelar
          </button>
          <button type="button" className="botao botao-primario" disabled={!lista.length || salvando} onClick={confirmar}>
            <Check size={16} aria-hidden />
            {salvando ? "Criando…" : lista.length ? `Confirmar ${lista.length} ${lista.length === 1 ? "operação" : "operações"}` : "Confirmar"}
          </button>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
