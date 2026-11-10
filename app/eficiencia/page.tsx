"use client";

import { Fragment, useEffect, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import { DIAS_SEMANA, corEficiencia, diaSemana, formatarData, formatarMinutos, hojeISO } from "@/lib/producao";

type Dia = {
  data: string;
  jornada: number;
  ocorrencias: number;
  disponivel: number;
  produzido: number;
  operacoes: number;
  pecas: number;
};
type Linha = {
  id: number;
  nome: string;
  setor: string | null;
  ativa: boolean;
  disponivel: number;
  produzido: number;
  operacoes: number;
  eficiencia: number | null;
  dias: Dia[];
};

function somarDias(iso: string, dias: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function periodo(preset: string): [string, string] {
  const hoje = hojeISO();
  const [a, m] = hoje.split("-").map(Number);
  switch (preset) {
    case "ontem":
      return [somarDias(hoje, -1), somarDias(hoje, -1)];
    case "semana":
      return [somarDias(hoje, -((diaSemana(hoje) + 6) % 7)), hoje];
    case "mes":
      return [`${hoje.slice(0, 7)}-01`, hoje];
    case "mes-passado": {
      const inicio = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
      const fim = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
      return [inicio, fim];
    }
    default:
      return [hoje, hoje];
  }
}

const PRESETS: [string, string][] = [
  ["hoje", "Hoje"],
  ["ontem", "Ontem"],
  ["semana", "Esta semana"],
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
];

const pct = (ef: number | null) => (ef === null ? "—" : `${(ef * 100).toFixed(1)}%`);

export default function EficienciaPage() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodo("mes"));
  const [preset, setPreset] = useState("mes");
  const [setor, setSetor] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    if (!inicio || !fim) return;
    setCarregando(true);
    setErro(null);
    api<{ costureiras: Linha[] }>(`/api/eficiencia?inicio=${inicio}&fim=${fim}`)
      .then((r) => setLinhas(r.costureiras))
      .catch((e) => setErro(mensagemErro(e)))
      .finally(() => setCarregando(false));
  }, [inicio, fim]);

  const setores = Array.from(new Set(linhas.map((l) => l.setor).filter(Boolean))) as string[];
  const visiveis = linhas
    .filter((l) => !setor || l.setor === setor)
    .sort((a, b) => (b.eficiencia ?? -1) - (a.eficiencia ?? -1));
  const totalDisp = visiveis.reduce((s, l) => s + l.disponivel, 0);
  const totalProd = visiveis.reduce((s, l) => s + l.produzido, 0);
  const efEquipe = totalDisp > 0 ? totalProd / totalDisp : null;

  async function exportar() {
    const XLSX = await import("xlsx");
    const resumo = visiveis.map((l) => ({
      Costureira: l.nome,
      Setor: l.setor ?? "",
      "Minutos disponíveis": l.disponivel,
      "Minutos produzidos": Math.round(l.produzido * 10) / 10,
      Operações: l.operacoes,
      "Eficiência (%)": l.eficiencia === null ? "" : Math.round(l.eficiencia * 1000) / 10,
    }));
    const diario = visiveis.flatMap((l) =>
      l.dias.map((d) => ({
        Costureira: l.nome,
        Data: formatarData(d.data),
        "Jornada (min)": d.jornada,
        "Ocorrências (min)": d.ocorrencias,
        "Disponível (min)": d.disponivel,
        "Produzido (min)": Math.round(d.produzido * 10) / 10,
        "Eficiência (%)": d.disponivel > 0 ? Math.round((d.produzido / d.disponivel) * 1000) / 10 : "",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diario), "Por dia");
    XLSX.writeFile(wb, `eficiencia_${inicio}_${fim}.xlsx`);
  }

  return (
    <ProducaoLayout titulo="Eficiência das Costureiras" subtitulo="Tempo produzido ÷ tempo disponível">
      {erro && <div style={ui.erroBox}>Erro: {erro}</div>}

      <section style={{ ...ui.secao, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map(([id, rotulo]) => (
            <button
              key={id}
              style={{
                ...ui.botaoSecundario,
                ...(preset === id ? { background: "#eef2ff", borderColor: "#818cf8", color: "#4338ca" } : {}),
              }}
              onClick={() => {
                setPreset(id);
                setPeriodo(periodo(id));
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <label style={ui.campo}>
          <span style={ui.label}>De</span>
          <input
            type="date"
            style={ui.input}
            value={inicio}
            onChange={(e) => {
              setPreset("");
              setPeriodo([e.target.value, fim]);
            }}
          />
        </label>
        <label style={ui.campo}>
          <span style={ui.label}>Até</span>
          <input
            type="date"
            style={ui.input}
            value={fim}
            onChange={(e) => {
              setPreset("");
              setPeriodo([inicio, e.target.value]);
            }}
          />
        </label>
        {setores.length > 0 && (
          <label style={ui.campo}>
            <span style={ui.label}>Setor</span>
            <select style={ui.input} value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Todos</option>
              {setores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <button style={{ ...ui.botaoSecundario, marginLeft: "auto" }} onClick={exportar} disabled={!visiveis.length}>
          Exportar Excel
        </button>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Cartao rotulo="Eficiência da equipe" valor={pct(efEquipe)} cor={corEficiencia(efEquipe)} />
        <Cartao rotulo="Tempo produzido" valor={formatarMinutos(totalProd)} detalhe={`${Math.round(totalProd)} min`} />
        <Cartao rotulo="Tempo disponível" valor={formatarMinutos(totalDisp)} detalhe={`${totalDisp} min`} />
      </div>

      <section style={ui.secao}>
        <h2 style={ui.secaoTitulo}>
          Ranking {carregando && <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>atualizando…</span>}
        </h2>
        <p style={ui.secaoDescricao}>Clique numa costureira para ver o detalhe por dia.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={ui.tabela}>
            <thead>
              <tr>
                <th style={ui.th}>Costureira</th>
                <th style={ui.th}>Setor</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Disponível</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Produzido</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Tickets</th>
                <th style={{ ...ui.th, width: 260 }}>Eficiência</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <Fragment key={l.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setAberta(aberta === l.id ? null : l.id)}>
                    <td style={{ ...ui.td, fontWeight: 700 }}>
                      <span style={{ color: "#9ca3af", marginRight: 6 }}>{aberta === l.id ? "▾" : "▸"}</span>
                      {l.nome}
                    </td>
                    <td style={ui.td}>{l.setor ?? "—"}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{formatarMinutos(l.disponivel)}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{formatarMinutos(l.produzido)}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{l.operacoes}</td>
                    <td style={ui.td}>
                      <BarraEficiencia ef={l.eficiencia} />
                    </td>
                  </tr>
                  {aberta === l.id && (
                    <tr>
                      <td colSpan={6} style={{ ...ui.td, background: "#fafafa", padding: "8px 16px 14px" }}>
                        <table style={{ ...ui.tabela, fontSize: 12.5 }}>
                          <thead>
                            <tr>
                              <th style={ui.th}>Dia</th>
                              <th style={{ ...ui.th, textAlign: "right" }}>Jornada</th>
                              <th style={{ ...ui.th, textAlign: "right" }}>Ocorrências</th>
                              <th style={{ ...ui.th, textAlign: "right" }}>Disponível</th>
                              <th style={{ ...ui.th, textAlign: "right" }}>Produzido</th>
                              <th style={{ ...ui.th, textAlign: "right" }}>Tickets</th>
                              <th style={{ ...ui.th, width: 220 }}>Eficiência</th>
                            </tr>
                          </thead>
                          <tbody>
                            {l.dias.map((d) => (
                              <tr key={d.data}>
                                <td style={ui.td}>
                                  {formatarData(d.data)}{" "}
                                  <span style={{ color: "#9ca3af" }}>{DIAS_SEMANA[diaSemana(d.data)].slice(0, 3)}</span>
                                </td>
                                <td style={{ ...ui.td, textAlign: "right" }}>{d.jornada}</td>
                                <td
                                  style={{
                                    ...ui.td,
                                    textAlign: "right",
                                    color: d.ocorrencias < 0 ? "#b91c1c" : d.ocorrencias > 0 ? "#15803d" : "#9ca3af",
                                  }}
                                >
                                  {d.ocorrencias > 0 ? "+" : ""}
                                  {d.ocorrencias || "—"}
                                </td>
                                <td style={{ ...ui.td, textAlign: "right" }}>{d.disponivel}</td>
                                <td style={{ ...ui.td, textAlign: "right" }}>
                                  {d.produzido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                                </td>
                                <td style={{ ...ui.td, textAlign: "right" }}>{d.operacoes}</td>
                                <td style={ui.td}>
                                  {d.disponivel > 0 ? (
                                    <BarraEficiencia ef={d.produzido / d.disponivel} />
                                  ) : (
                                    <span style={{ color: "#b45309", fontSize: 12 }}>produção sem jornada</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {l.dias.length === 0 && <p style={ui.vazio}>Sem jornada nem produção no período.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {visiveis.length === 0 && !carregando && <p style={ui.vazio}>Nenhuma costureira encontrada.</p>}
        </div>
      </section>
    </ProducaoLayout>
  );
}

function BarraEficiencia({ ef }: { ef: number | null }) {
  const cor = corEficiencia(ef);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: "#eef0f3", borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${Math.min(100, (ef ?? 0) * 100)}%`, height: "100%", background: cor, borderRadius: 4 }} />
      </div>
      <span style={{ fontWeight: 800, color: cor, width: 58, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {pct(ef)}
      </span>
    </div>
  );
}

function Cartao({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div style={{ ...ui.secao, marginBottom: 0, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor ?? "#111827", marginTop: 4 }}>{valor}</div>
      {detalhe && <div style={{ fontSize: 12, color: "#9ca3af" }}>{detalhe}</div>}
    </div>
  );
}
