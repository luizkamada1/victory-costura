"use client";

import { useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
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

  async function salvarJornada() {
    setErro(null);
    try {
      await api("/api/jornada", { method: "POST", body: JSON.stringify({ jornada }) });
      setSucesso("Jornada padrão salva.");
      setTimeout(() => setSucesso(null), 3000);
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
    if (!confirm("Excluir essa ocorrência?")) return;
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

  return (
    <ProducaoLayout titulo="Jornada e Ocorrências" subtitulo="Tempo disponível de trabalho por dia" largura={900}>
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}
      {sucesso && <div style={ui.sucessoBox}>{sucesso}</div>}

      <section style={ui.secao}>
        <h2 style={ui.secaoTitulo}>Jornada padrão (minutos por dia)</h2>
        <p style={ui.secaoDescricao}>
          Vale para todas as costureiras que não têm jornada própria. Total na semana:{" "}
          <b>{formatarMinutos(totalSemana)}</b> ({totalSemana} min).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))", gap: 10 }}>
          {DIAS_SEMANA.map((nome, d) => (
            <label key={d} style={ui.campo}>
              <span style={ui.label}>{nome}</span>
              <input
                type="number"
                min={0}
                style={ui.input}
                value={jornada[String(d)] ?? 0}
                onChange={(e) => setJornada({ ...jornada, [String(d)]: Number(e.target.value) })}
              />
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>{formatarMinutos(jornada[String(d)] ?? 0)}</span>
            </label>
          ))}
        </div>
        <button style={{ ...ui.botaoPrimario, marginTop: 14 }} onClick={salvarJornada}>
          Salvar jornada padrão
        </button>
      </section>

      <form style={ui.secao} onSubmit={salvarOcorrencia}>
        <h2 style={ui.secaoTitulo}>Nova ocorrência</h2>
        <p style={ui.secaoDescricao}>
          Reduz ou aumenta o tempo disponível de um dia. Ex: falta de luz (reduz), hora extra (aumenta), falta ou
          saída antecipada (reduz).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={ui.campo}>
            <span style={ui.label}>Data</span>
            <input
              type="date"
              style={ui.input}
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Costureira</span>
            <select
              style={ui.input}
              value={form.costureira_id}
              onChange={(e) => setForm({ ...form, costureira_id: e.target.value })}
            >
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
          <label style={ui.campo}>
            <span style={ui.label}>Tipo</span>
            <select
              style={ui.input}
              value={form.sentido}
              onChange={(e) => setForm({ ...form, sentido: e.target.value as FormOcorrencia["sentido"] })}
            >
              <option value="reduzir">− Reduz o tempo</option>
              <option value="aumentar">+ Aumenta o tempo</option>
            </select>
          </label>
          <label style={ui.campo}>
            <span style={ui.label}>Minutos</span>
            <input
              type="number"
              min={1}
              style={ui.input}
              value={form.minutos}
              onChange={(e) => setForm({ ...form, minutos: e.target.value })}
            />
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>
              Jornada do dia: {jornadaDoDia} min
              {jornadaDoDia > 0 && (
                <>
                  {" · "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setForm({
                        ...form,
                        sentido: "reduzir",
                        minutos: String(jornadaDoDia),
                        descricao: form.descricao || (form.costureira_id ? "Falta" : "Sem expediente"),
                      });
                    }}
                  >
                    dia inteiro
                  </a>
                </>
              )}
            </span>
          </label>
        </div>
        <label style={{ ...ui.campo, marginTop: 12 }}>
          <span style={ui.label}>Descrição</span>
          <input
            style={ui.input}
            placeholder="Ex: Falta de energia das 14h às 15h30"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </label>
        <button type="submit" style={{ ...ui.botaoPrimario, marginTop: 14 }}>
          + Registrar ocorrência
        </button>
      </form>

      <section style={ui.secao}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={ui.secaoTitulo}>Ocorrências do mês</h2>
          <input type="month" style={{ ...ui.input, width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={ui.tabela}>
            <thead>
              <tr>
                <th style={ui.th}>Data</th>
                <th style={ui.th}>Costureira</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Minutos</th>
                <th style={ui.th}>Descrição</th>
                <th style={ui.th}></th>
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map((o) => (
                <tr key={o.id}>
                  <td style={ui.td}>
                    {formatarData(o.data)}{" "}
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>{DIAS_SEMANA[diaSemana(o.data)].slice(0, 3)}</span>
                  </td>
                  <td style={{ ...ui.td, fontWeight: o.costureira_id ? 600 : 400, fontStyle: o.costureira_id ? "normal" : "italic" }}>
                    {nomeCostureira(o.costureira_id)}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      textAlign: "right",
                      fontWeight: 700,
                      color: o.minutos < 0 ? "#b91c1c" : "#15803d",
                    }}
                  >
                    {o.minutos > 0 ? "+" : ""}
                    {o.minutos}
                  </td>
                  <td style={ui.td}>{o.descricao ?? "—"}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>
                    <button style={ui.botaoPerigo} onClick={() => excluirOcorrencia(o)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ocorrencias.length === 0 && <p style={ui.vazio}>Nenhuma ocorrência nesse mês.</p>}
        </div>
      </section>
    </ProducaoLayout>
  );
}
