"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { Costureira, DIAS_SEMANA, Jornada, Operacao, formatarMinutos } from "@/lib/producao";

type Form = {
  id?: number;
  nome: string;
  setor: string;
  jornadaPropria: boolean;
  jornada: Jornada;
  ativa: boolean;
  maquinas: string[];
};

const totalSemana = (j: Jornada) => Object.values(j).reduce((s, v) => s + (Number(v) || 0), 0);

export default function CostureirasPage() {
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [padrao, setPadrao] = useState<Jornada>({});
  const [maquinasCadastradas, setMaquinasCadastradas] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  async function carregar() {
    try {
      const [c, j, o] = await Promise.all([
        api<{ costureiras: Costureira[] }>("/api/costureiras"),
        api<{ jornada: Jornada }>("/api/jornada"),
        api<{ operacoes: Operacao[] }>("/api/operacoes"),
      ]);
      setCostureiras(c.costureiras);
      setPadrao(j.jornada);
      // as máquinas vêm do cadastro de operações
      setMaquinasCadastradas(
        Array.from(new Set(o.operacoes.map((op) => (op.maquina ?? "").trim()).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b, "pt-BR")
        )
      );
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  function novo() {
    setForm({ nome: "", setor: "", jornadaPropria: false, jornada: { ...padrao }, ativa: true, maquinas: [] });
  }

  function editar(c: Costureira) {
    setForm({
      id: c.id,
      nome: c.nome,
      setor: c.setor ?? "",
      jornadaPropria: !!c.jornada,
      jornada: { ...(c.jornada ?? padrao) },
      ativa: c.ativa,
      maquinas: [...(c.maquinas ?? [])],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
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
          maquinas: form.maquinas,
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
    if (!confirm(`Excluir ${c.nome}? Quem já tem produção apontada não pode ser excluída, só desativada.`)) return;
    try {
      await api(`/api/costureiras?id=${c.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const setores = Array.from(new Set(costureiras.map((c) => c.setor).filter(Boolean))) as string[];
  const tabela = useTabela<Costureira>(
    costureiras.filter((c) => mostrarInativas || c.ativa),
    [
      { id: "nome", titulo: "Nome", valor: (c) => c.nome },
      { id: "setor", titulo: "Setor", valor: (c) => c.setor },
      { id: "maquinas", titulo: "Máquinas", valor: (c) => (c.maquinas ?? []).join(", ") },
      {
        id: "jornada",
        titulo: "Jornada semanal",
        valor: (c) => totalSemana(c.jornada ?? padrao),
        texto: (c) => `${formatarMinutos(totalSemana(c.jornada ?? padrao))} ${c.jornada ? "própria" : "padrão"}`,
      },
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "nome", direcao: "asc" }
  );
  const ativas = costureiras.filter((c) => c.ativa).length;
  // máquinas do cadastro de operações e as que ela já tinha (mesmo que a operação tenha mudado)
  const maquinasDoForm = form
    ? Array.from(new Set([...maquinasCadastradas, ...form.maquinas])).sort((a, b) => a.localeCompare(b, "pt-BR"))
    : [];

  return (
    <ProducaoLayout
      titulo="Costureiras"
      subtitulo="Quem costura, em que setor e máquinas, e quantos minutos trabalha em cada dia."
      acoes={
        !form && (
          <button type="button" className="botao botao-primario" onClick={novo}>
            <Plus size={16} aria-hidden />
            Nova costureira
          </button>
        )
      }
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {form && (
        <form className="bloco" onSubmit={salvar}>
          <div className="bloco-cabecalho">
            <h2>{form.id ? `Editar ${form.nome}` : "Nova costureira"}</h2>
          </div>
          <div className="campos grade-3">
            <label className="campo">
              <span>Nome</span>
              <input autoFocus className="entrada" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label className="campo">
              <span>Setor</span>
              <input
                className="entrada"
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
            <div className="campo" style={{ justifyContent: "flex-end" }}>
              <label className="marcar" style={{ height: 38 }}>
                <input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
                Ativa (aparece no apontamento)
              </label>
            </div>
          </div>

          <div className="campo" style={{ marginTop: 16 }}>
            <span id="rotulo-maquinas">
              Máquinas em que trabalha
              {form.maquinas.length > 0 && <span className="fraco"> · {form.maquinas.length}</span>}
            </span>
            {maquinasDoForm.length === 0 ? (
              <small>Nenhuma máquina cadastrada. As máquinas vêm do cadastro de Operações.</small>
            ) : (
              <div className="periodo-fichas maquinas-fichas" role="group" aria-labelledby="rotulo-maquinas">
                {maquinasDoForm.map((m) => {
                  const marcada = form.maquinas.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      className="ficha"
                      aria-pressed={marcada}
                      onClick={() =>
                        setForm({ ...form, maquinas: marcada ? form.maquinas.filter((x) => x !== m) : [...form.maquinas, m] })
                      }
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--regua)" }}>
            <label className="marcar" style={{ fontWeight: 600, color: "var(--tinta)" }}>
              <input
                type="checkbox"
                checked={form.jornadaPropria}
                onChange={(e) => setForm({ ...form, jornadaPropria: e.target.checked, jornada: { ...(form.jornada ?? padrao) } })}
              />
              Jornada diferente da padrão
            </label>
            <p className="bloco-descricao" style={{ margin: "4px 0 12px 24px" }}>
              {form.jornadaPropria
                ? "Minutos de trabalho dela em cada dia da semana."
                : `Usa a jornada padrão da fábrica: ${formatarMinutos(totalSemana(padrao))} por semana.`}
            </p>
            {form.jornadaPropria && (
              <div className="campos grade-dias">
                {DIAS_SEMANA.map((nome, d) => (
                  <label key={d} className="campo">
                    <span>{nome}</span>
                    <input
                      type="number"
                      min={0}
                      className="entrada num"
                      value={form.jornada[String(d)] ?? 0}
                      onChange={(e) => setForm({ ...form, jornada: { ...form.jornada, [String(d)]: Number(e.target.value) } })}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
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
            Equipe<span className="contagem">{ativas} ativas</span>
          </h2>
          <label className="marcar">
            <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
            Mostrar inativas
          </label>
        </div>
        {costureiras.length === 0 ? (
          <div className="vazio">
            <strong>Nenhuma costureira cadastrada</strong>
            Comece por aqui: cada costureira cadastrada aparece na tela de Apontamento.
          </div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              {tabela.thead}
              <tbody>
                {tabela.visiveis.map((c) => (
                  <tr key={c.id} style={{ opacity: c.ativa ? 1 : 0.55 }} data-selecionada={form?.id === c.id}>
                    <td className="forte">
                      {c.nome} {!c.ativa && <span className="selo">inativa</span>}
                    </td>
                    <td>{c.setor ?? <span className="fraco">—</span>}</td>
                    <td>
                      {c.maquinas?.length ? (
                        <div className="maquinas-selos">
                          {c.maquinas.map((m) => (
                            <span key={m} className="selo">
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="fraco">—</span>
                      )}
                    </td>
                    <td>
                      {formatarMinutos(totalSemana(c.jornada ?? padrao))}{" "}
                      <span className="fraco">{c.jornada ? "própria" : "padrão"}</span>
                    </td>
                    <td>
                      <div className="acoes">
                        <button type="button" className="botao botao-pequeno botao-fantasma" onClick={() => editar(c)}>
                          <Pencil size={14} aria-hidden />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="botao botao-pequeno botao-icone botao-perigo"
                          onClick={() => excluir(c)}
                          aria-label={`Excluir ${c.nome}`}
                          title="Excluir"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tabela.rodape}
            {tabela.visiveis.length === 0 && <div className="vazio">Nenhuma costureira encontrada.</div>}
          </div>
        )}
      </section>
    </ProducaoLayout>
  );
}
