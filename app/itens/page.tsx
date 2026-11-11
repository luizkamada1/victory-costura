"use client";

import { useEffect, useState } from "react";
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
  partes: Parte[];
  sequencia: Record<Parte, number[]>;
};

const VAZIO: Form = {
  referencia: "",
  nome: "",
  grades: [],
  tamanhos: "",
  cores: "",
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
  const opsDoItem = (item: Item) => item.operacoes.map((v) => porId.get(v.operacao_id)).filter(Boolean) as Operacao[];
  const tabela = useTabela<Item>(
    itens,
    [
      { id: "referencia", titulo: "Ref.", valor: (i) => i.referencia },
      { id: "nome", titulo: "Nome", valor: (i) => i.nome },
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
                  <select
                    className="entrada"
                    value=""
                    aria-label={`Adicionar operação à ${NOME_PARTE[parte]}`}
                    onChange={(e) => e.target.value && mudarSequencia(parte, [...seq, Number(e.target.value)])}
                  >
                    <option value="">Adicionar operação…</option>
                    {disponiveis.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome} ({o.maquina ?? "sem máquina"}, {min(o.tempo_minutos * fatorForm)} min)
                      </option>
                    ))}
                  </select>
                  {operacoes.filter((o) => o.parte === parte).length === 0 && (
                    <small className="fraco" style={{ display: "block", marginTop: 6 }}>
                      Cadastre operações dessa parte em <a href="/operacoes">Operações</a>.
                    </small>
                  )}
                </div>
              );
            })}
          </div>

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
