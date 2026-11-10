"use client";

import { useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import { GRADES, Item, NOME_PARTE, Operacao, PARTES, Parte } from "@/lib/producao";

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

export default function ItensPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const [i, o] = await Promise.all([
        api<{ itens: Item[] }>("/api/itens"),
        api<{ operacoes: Operacao[] }>("/api/operacoes"),
      ]);
      setItens(i.itens);
      setOperacoes(o.operacoes);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    carregar();
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

  function alternarGrade(grade: string) {
    if (!form) return;
    const marcada = form.grades.includes(grade);
    const grades = marcada ? form.grades.filter((g) => g !== grade) : [...form.grades, grade];
    let tamanhos = separar(form.tamanhos);
    if (marcada) tamanhos = tamanhos.filter((t) => !GRADES[grade].includes(t));
    else for (const t of GRADES[grade]) if (!tamanhos.includes(t)) tamanhos.push(t);
    setForm({ ...form, grades, tamanhos: tamanhos.join(", ") });
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

  async function salvar() {
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
    if (!confirm(`Excluir o item ${item.referencia} — ${item.nome}? Tickets já gerados não são afetados.`)) return;
    try {
      await api(`/api/itens?id=${item.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const tempoParte = (ids: number[]) => ids.reduce((s, id) => s + (porId.get(id)?.tempo_minutos ?? 0), 0);
  const termo = busca.trim().toLowerCase();
  const filtrados = itens.filter(
    (i) => !termo || i.referencia.toLowerCase().includes(termo) || i.nome.toLowerCase().includes(termo)
  );

  return (
    <ProducaoLayout titulo="Itens" subtitulo="Referências, grades, cores e sequência de operações">
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}

      {form && (
        <section style={ui.secao}>
          <h2 style={ui.secaoTitulo}>{form.id ? `Editar item ${form.referencia}` : "Novo item"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 12, marginTop: 12 }}>
            <label style={ui.campo}>
              <span style={ui.label}>Referência</span>
              <input
                autoFocus
                style={ui.input}
                placeholder="27100"
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              />
            </label>
            <label style={ui.campo}>
              <span style={ui.label}>Nome</span>
              <input
                style={ui.input}
                placeholder="Pijama canelado tradicional"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <span style={ui.label}>Grade</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {Object.keys(GRADES).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => alternarGrade(g)}
                  style={{ ...chip, ...(form.grades.includes(g) ? chipAtivo : {}) }}
                >
                  {form.grades.includes(g) ? "✓ " : ""}
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <label style={ui.campo}>
              <span style={ui.label}>Tamanhos (separados por vírgula)</span>
              <input
                style={ui.input}
                placeholder="P, M, G, GG"
                value={form.tamanhos}
                onChange={(e) => setForm({ ...form, tamanhos: e.target.value })}
              />
            </label>
            <label style={ui.campo}>
              <span style={ui.label}>Cores (separadas por vírgula)</span>
              <input
                style={ui.input}
                placeholder="Azul, Rosa, Cinza Mescla"
                value={form.cores}
                onChange={(e) => setForm({ ...form, cores: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <span style={ui.label}>Partes do item</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {PARTES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => alternarParte(p)}
                  style={{ ...chip, ...(form.partes.includes(p) ? chipAtivo : {}) }}
                >
                  {form.partes.includes(p) ? "✓ " : ""}
                  {NOME_PARTE[p]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 18 }}>
            {form.partes.map((parte) => {
              const seq = form.sequencia[parte];
              const disponiveis = operacoes.filter((o) => o.parte === parte && !seq.includes(o.id));
              return (
                <div key={parte} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Operações — {NOME_PARTE[parte]}</h3>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {tempoParte(seq).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} min/peça
                    </span>
                  </div>
                  <ol style={{ listStyle: "none", padding: 0, margin: "10px 0" }}>
                    {seq.map((id, i) => {
                      const op = porId.get(id);
                      return (
                        <li key={id} style={linhaSeq}>
                          <span style={{ fontWeight: 800, color: "#4338ca", width: 28 }}>{i + 1}º</span>
                          <span style={{ flex: 1 }}>
                            <b>{op?.nome}</b>
                            <span style={{ color: "#6b7280", fontSize: 12 }}>
                              {" "}
                              · {op?.maquina ?? "—"} · {op?.tempo_minutos.toLocaleString("pt-BR")} min
                            </span>
                          </span>
                          <button
                            type="button"
                            style={botaoMini}
                            disabled={i === 0}
                            onClick={() => {
                              const n = [...seq];
                              [n[i - 1], n[i]] = [n[i], n[i - 1]];
                              mudarSequencia(parte, n);
                            }}
                            title="Subir"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            style={botaoMini}
                            disabled={i === seq.length - 1}
                            onClick={() => {
                              const n = [...seq];
                              [n[i + 1], n[i]] = [n[i], n[i + 1]];
                              mudarSequencia(parte, n);
                            }}
                            title="Descer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            style={{ ...botaoMini, color: "#991b1b" }}
                            onClick={() => mudarSequencia(parte, seq.filter((x) => x !== id))}
                            title="Remover"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {seq.length === 0 && <p style={{ ...ui.vazio, paddingTop: 0 }}>Nenhuma operação vinculada.</p>}
                  <select
                    style={ui.input}
                    value=""
                    onChange={(e) => e.target.value && mudarSequencia(parte, [...seq, Number(e.target.value)])}
                  >
                    <option value="">+ Adicionar operação…</option>
                    {disponiveis.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome} ({o.maquina ?? "—"}, {o.tempo_minutos.toLocaleString("pt-BR")} min)
                      </option>
                    ))}
                  </select>
                  {operacoes.filter((o) => o.parte === parte).length === 0 && (
                    <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>
                      Cadastre operações dessa parte em <a href="/operacoes">Operações</a>.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={ui.botaoPrimario} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar item"}
            </button>
            <button style={ui.botaoSecundario} onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section style={ui.secao}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={ui.secaoTitulo}>
            Itens <span style={ui.badge}>{itens.length}</span>
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...ui.input, maxWidth: 240 }}
              placeholder="Buscar referência ou nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {!form && (
              <button style={ui.botaoPrimario} onClick={() => setForm({ ...VAZIO })}>
                + Novo item
              </button>
            )}
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={ui.tabela}>
            <thead>
              <tr>
                <th style={ui.th}>Ref.</th>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Grade / Tamanhos</th>
                <th style={ui.th}>Cores</th>
                <th style={ui.th}>Operações</th>
                <th style={ui.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => {
                const ops = item.operacoes.map((v) => porId.get(v.operacao_id)).filter(Boolean) as Operacao[];
                return (
                  <tr key={item.id}>
                    <td style={{ ...ui.td, fontWeight: 800 }}>{item.referencia}</td>
                    <td style={ui.td}>{item.nome}</td>
                    <td style={ui.td}>
                      <div>{item.grades.join(", ") || "—"}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{item.tamanhos.join(" · ")}</div>
                    </td>
                    <td style={{ ...ui.td, fontSize: 12.5 }}>{item.cores.join(", ") || "—"}</td>
                    <td style={{ ...ui.td, fontSize: 12.5 }}>
                      {item.partes.map((p) => {
                        const daParte = ops.filter((o) => o.parte === p);
                        return (
                          <div key={p}>
                            {NOME_PARTE[p]}: <b>{daParte.length}</b> op. ·{" "}
                            {daParte.reduce((s, o) => s + o.tempo_minutos, 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} min
                          </div>
                        );
                      })}
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button style={ui.botaoSecundario} onClick={() => editar(item)}>
                        Editar
                      </button>{" "}
                      <button style={ui.botaoSecundario} onClick={() => duplicar(item)} title="Criar novo item a partir deste">
                        Duplicar
                      </button>{" "}
                      <button style={ui.botaoPerigo} onClick={() => excluir(item)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrados.length === 0 && <p style={ui.vazio}>Nenhum item cadastrado.</p>}
        </div>
      </section>
    </ProducaoLayout>
  );
}

const chip: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#374151",
};
const chipAtivo: React.CSSProperties = { background: "#eef2ff", borderColor: "#818cf8", color: "#4338ca" };
const linhaSeq: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 8px",
  borderBottom: "1px solid #f1f2f4",
  fontSize: 13,
};
const botaoMini: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 5,
  width: 26,
  height: 26,
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};
