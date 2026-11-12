"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { AJUSTES_PADRAO, AjustesGrade, GRADES, NOME_PARTE, Operacao, PARTES, Parte, fatorGrade } from "@/lib/producao";

type Form = { id?: number; nome: string; tempo_minutos: string; maquina: string; parte: Parte };
const VAZIO: Form = { nome: "", tempo_minutos: "", maquina: "", parte: "superior" };

// 3 casas fixas: os tempos ajustados por grade (ex: 0,495) alinham pela vírgula com os cadastrados
const tempoTexto = (t: number) => t.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ajustes, setAjustes] = useState<AjustesGrade>({ ...AJUSTES_PADRAO });

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
    api<{ ajustes: AjustesGrade }>("/api/ajustes-grade")
      .then((r) => setAjustes(r.ajustes))
      .catch((e) => setErro(mensagemErro(e)));
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
            <p className="bloco-descricao">O tempo é para fazer a operação em uma peça da grade Adulto, em minutos (ex: 0,45).</p>
          </div>
        </div>
        <div className="campos grade-operacao">
          <label className="campo">
            <span>Nome da operação</span>
            <input className="entrada" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label className="campo">
            <span>Tempo Adulto (min)</span>
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
          ajustes={ajustes}
          key={parte}
          parte={parte}
          operacoes={operacoes.filter((o) => o.parte === parte)}
          editandoId={form.id}
          onEditar={editar}
          onExcluir={excluir}
        />
      ))}

      <AjustesPorGrade ajustes={ajustes} onSalvo={setAjustes} />
    </ProducaoLayout>
  );
}

function TabelaParte({
  ajustes,
  parte,
  operacoes,
  editandoId,
  onEditar,
  onExcluir,
}: {
  parte: Parte;
  operacoes: Operacao[];
  ajustes: AjustesGrade;
  editandoId?: number;
  onEditar: (o: Operacao) => void;
  onExcluir: (o: Operacao) => void;
}) {
  const [aberta, setAberta] = useState(true);
  const tabela = useTabela<Operacao>(
    operacoes,
    [
      // larguras fixas para as colunas das duas partes ficarem alinhadas uma sob a outra
      { id: "nome", titulo: "Operação", largura: "28%", valor: (o) => o.nome },
      { id: "maquina", titulo: "Máquina", largura: "16%", valor: (o) => o.maquina },
      // tempo de uma peça em cada grade; o cadastrado é o da Adulto
      ...Object.keys(GRADES).map((g) => ({
        id: `tempo-${g}`,
        titulo: g,
        largura: "10%",
        alinhar: "right" as const,
        valor: (o: Operacao) => o.tempo_minutos * fatorGrade([g], ajustes),
        texto: (o: Operacao) => tempoTexto(o.tempo_minutos * fatorGrade([g], ajustes)),
      })),
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "nome", direcao: "asc" }
  );

  return (
    <section className="bloco">
      <div className="bloco-cabecalho" style={aberta ? undefined : { marginBottom: 0 }}>
        <TituloRecolhivel aberto={aberta} onAlternar={() => setAberta((v) => !v)}>
          {NOME_PARTE[parte]}
          <span className="contagem">{operacoes.length}</span>
        </TituloRecolhivel>
      </div>
      {!aberta ? null : operacoes.length === 0 ? (
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
                  {Object.keys(GRADES).map((g) => (
                    <td key={g} className={g === "Adulto" ? "direita forte" : "direita fraco"}>
                      {tempoTexto(o.tempo_minutos * fatorGrade([g], ajustes))}
                    </td>
                  ))}
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

// Percentual sobre o tempo cadastrado (grade Adulto) aplicado a cada grade ao gerar tickets
function AjustesPorGrade({ ajustes, onSalvo }: { ajustes: AjustesGrade; onSalvo: (a: AjustesGrade) => void }) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    setValores(Object.fromEntries(Object.keys(GRADES).map((g) => [g, String(ajustes[g] ?? 0).replace(".", ",")])));
  }, [ajustes]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setRetorno(null);
    const novos: AjustesGrade = Object.fromEntries(
      Object.keys(GRADES).map((g) => [g, Number((valores[g] ?? "0").replace(",", ".")) || 0])
    );
    try {
      await api("/api/ajustes-grade", { method: "POST", body: JSON.stringify({ ajustes: novos }) });
      onSalvo(novos);
      setRetorno({ tipo: "ok", texto: "Ajustes salvos. Valem para os próximos tickets gerados." });
    } catch (err) {
      setRetorno({ tipo: "erro", texto: mensagemErro(err) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="bloco" onSubmit={salvar}>
      <div className="bloco-cabecalho" style={aberto ? undefined : { marginBottom: 0 }}>
        <div>
          <TituloRecolhivel aberto={aberto} onAlternar={() => setAberto((v) => !v)}>
            Ajuste de tempo por grade
          </TituloRecolhivel>
          <p className="bloco-descricao">
            {aberto
              ? "O tempo cadastrado vale para a grade Adulto. As outras grades somam ou tiram este percentual ao gerar os tickets. Tickets já gerados não mudam."
              : Object.keys(GRADES)
                  .filter((g) => g !== "Adulto")
                  .map((g) => `${g} ${(ajustes[g] ?? 0) > 0 ? "+" : ""}${String(ajustes[g] ?? 0).replace(".", ",")}%`)
                  .join(" · ")}
          </p>
        </div>
        {aberto && (
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar ajustes"}
          </button>
        )}
      </div>
      {aberto && (
      <div className="campos grade-ajustes">
        {Object.keys(GRADES).map((g) => (
          <label key={g} className="campo">
            <span>{g}</span>
            <div className="entrada-sufixo">
              <input
                className="entrada num"
                inputMode="decimal"
                disabled={g === "Adulto"}
                value={g === "Adulto" ? "0" : valores[g] ?? ""}
                onChange={(e) => setValores({ ...valores, [g]: e.target.value })}
              />
              <span>%</span>
            </div>
            <small>{g === "Adulto" ? "Base: o tempo cadastrado" : "Use - para diminuir (ex: -5)"}</small>
          </label>
        ))}
      </div>
      )}
      {retorno && (
        <div style={{ marginTop: 12 }}>
          <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>
        </div>
      )}
    </form>
  );
}

// Título de bloco que abre e fecha o conteúdo ao clicar
function TituloRecolhivel({ aberto, onAlternar, children }: { aberto: boolean; onAlternar: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="titulo-recolhivel" onClick={onAlternar} aria-expanded={aberto}>
      <ChevronDown size={18} aria-hidden style={{ transform: aberto ? "none" : "rotate(-90deg)" }} />
      <h2>{children}</h2>
    </button>
  );
}
