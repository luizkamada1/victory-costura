"use client";

import { useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import { NOME_PARTE, Operacao, PARTES, Parte } from "@/lib/producao";

type Form = { id?: number; nome: string; tempo_minutos: string; maquina: string; parte: Parte };
const VAZIO: Form = { nome: "", tempo_minutos: "", maquina: "", parte: "superior" };

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [form, setForm] = useState<Form>(VAZIO);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const r = await api<{ operacoes: Operacao[] }>("/api/operacoes");
      setOperacoes(r.operacoes);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api("/api/operacoes", {
        method: "POST",
        body: JSON.stringify({ ...form, tempo_minutos: Number(form.tempo_minutos.replace(",", ".")) }),
      });
      // mantém parte e máquina para agilizar o cadastro em sequência
      setForm({ ...VAZIO, parte: form.parte, maquina: form.id ? "" : form.maquina });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(o: Operacao) {
    if (!confirm(`Excluir a operação "${o.nome}"? Ela também sai da sequência dos itens.`)) return;
    try {
      await api(`/api/operacoes?id=${o.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const maquinas = Array.from(new Set(operacoes.map((o) => o.maquina).filter(Boolean))) as string[];
  const termo = busca.trim().toLowerCase();
  const filtradas = operacoes.filter(
    (o) => !termo || o.nome.toLowerCase().includes(termo) || (o.maquina ?? "").toLowerCase().includes(termo)
  );
  const tempo = Number(form.tempo_minutos.replace(",", "."));

  return (
    <ProducaoLayout titulo="Operações" subtitulo="Cadastro das operações de costura e seus tempos">
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}

      <form style={ui.secao} onSubmit={salvar}>
        <h2 style={ui.secaoTitulo}>{form.id ? "Editar operação" : "Nova operação"}</h2>
        <p style={ui.secaoDescricao}>
          O tempo é o tempo padrão para fazer a operação em <b>uma peça</b>, em minutos (ex: 0,45).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr 1fr", gap: 12 }} className="grade-responsiva">
          <label style={ui.campo}>
            <span style={ui.label}>Nome da operação</span>
            <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Tempo por peça (min)</span>
            <input
              style={ui.input}
              inputMode="decimal"
              value={form.tempo_minutos}
              onChange={(e) => setForm({ ...form, tempo_minutos: e.target.value })}
            />
            {tempo > 0 && (
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>≈ {Math.floor(60 / tempo)} peças/hora</span>
            )}
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Máquina</span>
            <input
              style={ui.input}
              list="lista-maquinas"
              value={form.maquina}
              onChange={(e) => setForm({ ...form, maquina: e.target.value })}
            />
            <datalist id="lista-maquinas">
              {maquinas.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Parte</span>
            <select
              style={ui.input}
              value={form.parte}
              onChange={(e) => setForm({ ...form, parte: e.target.value as Parte })}
            >
              {PARTES.map((p) => (
                <option key={p} value={p}>
                  {NOME_PARTE[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="submit" style={ui.botaoPrimario} disabled={salvando}>
            {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "+ Adicionar operação"}
          </button>
          {form.id && (
            <button type="button" style={ui.botaoSecundario} onClick={() => setForm(VAZIO)}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <section style={ui.secao}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={ui.secaoTitulo}>
            Operações cadastradas <span style={ui.badge}>{operacoes.length}</span>
          </h2>
          <input
            style={{ ...ui.input, maxWidth: 260 }}
            placeholder="Buscar operação ou máquina"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {PARTES.map((parte) => {
          const lista = filtradas.filter((o) => o.parte === parte);
          return (
            <div key={parte} style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#4338ca", margin: "0 0 6px", textTransform: "uppercase" }}>
                {NOME_PARTE[parte]}
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={ui.tabela}>
                  <thead>
                    <tr>
                      <th style={ui.th}>Operação</th>
                      <th style={ui.th}>Máquina</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Tempo (min)</th>
                      <th style={ui.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((o) => (
                      <tr key={o.id} style={form.id === o.id ? { background: "#eef2ff" } : undefined}>
                        <td style={{ ...ui.td, fontWeight: 600 }}>{o.nome}</td>
                        <td style={ui.td}>{o.maquina ?? "—"}</td>
                        <td style={{ ...ui.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {o.tempo_minutos.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                        </td>
                        <td style={{ ...ui.td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            style={ui.botaoSecundario}
                            onClick={() =>
                              setForm({
                                id: o.id,
                                nome: o.nome,
                                tempo_minutos: String(o.tempo_minutos).replace(".", ","),
                                maquina: o.maquina ?? "",
                                parte: o.parte,
                              })
                            }
                          >
                            Editar
                          </button>{" "}
                          <button style={ui.botaoPerigo} onClick={() => excluir(o)}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lista.length === 0 && <p style={ui.vazio}>Nenhuma operação.</p>}
              </div>
            </div>
          );
        })}
      </section>
      <style>{`@media (max-width: 700px) { .grade-responsiva { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </ProducaoLayout>
  );
}
