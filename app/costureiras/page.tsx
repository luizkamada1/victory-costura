"use client";

import { useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { Costureira, DIAS_SEMANA, Jornada, formatarMinutos } from "@/lib/producao";

type Form = { id?: number; nome: string; setor: string; jornadaPropria: boolean; jornada: Jornada; ativa: boolean };

export default function CostureirasPage() {
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [padrao, setPadrao] = useState<Jornada>({});
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  async function carregar() {
    try {
      const [c, j] = await Promise.all([
        api<{ costureiras: Costureira[] }>("/api/costureiras"),
        api<{ jornada: Jornada }>("/api/jornada"),
      ]);
      setCostureiras(c.costureiras);
      setPadrao(j.jornada);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  function novo() {
    setForm({ nome: "", setor: "", jornadaPropria: false, jornada: { ...padrao }, ativa: true });
  }

  function editar(c: Costureira) {
    setForm({
      id: c.id,
      nome: c.nome,
      setor: c.setor ?? "",
      jornadaPropria: !!c.jornada,
      jornada: { ...(c.jornada ?? padrao) },
      ativa: c.ativa,
    });
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    try {
      await api("/api/costureiras", {
        method: "POST",
        body: JSON.stringify({
          id: form.id,
          nome: form.nome,
          setor: form.setor,
          ativa: form.ativa,
          jornada: form.jornadaPropria ? form.jornada : null,
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

  async function excluir(c: Costureira) {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    try {
      await api(`/api/costureiras?id=${c.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const setores = Array.from(new Set(costureiras.map((c) => c.setor).filter(Boolean))) as string[];
  const totalSemana = (j: Jornada) => Object.values(j).reduce((s, v) => s + (Number(v) || 0), 0);
  const tabela = useTabela<Costureira>(
    costureiras.filter((c) => mostrarInativas || c.ativa),
    [
      { id: "nome", titulo: "Nome", valor: (c) => c.nome },
      { id: "setor", titulo: "Setor", valor: (c) => c.setor },
      {
        id: "jornada",
        titulo: "Jornada semanal",
        valor: (c) => totalSemana(c.jornada ?? padrao),
        texto: (c) => `${formatarMinutos(totalSemana(c.jornada ?? padrao))} ${c.jornada ? "própria" : "padrão"}`,
      },
      { id: "acoes", titulo: "", alinhar: "right" },
    ],
    { id: "nome", direcao: "asc" }
  );
  const visiveis = tabela.visiveis;

  return (
    <ProducaoLayout titulo="Costureiras" subtitulo="Cadastro de costureiras, setor e jornada">
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}

      {form && (
        <section style={ui.secao}>
          <h2 style={ui.secaoTitulo}>{form.id ? "Editar costureira" : "Nova costureira"}</h2>
          <div style={{ ...ui.grade, marginTop: 12 }}>
            <label style={ui.campo}>
              <span style={ui.label}>Nome</span>
              <input
                autoFocus
                style={ui.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </label>
            <label style={ui.campo}>
              <span style={ui.label}>Setor</span>
              <input
                style={ui.input}
                list="lista-setores"
                value={form.setor}
                onChange={(e) => setForm({ ...form, setor: e.target.value })}
              />
              <datalist id="lista-setores">
                {setores.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label style={{ ...ui.campo, justifyContent: "flex-end" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={form.ativa}
                  onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
                />
                Ativa
              </span>
            </label>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={form.jornadaPropria}
                onChange={(e) =>
                  setForm({ ...form, jornadaPropria: e.target.checked, jornada: { ...(form.jornada ?? padrao) } })
                }
              />
              Jornada diferente da padrão
            </label>
            <p style={{ ...ui.secaoDescricao, margin: "4px 0 10px" }}>
              {form.jornadaPropria
                ? "Minutos de trabalho dessa costureira em cada dia da semana."
                : `Usa a jornada padrão da empresa (${formatarMinutos(totalSemana(padrao))} por semana).`}
            </p>
            {form.jornadaPropria && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                {DIAS_SEMANA.map((nome, d) => (
                  <label key={d} style={ui.campo}>
                    <span style={ui.label}>{nome}</span>
                    <input
                      type="number"
                      min={0}
                      style={ui.input}
                      value={form.jornada[String(d)] ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, jornada: { ...form.jornada, [String(d)]: Number(e.target.value) } })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={ui.botaoPrimario} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button style={ui.botaoSecundario} onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section style={ui.secao}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={ui.secaoTitulo}>
            Costureiras <span style={ui.badge}>{costureiras.filter((c) => c.ativa).length} ativas</span>
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
              Mostrar inativas
            </label>
            {!form && (
              <button style={ui.botaoPrimario} onClick={novo}>
                + Nova costureira
              </button>
            )}
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={ui.tabela}>
            {tabela.thead}
            <tbody>
              {visiveis.map((c) => (
                <tr key={c.id} style={{ opacity: c.ativa ? 1 : 0.5 }}>
                  <td style={{ ...ui.td, fontWeight: 600 }}>
                    {c.nome} {!c.ativa && <span style={{ ...ui.badge, background: "#f3f4f6", color: "#6b7280" }}>inativa</span>}
                  </td>
                  <td style={ui.td}>{c.setor ?? "—"}</td>
                  <td style={ui.td}>
                    {formatarMinutos(totalSemana(c.jornada ?? padrao))}{" "}
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>{c.jornada ? "(própria)" : "(padrão)"}</span>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button style={ui.botaoSecundario} onClick={() => editar(c)}>
                      Editar
                    </button>{" "}
                    <button style={ui.botaoPerigo} onClick={() => excluir(c)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tabela.rodape}
          {visiveis.length === 0 && <p style={ui.vazio}>Nenhuma costureira encontrada.</p>}
        </div>
      </section>
    </ProducaoLayout>
  );
}
