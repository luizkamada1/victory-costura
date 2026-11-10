"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { BarraEficiencia, pct } from "@/components/Medidas";
import { useTabela } from "@/components/Tabela";
import { DIAS_SEMANA, diaSemana, formatarData, formatarMinutos, hojeISO } from "@/lib/producao";

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

const minutos = (m: number) => m.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function EficienciaPage() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodo("mes"));
  const [preset, setPreset] = useState("mes");
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

  const tabela = useTabela<Linha>(
    linhas,
    [
      { id: "nome", titulo: "Costureira", valor: (l) => l.nome },
      { id: "setor", titulo: "Setor", valor: (l) => l.setor },
      { id: "disponivel", titulo: "Disponível", alinhar: "right", valor: (l) => l.disponivel, texto: (l) => formatarMinutos(l.disponivel) },
      { id: "produzido", titulo: "Produzido", alinhar: "right", valor: (l) => l.produzido, texto: (l) => formatarMinutos(l.produzido) },
      { id: "cupons", titulo: "Cupons", alinhar: "right", valor: (l) => l.operacoes },
      {
        id: "eficiencia",
        titulo: "Eficiência",
        largura: "30%",
        // em %, para o filtro aceitar ">80"
        valor: (l) => (l.eficiencia === null ? null : Math.round(l.eficiencia * 1000) / 10),
        texto: (l) => pct(l.eficiencia),
      },
    ],
    { id: "eficiencia", direcao: "desc" }
  );
  const visiveis = tabela.visiveis;
  const totalDisp = visiveis.reduce((s, l) => s + l.disponivel, 0);
  const totalProd = visiveis.reduce((s, l) => s + l.produzido, 0);
  const totalCupons = visiveis.reduce((s, l) => s + l.operacoes, 0);

  async function exportar() {
    const XLSX = await import("xlsx");
    const resumo = visiveis.map((l) => ({
      Costureira: l.nome,
      Setor: l.setor ?? "",
      "Minutos disponíveis": l.disponivel,
      "Minutos produzidos": Math.round(l.produzido * 10) / 10,
      Cupons: l.operacoes,
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
    <ProducaoLayout
      titulo="Eficiência"
      subtitulo="Tempo produzido dividido pelo tempo disponível de cada costureira."
      acoes={
        <button type="button" className="botao botao-secundario" onClick={exportar} disabled={!visiveis.length}>
          <Download size={16} aria-hidden />
          Exportar para Excel
        </button>
      }
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section className="bloco periodo">
        <div className="periodo-fichas" role="group" aria-label="Período">
          {PRESETS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className="ficha"
              aria-pressed={preset === id}
              onClick={() => {
                setPreset(id);
                setPeriodo(periodo(id));
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="periodo-datas">
          <label className="campo">
            <span>De</span>
            <input
              type="date"
              className="entrada"
              value={inicio}
              onChange={(e) => {
                setPreset("");
                setPeriodo([e.target.value, fim]);
              }}
            />
          </label>
          <label className="campo">
            <span>Até</span>
            <input
              type="date"
              className="entrada"
              value={fim}
              onChange={(e) => {
                setPreset("");
                setPeriodo([inicio, e.target.value]);
              }}
            />
          </label>
        </div>
      </section>

      <section className="bloco" aria-busy={carregando}>
        <div className="bloco-cabecalho">
          <div>
            <h2>Por costureira</h2>
            <p className="bloco-descricao">
              Clique numa linha para ver dia a dia. Todas as barras usam a mesma régua; o traço marca 100%.
            </p>
          </div>
          {carregando && <span className="fraco" style={{ fontSize: 12.5 }}>Atualizando…</span>}
        </div>
        <div className="tabela-caixa">
          <table className="tabela">
            {tabela.thead}
            <tbody>
              {visiveis.map((l) => {
                const aberto = aberta === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setAberta(aberto ? null : l.id)}
                      data-selecionada={aberto}
                      aria-expanded={aberto}
                    >
                      <td className="forte">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <ChevronRight
                            size={15}
                            aria-hidden
                            style={{ transform: aberto ? "rotate(90deg)" : "none", transition: "transform 160ms ease-out" }}
                          />
                          {l.nome}
                        </span>
                      </td>
                      <td>{l.setor ?? "—"}</td>
                      <td className="direita">{formatarMinutos(l.disponivel)}</td>
                      <td className="direita">{formatarMinutos(l.produzido)}</td>
                      <td className="direita">{l.operacoes}</td>
                      <td>
                        <BarraEficiencia ef={l.eficiencia} />
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="detalhe">
                        <td colSpan={6} style={{ padding: "8px 20px 16px" }}>
                          {l.dias.length ? (
                            <DetalheDias dias={l.dias} />
                          ) : (
                            <div className="vazio">Sem jornada nem produção neste período.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {visiveis.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={2}>{tabela.filtrando ? "Total filtrado" : "Total da equipe"}</td>
                  <td className="direita">{formatarMinutos(totalDisp)}</td>
                  <td className="direita">{formatarMinutos(totalProd)}</td>
                  <td className="direita">{totalCupons}</td>
                  <td>
                    <BarraEficiencia ef={totalDisp > 0 ? totalProd / totalDisp : null} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {tabela.rodape}
          {visiveis.length === 0 && !carregando && (
            <div className="vazio">
              <strong>Nenhuma costureira neste período</strong>
              Cadastre costureiras e aponte cupons para ver a eficiência aqui.
            </div>
          )}
        </div>
      </section>
    </ProducaoLayout>
  );
}

function DetalheDias({ dias }: { dias: Dia[] }) {
  const ef = (d: Dia) => (d.disponivel > 0 ? d.produzido / d.disponivel : null);
  const tabela = useTabela<Dia>(dias, [
    { id: "data", titulo: "Dia", valor: (d) => d.data, texto: (d) => `${formatarData(d.data)} ${DIAS_SEMANA[diaSemana(d.data)]}` },
    { id: "jornada", titulo: "Jornada", alinhar: "right", valor: (d) => d.jornada },
    { id: "ocorrencias", titulo: "Ocorrências", alinhar: "right", valor: (d) => d.ocorrencias },
    { id: "disponivel", titulo: "Disponível", alinhar: "right", valor: (d) => d.disponivel },
    { id: "produzido", titulo: "Produzido", alinhar: "right", valor: (d) => d.produzido, texto: (d) => minutos(d.produzido) },
    { id: "cupons", titulo: "Cupons", alinhar: "right", valor: (d) => d.operacoes },
    {
      id: "eficiencia",
      titulo: "Eficiência",
      largura: "28%",
      valor: (d) => {
        const e = ef(d);
        return e === null ? null : Math.round(e * 1000) / 10;
      },
      texto: (d) => (d.disponivel > 0 ? pct(ef(d)) : "produção sem jornada"),
    },
  ]);
  return (
    <>
      <table className="tabela">
        {tabela.thead}
        <tbody>
          {tabela.visiveis.map((d) => (
            <tr key={d.data}>
              <td>
                {formatarData(d.data)} <span className="fraco">{DIAS_SEMANA[diaSemana(d.data)].slice(0, 3)}</span>
              </td>
              <td className="direita">{d.jornada}</td>
              <td
                className="direita"
                style={{ color: d.ocorrencias < 0 ? "var(--erro)" : d.ocorrencias > 0 ? "var(--ok)" : "var(--tinta-3)" }}
              >
                {d.ocorrencias > 0 ? `+${d.ocorrencias}` : d.ocorrencias || "—"}
              </td>
              <td className="direita">{d.disponivel}</td>
              <td className="direita">{minutos(d.produzido)}</td>
              <td className="direita">{d.operacoes}</td>
              <td>
                {d.disponivel > 0 ? (
                  <BarraEficiencia ef={ef(d)} />
                ) : (
                  <span style={{ color: "var(--alerta)", fontSize: 12.5 }}>Produção num dia sem jornada</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tabela.rodape}
    </>
  );
}
