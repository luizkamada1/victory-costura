"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { NOME_PARTE, Operacao, PARTES, Parte } from "@/lib/producao";

type Form = { id?: number; nome: string; tempo_minutos: string; maquina: string; parte: Parte };
const VAZIO: Form = { nome: "", tempo_minutos: "", maquina: "", parte: "superior" };

const tempoTexto = (t: number) => t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [form, setForm] = useState<Form>(VAZIO);
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
    if (!confirm(`Excluir a operação "${o.nome}"? Ela também sai da sequência dos itens. Tickets já impressos não mudam.`))
      return;
    try {
      await api(`/api/operacoes?id=${o.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  function editar(o: Operacao) {
    setForm({
      id: o.id,
      nome: o.nome,
      tempo_minutos: String(o.tempo_minutos).replace(".", ","),
      maquina: o.maquina ?? "",
      parte: o.parte,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const maquinas = Array.from(new Set(operacoes.map((o) => o.maquina).filter(Boolean))) as string[];
  const tempo = Number(form.tempo_minutos.replace(",", "."));

  return (
    <ProducaoLayout titulo="Operações" subtitulo="O que se faz na máquina, quanto tempo leva por peça e em que parte do pijama.">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <form className="bloco" onSubmit={salvar}>
        <div className="bloco-cabecalho">
          <div>
            <h2>{form.id ? `Editar "${form.nome}"` : "Nova operação"}</h2>
            <p className="bloco-descricao">O tempo é para fazer a operação em uma peça, em minutos (ex: 0,45).</p>
          </div>
        </div>
        <div className="campos grade-operacao">
          <label className="campo">
            <span>Nome da operação</span>
            <input className="entrada" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label className="campo">
            <span>Tempo por peça (min)</span>
            <input
              className="entrada num"
              inputMode="decimal"
              value={form.tempo_minutos}
              onChange={(e) => setForm({ ...form, tempo_minutos: e.target.value })}
            />
            <small>{tempo > 0 ? `Cerca de ${Math.floor(60 / tempo)} peças por hora` : " "}</small>
          </label>
          <label className="campo">
            <span>Máquina</span>
            <input
              className="entrada"
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
          <label className="campo">
            <span>Parte</span>
            <select className="entrada" value={form.parte} onChange={(e) => setForm({ ...form, parte: e.target.value as Parte })}>
              {PARTES.map((p) => (
                <option key={p} value={p}>
                  {NOME_PARTE[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {!form.id && <Plus size={16} aria-hidden />}
            {salvando ? "Salvando…" : form.id ? "Salvar alterações" : "Adicionar operação"}
          </button>
          {form.id && (
            <button type="button" className="botao botao-secundario" onClick={() => setForm(VAZIO)}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {PARTES.map((parte) => (
        <TabelaParte
          key={parte}
          parte={parte}
          operacoes={operacoes.filter((o) => o.parte === parte)}
          editandoId={form.id}
          onEditar={editar}
          onExcluir={excluir}
        />
      ))}
    </ProducaoLayout>
  );
}

function TabelaParte({
  parte,
  operacoes,
  editandoId,
  onEditar,
  onExcluir,
}: {
  parte: Parte;
  operacoes: Operacao[];
  editandoId?: number;
  onEditar: (o: Operacao) => void;
  onExcluir: (o: Operacao) => void;
}) {
  const tabela = useTabela<Operacao>(
    operacoes,
    [
      // larguras fixas para as colunas das duas partes ficarem alinhadas uma sob a outra
      { id: "nome", titulo: "Operação", largura: "42%", valor: (o) => o.nome },
      { id: "maquina", titulo: "Máquina", largura: "26%", valor: (o) => o.maquina },
      { id: "tempo", titulo: "Tempo por peça (min)", largura: "16%", alinhar: "right", valor: (o) => o.tempo_minutos, texto: (o) => tempoTexto(o.tempo_minutos) },
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "nome", direcao: "asc" }
  );

  return (
    <section className="bloco">
      <div className="bloco-cabecalho">
        <h2>
          {NOME_PARTE[parte]}
          <span className="contagem">{operacoes.length}</span>
        </h2>
      </div>
      {operacoes.length === 0 ? (
        <div className="vazio">
          <strong>Nenhuma operação da {NOME_PARTE[parte].toLowerCase()}</strong>
          Cadastre acima escolhendo &quot;{NOME_PARTE[parte]}&quot; no campo Parte.
        </div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela" style={{ tableLayout: "fixed" }}>
            {tabela.thead}
            <tbody>
              {tabela.visiveis.map((o) => (
                <tr key={o.id} data-selecionada={editandoId === o.id}>
                  <td className="forte">{o.nome}</td>
                  <td>{o.maquina ?? <span className="fraco">—</span>}</td>
                  <td className="direita">{tempoTexto(o.tempo_minutos)}</td>
                  <td>
                    <div className="acoes">
                      <button type="button" className="botao botao-pequeno botao-fantasma" onClick={() => onEditar(o)}>
                        <Pencil size={14} aria-hidden />
                        Editar
                      </button>
                      <button
                        type="button"
                        className="botao botao-pequeno botao-icone botao-perigo"
                        onClick={() => onExcluir(o)}
                        aria-label={`Excluir ${o.nome}`}
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
        </div>
      )}
    </section>
  );
}
