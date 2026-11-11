"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import {
  Costureira,
  DIAS_SEMANA,
  Jornada,
  Ocorrencia,
  diaSemana,
  formatarData,
  formatarMinutos,
  hojeISO,
  minutosJornada,
} from "@/lib/producao";

type FormOcorrencia = {
  data: string;
  costureira_id: string;
  sentido: "reduzir" | "aumentar";
  minutos: string;
  descricao: string;
};

export default function JornadaPage() {
  const [jornada, setJornada] = useState<Jornada>({});
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [form, setForm] = useState<FormOcorrencia>({
    data: hojeISO(),
    costureira_id: "",
    sentido: "reduzir",
    minutos: "",
    descricao: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [j, c] = await Promise.all([
          api<{ jornada: Jornada }>("/api/jornada"),
          api<{ costureiras: Costureira[] }>("/api/costureiras"),
        ]);
        setJornada(j.jornada);
        setCostureiras(c.costureiras);
      } catch (e) {
        setErro(mensagemErro(e));
      }
    })();
  }, []);

  async function carregarOcorrencias() {
    try {
      const [ano, m] = mes.split("-").map(Number);
      const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
      const r = await api<{ ocorrencias: Ocorrencia[] }>(`/api/ocorrencias?inicio=${mes}-01&fim=${fim}`);
      setOcorrencias(r.ocorrencias);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }
  useEffect(() => {
    if (mes) carregarOcorrencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function salvarJornada(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api("/api/jornada", { method: "POST", body: JSON.stringify({ jornada }) });
      setSucesso("Jornada padrão salva. Vale para todas as costureiras sem jornada própria.");
      setTimeout(() => setSucesso(null), 4000);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // Minutos da jornada do dia escolhido (da costureira, ou padrão se "todas")
  const costureiraForm = costureiras.find((c) => String(c.id) === form.costureira_id);
  const jornadaDoDia = form.data
    ? costureiraForm
      ? minutosJornada(costureiraForm, jornada, form.data)
      : Number(jornada[String(diaSemana(form.data))] ?? 0)
    : 0;

  async function salvarOcorrencia(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const minutos = Math.abs(Number(form.minutos)) * (form.sentido === "reduzir" ? -1 : 1);
    try {
      await api("/api/ocorrencias", {
        method: "POST",
        body: JSON.stringify({
          data: form.data,
          costureira_id: form.costureira_id || null,
          minutos,
          descricao: form.descricao,
        }),
      });
      setForm({ ...form, minutos: "", descricao: "" });
      if (form.data.slice(0, 7) !== mes) setMes(form.data.slice(0, 7));
      else await carregarOcorrencias();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function excluirOcorrencia(o: Ocorrencia) {
    if (!confirm(`Excluir a ocorrência de ${formatarData(o.data)}? Os minutos voltam ao normal nesse dia.`)) return;
    try {
      await api(`/api/ocorrencias?id=${o.id}`, { method: "DELETE" });
      await carregarOcorrencias();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const nomeCostureira = (id: number | null) =>
    id ? costureiras.find((c) => c.id === id)?.nome ?? `#${id}` : "Todas as costureiras";
  const totalSemana = Object.values(jornada).reduce((s, v) => s + (Number(v) || 0), 0);
  const tabela = useTabela<Ocorrencia>(
    ocorrencias,
    [
      { id: "data", titulo: "Dia", valor: (o) => o.data, texto: (o) => `${formatarData(o.data)} ${DIAS_SEMANA[diaSemana(o.data)]}` },
      { id: "costureira", titulo: "Costureira", valor: (o) => nomeCostureira(o.costureira_id) },
      { id: "minutos", titulo: "Minutos", alinhar: "right", valor: (o) => o.minutos },
      { id: "descricao", titulo: "Motivo", valor: (o) => o.descricao },
      { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
    ],
    { id: "data", direcao: "desc" }
  );

  return (
    <ProducaoLayout titulo="Jornada e Ocorrências" subtitulo="Quantos minutos cada costureira tem para trabalhar em cada dia.">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}

      <form className="bloco" onSubmit={salvarJornada}>
        <div className="bloco-cabecalho">
          <div>
            <h2>Jornada padrão</h2>
            <p className="bloco-descricao">
              Minutos por dia da semana. Total: <span className="num">{formatarMinutos(totalSemana)}</span> por semana.
            </p>
          </div>
          <button type="submit" className="botao botao-primario">
            Salvar jornada
          </button>
        </div>
        <div className="campos grade-dias">
          {DIAS_SEMANA.map((nome, d) => (
            <label key={d} className="campo">
              <span>{nome}</span>
              <input
                type="number"
                min={0}
                className="entrada num"
                value={jornada[String(d)] ?? 0}
                onChange={(e) => setJornada({ ...jornada, [String(d)]: Number(e.target.value) })}
              />
              <small className="num">{formatarMinutos(jornada[String(d)] ?? 0)}</small>
            </label>
          ))}
        </div>
      </form>

      <form className="bloco" onSubmit={salvarOcorrencia}>
        <div className="bloco-cabecalho">
          <div>
            <h2>Nova ocorrência</h2>
            <p className="bloco-descricao">
              Tira ou soma minutos num dia: falta de luz e falta tiram, hora extra soma.
            </p>
          </div>
        </div>
        <div className="campos grade-ocorrencia">
          <label className="campo">
            <span>Dia</span>
            <input type="date" className="entrada" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </label>
          <label className="campo">
            <span>Costureira</span>
            <select className="entrada" value={form.costureira_id} onChange={(e) => setForm({ ...form, costureira_id: e.target.value })}>
              <option value="">Todas as costureiras</option>
              {costureiras
                .filter((c) => c.ativa)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>Efeito</span>
            <select
              className="entrada"
              value={form.sentido}
              onChange={(e) => setForm({ ...form, sentido: e.target.value as FormOcorrencia["sentido"] })}
            >
              <option value="reduzir">Tira minutos</option>
              <option value="aumentar">Soma minutos</option>
            </select>
          </label>
          <label className="campo">
            <span>Minutos</span>
            <input
              type="number"
              min={1}
              className="entrada num"
              value={form.minutos}
              onChange={(e) => setForm({ ...form, minutos: e.target.value })}
            />
            <small>
              Jornada do dia: <span className="num">{jornadaDoDia}</span> min
              {jornadaDoDia > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="link"
                    onClick={() =>
                      setForm({
                        ...form,
                        sentido: "reduzir",
                        minutos: String(jornadaDoDia),
                        descricao: form.descricao || (form.costureira_id ? "Falta" : "Sem expediente"),
                      })
                    }
                  >
                    dia inteiro
                  </button>
                </>
              )}
            </small>
          </label>
          <label className="campo motivo">
            <span>Motivo</span>
            <input
              className="entrada"
              placeholder="Ex: falta de energia das 14h às 15h30"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </label>
        </div>
        <button type="submit" className="botao botao-primario" style={{ marginTop: 6 }}>
          <Plus size={16} aria-hidden />
          Registrar ocorrência
        </button>
      </form>

      <section className="bloco">
        <div className="bloco-cabecalho">
          <h2>
            Ocorrências do mês<span className="contagem">{ocorrencias.length}</span>
          </h2>
          <input
            type="month"
            className="entrada"
            style={{ width: 170 }}
            aria-label="Mês"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        {ocorrencias.length === 0 ? (
          <div className="vazio">
            <strong>Nenhuma ocorrência neste mês</strong>
            Todos os dias seguem a jornada normal.
          </div>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela">
              {tabela.thead}
              <tbody>
                {tabela.visiveis.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {formatarData(o.data)} <span className="fraco">{DIAS_SEMANA[diaSemana(o.data)].slice(0, 3)}</span>
                    </td>
                    <td className={o.costureira_id ? "forte" : "fraco"}>{nomeCostureira(o.costureira_id)}</td>
                    <td className="direita forte" style={{ color: o.minutos < 0 ? "var(--erro)" : "var(--ok)" }}>
                      {o.minutos > 0 ? `+${o.minutos}` : o.minutos}
                    </td>
                    <td className="quebra">{o.descricao ?? <span className="fraco">—</span>}</td>
                    <td>
                      <div className="acoes">
                        <button
                          type="button"
                          className="botao botao-pequeno botao-icone botao-perigo"
                          onClick={() => excluirOcorrencia(o)}
                          aria-label="Excluir ocorrência"
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
    </ProducaoLayout>
  );
}
