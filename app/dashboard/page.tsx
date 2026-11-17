"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Download } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { BarraEficiencia, pct } from "@/components/Medidas";
import GraficoEficiencia, { PontoEficiencia } from "@/components/GraficoEficiencia";
import { useTabela } from "@/components/Tabela";
import { TituloRecolhivel } from "@/components/Recolhivel";
import GraficoCostureiras, { Ordem } from "@/components/GraficoCostureiras";
import GraficoPecas from "@/components/GraficoPecas";
import type { ResumoPecas } from "@/lib/pecas";
import { DIAS_SEMANA, corEficiencia, diaSemana, formatarData, formatarMinutos, hojeISO } from "@/lib/producao";

// Eficiência   = produzido ÷ disponível (jornada menos as ausências dela): rende bem quando está presente?
// Produtividade = produzido ÷ previsto (jornada sem descontar as ausências): quanto entregou do que se esperava?
type Dia = {
  data: string;
  jornada: number;
  ocorrencias: number;
  disponivel: number;
  previsto: number;
  ausencias: number;
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
  previsto: number;
  ausencias: number;
  produzido: number;
  operacoes: number;
  eficiencia: number | null;
  produtividade: number | null;
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
    case "semana-passada": {
      // segunda a domingo da semana anterior
      const segunda = somarDias(hoje, -((diaSemana(hoje) + 6) % 7) - 7);
      return [segunda, somarDias(segunda, 6)];
    }
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
  ["semana-passada", "Semana passada"],
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
];

// "1" = o usuário deixou o resumo aberto; sem nada salvo, começa fechado
const CHAVE_RESUMO = "costura:eficiencia-resumo-aberto";

// dias que entram no gráfico: com produção e com tempo disponível
const apurados = (dias: PontoEficiencia[]) =>
  dias.filter((d) => d.produzido > 0 && d.disponivel > 0).sort((a, b) => a.data.localeCompare(b.data));

const minutos = (m: number) => m.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const razao = (a: number, b: number) => (b > 0 ? a / b : null);
const emPct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);

function situacao(v: number | null) {
  if (v === null) return null;
  return v >= 0.85 ? "Dentro do esperado" : v >= 0.65 ? "Atenção" : "Abaixo do esperado";
}

const DICA_EFICIENCIA = "Produzido ÷ tempo disponível (jornada menos as ausências). Mostra o rendimento enquanto está presente.";
const DICA_PRODUTIVIDADE = "Produzido ÷ jornada prevista, sem descontar as ausências. Mostra quanto entregou do que se esperava.";

export default function DashboardPage() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodo("mes"));
  const [preset, setPreset] = useState("mes");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [ultimoApontado, setUltimoApontado] = useState<string | null>(null);
  const [pecas, setPecas] = useState<ResumoPecas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  // costureira do gráfico por dia (null = equipe)
  const [costureiraGrafico, setCostureiraGrafico] = useState<number | null>(null);
  const [ordemBarras, setOrdemBarras] = useState<Ordem>("eficiencia");

  // lembra neste navegador se o resumo foi aberto
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_RESUMO) === "1") setResumoAberto(true);
    } catch {}
  }, []);
  function alternarResumo() {
    setResumoAberto((v) => {
      try {
        localStorage.setItem(CHAVE_RESUMO, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  useEffect(() => {
    if (!inicio || !fim) return;
    setCarregando(true);
    setErro(null);
    api<{ costureiras: Linha[]; ultimoApontado?: string | null; pecas?: ResumoPecas }>(`/api/eficiencia?inicio=${inicio}&fim=${fim}`)
      .then((r) => {
        setLinhas(r.costureiras);
        setUltimoApontado(r.ultimoApontado ?? null);
        setPecas(r.pecas ?? null);
      })
      .catch((e) => setErro(mensagemErro(e)))
      .finally(() => setCarregando(false));
  }, [inicio, fim]);

  const tabela = useTabela<Linha>(
    linhas,
    [
      { id: "nome", titulo: "Costureira", valor: (l) => l.nome },
      { id: "setor", titulo: "Setor", valor: (l) => l.setor },
      {
        id: "previsto",
        titulo: <span title="Jornada prevista no período, com horas extras e ocorrências da fábrica">Jornada</span>,
        alinhar: "right",
        valor: (l) => l.previsto,
        texto: (l) => formatarMinutos(l.previsto),
      },
      {
        id: "ausencias",
        titulo: <span title="Faltas e saídas lançadas para a costureira em Jornada e Ocorrências">Ausências</span>,
        alinhar: "right",
        valor: (l) => l.ausencias,
        texto: (l) => formatarMinutos(l.ausencias),
      },
      {
        id: "produzido",
        titulo: "Produzido",
        alinhar: "right",
        valor: (l) => l.produzido,
        texto: (l) => formatarMinutos(l.produzido),
      },
      { id: "cupons", titulo: "Cupons", alinhar: "right", valor: (l) => l.operacoes },
      {
        id: "eficiencia",
        titulo: <span title={DICA_EFICIENCIA}>Eficiência</span>,
        largura: "19%",
        // em %, para o filtro aceitar ">80"
        valor: (l) => emPct(l.eficiencia),
        texto: (l) => pct(l.eficiencia),
      },
      {
        id: "produtividade",
        titulo: <span title={DICA_PRODUTIVIDADE}>Produtividade</span>,
        largura: "19%",
        valor: (l) => emPct(l.produtividade),
        texto: (l) => pct(l.produtividade),
      },
    ],
    { id: "eficiencia", direcao: "desc" }
  );
  const visiveis = tabela.visiveis;
  const totalDisp = visiveis.reduce((s, l) => s + l.disponivel, 0);
  const totalPrev = visiveis.reduce((s, l) => s + l.previsto, 0);
  const totalAus = visiveis.reduce((s, l) => s + l.ausencias, 0);
  const totalProd = visiveis.reduce((s, l) => s + l.produzido, 0);
  const totalCupons = visiveis.reduce((s, l) => s + l.operacoes, 0);
  const efPeriodo = razao(totalProd, totalDisp);
  const prodPeriodo = razao(totalProd, totalPrev);

  // Gráfico por dia: os dias apurados (com produção) do período, somando as costureiras visíveis na tabela
  const porDia = new Map<string, PontoEficiencia & { previsto: number }>();
  for (const l of visiveis) {
    for (const d of l.dias) {
      const atual = porDia.get(d.data) ?? { data: d.data, produzido: 0, disponivel: 0, previsto: 0 };
      atual.produzido += d.produzido;
      atual.disponivel += d.disponivel;
      atual.previsto += d.previsto;
      porDia.set(d.data, atual);
    }
  }
  const diasApurados = apurados(Array.from(porDia.values()));
  const escolhida = linhas.find((l) => l.id === costureiraGrafico) ?? null;
  const pontosGrafico = escolhida ? apurados(escolhida.dias) : diasApurados;

  async function exportar() {
    const XLSX = await import("xlsx");
    const resumo = visiveis.map((l) => ({
      Costureira: l.nome,
      Setor: l.setor ?? "",
      "Jornada prevista (min)": l.previsto,
      "Ausências (min)": l.ausencias,
      "Minutos disponíveis": l.disponivel,
      "Minutos produzidos": Math.round(l.produzido * 10) / 10,
      Cupons: l.operacoes,
      "Eficiência (%)": emPct(l.eficiencia) ?? "",
      "Produtividade (%)": emPct(l.produtividade) ?? "",
    }));
    const diario = visiveis.flatMap((l) =>
      l.dias.map((d) => ({
        Costureira: l.nome,
        Data: formatarData(d.data),
        "Jornada (min)": d.jornada,
        "Ocorrências (min)": d.ocorrencias,
        "Ausências (min)": d.ausencias,
        "Disponível (min)": d.disponivel,
        "Produzido (min)": Math.round(d.produzido * 10) / 10,
        "Eficiência (%)": emPct(razao(d.produzido, d.disponivel)) ?? "",
        "Produtividade (%)": emPct(razao(d.produzido, d.previsto)) ?? "",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diario), "Por dia");
    if (pecas?.porDia.length) {
      const folhaPecas = pecas.porDia.map((d) => ({
        Data: formatarData(d.data),
        "Peças produzidas": d.pecas,
        "Partes superiores prontas": d.superior,
        "Partes inferiores prontas": d.inferior,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(folhaPecas), "Peças por dia");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(pecas.porReferencia.map((r) => ({ Referência: r.referencia, Pijama: r.nome ?? "", Peças: r.pecas }))),
        "Peças por referência"
      );
    }
    XLSX.writeFile(wb, `dashboard_${inicio}_${fim}.xlsx`);
  }

  return (
    <ProducaoLayout
      titulo="Dashboard"
      subtitulo="Peças produzidas, eficiência e produtividade da costura no período."
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
        {ultimoApontado && ultimoApontado < fim && (
          <p className="nota-apontamento">
            Produção apontada até <strong>{formatarData(ultimoApontado)}</strong>. Os dias seguintes ainda não entram
            na conta; passam a contar quando forem apontados.
          </p>
        )}
      </section>

      <div className="resumo-cabecalho">
        <TituloRecolhivel aberto={resumoAberto} onAlternar={alternarResumo}>
          Resumo do período
        </TituloRecolhivel>
        {!resumoAberto && (
          <span className="resumo-linha num" style={{ opacity: carregando ? 0.5 : 1 }}>
            <span className="fraco">Eficiência</span>
            <strong style={{ color: corEficiencia(efPeriodo) }}>{pct(efPeriodo)}</strong>
            <span className="fraco">Produtividade</span>
            <strong style={{ color: corEficiencia(prodPeriodo) }}>{pct(prodPeriodo)}</strong>
            <span className="fraco">Peças</span>
            <strong>{(pecas?.total ?? 0).toLocaleString("pt-BR")}</strong>
          </span>
        )}
      </div>

      {resumoAberto && (
        <>
          <div className="eficiencia-topo">
            <section className="bloco cartao-eficiencia" aria-busy={carregando}>
              <h2>Indicadores do período</h2>
              <p className="bloco-descricao">
                {formatarData(inicio)} a {formatarData(fim)}
                {tabela.filtrando ? " · costureiras filtradas" : ""}
              </p>
              <div className="indicadores" style={{ opacity: carregando ? 0.5 : 1 }}>
                <Indicador rotulo="Eficiência" dica={DICA_EFICIENCIA} valor={efPeriodo} classe="legenda-ef" />
                <Indicador rotulo="Produtividade" dica={DICA_PRODUTIVIDADE} valor={prodPeriodo} classe="legenda-prod" />
              </div>
              <p className="bloco-descricao num" style={{ marginTop: 14 }}>
                {formatarMinutos(totalProd)} produzidos de {formatarMinutos(totalDisp)} disponíveis
                {totalAus > 0 ? ` · ${formatarMinutos(totalAus)} de ausências` : ""}
              </p>
            </section>

            <section className="bloco" aria-busy={carregando}>
              <div className="bloco-cabecalho" style={{ alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <h2>Por dia</h2>
                  <p className="bloco-descricao">
                    Dias com produção entre {formatarData(inicio)} e {formatarData(fim)}
                    {escolhida ? ` · ${escolhida.nome}` : tabela.filtrando ? ", costureiras filtradas" : ""}.
                  </p>
                </div>
                <label className="campo campo-grafico">
                  <span>Costureira</span>
                  <select
                    className="entrada"
                    value={escolhida ? String(escolhida.id) : ""}
                    onChange={(e) => setCostureiraGrafico(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{tabela.filtrando ? "Costureiras filtradas" : "Toda a equipe"}</option>
                    {[...linhas]
                      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="legenda" style={{ marginBottom: 8 }}>
                <span>
                  <i className="legenda-ef" /> Eficiência
                </span>
                <span>
                  <i className="legenda-linha-prod" /> Produtividade
                </span>
              </div>
              <GraficoEficiencia pontos={pontosGrafico} carregando={carregando} nome={escolhida?.nome} />
            </section>
          </div>

          <div className="eficiencia-topo">
            <section className="bloco cartao-eficiencia" aria-busy={carregando}>
              <h2>Peças produzidas</h2>
              <p className="bloco-descricao">
                {formatarData(inicio)} a {formatarData(fim)} · equipe toda
              </p>
              <div className="indicadores" style={{ opacity: carregando ? 0.5 : 1 }}>
                <div className="indicador">
                  <span className="indicador-rotulo">No período</span>
                  <div className="numero-heroi num">{(pecas?.total ?? 0).toLocaleString("pt-BR")}</div>
                </div>
                <div className="indicador">
                  <span className="indicador-rotulo">Média por dia produzido</span>
                  <div className="numero-medio num">
                    {pecas?.porDia.length
                      ? Math.round(pecas.total / pecas.porDia.length).toLocaleString("pt-BR")
                      : "—"}
                  </div>
                </div>
              </div>
              {pecas && pecas.porReferencia.length > 0 && (
                <>
                  <p className="indicador-rotulo" style={{ marginTop: 16 }}>
                    Mais produzidas
                  </p>
                  <ul className="lista-referencias">
                    {pecas.porReferencia.slice(0, 5).map((r) => (
                      <li key={r.referencia}>
                        <span className="quebra">
                          <span className="num">{r.referencia}</span>
                          {r.nome ? <span className="fraco"> · {r.nome}</span> : null}
                        </span>
                        <strong className="num">{r.pecas.toLocaleString("pt-BR")}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="bloco" aria-busy={carregando}>
              <h2>Peças por dia</h2>
              <p className="bloco-descricao" style={{ marginBottom: 12 }}>
                A peça conta no dia em que o último cupom dela é apontado; o pijama, quando a parte de cima e a de
                baixo ficam prontas.
              </p>
              <GraficoPecas dias={pecas?.porDia ?? []} carregando={carregando} />
            </section>
          </div>

          <section className="bloco" aria-busy={carregando}>
            <div className="bloco-cabecalho" style={{ alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <h2>Comparativo por costureira</h2>
                <p className="bloco-descricao">
                  Entre {formatarData(inicio)} e {formatarData(fim)}
                  {tabela.filtrando ? ", costureiras filtradas" : ""}. A diferença entre as duas barras é o peso das
                  ausências. Passe o mouse numa costureira para ver os valores.
                </p>
              </div>
              <div className="ordem-grafico">
                Ordenar por
                <div className="periodo-fichas" role="group" aria-label="Ordenar o gráfico por">
                  {(
                    [
                      ["eficiencia", "Eficiência"],
                      ["produtividade", "Produtividade"],
                    ] as [Ordem, string][]
                  ).map(([id, rotulo]) => (
                    <button key={id} type="button" className="ficha" aria-pressed={ordemBarras === id} onClick={() => setOrdemBarras(id)}>
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="legenda" style={{ marginBottom: 8 }}>
              <span>
                <i className="legenda-ef" /> Eficiência
              </span>
              <span>
                <i className="legenda-prod" /> Produtividade
              </span>
            </div>
            <GraficoCostureiras barras={visiveis.filter((l) => l.previsto > 0)} ordem={ordemBarras} carregando={carregando} />
          </section>
        </>
      )}

      <section className="bloco" aria-busy={carregando}>
        <div className="bloco-cabecalho">
          <div>
            <h2>Por costureira</h2>
            <p className="bloco-descricao">
              Clique numa linha para ver o dia a dia. Todas as barras usam a mesma régua; o traço marca 100%.
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
                      <td className="forte quebra">
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
                      <td className="direita">{formatarMinutos(l.previsto)}</td>
                      <td className="direita" style={{ color: l.ausencias > 0 ? "var(--erro)" : "var(--tinta-3)" }}>
                        {l.ausencias > 0 ? formatarMinutos(l.ausencias) : "—"}
                      </td>
                      <td className="direita">{formatarMinutos(l.produzido)}</td>
                      <td className="direita">{l.operacoes}</td>
                      <td>
                        <BarraEficiencia ef={l.eficiencia} />
                      </td>
                      <td>
                        <BarraEficiencia ef={l.produtividade} rotulo="Produtividade" />
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="detalhe">
                        <td colSpan={8} style={{ padding: "8px 20px 16px" }}>
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
                  <td className="direita">{formatarMinutos(totalPrev)}</td>
                  <td className="direita">{totalAus > 0 ? formatarMinutos(totalAus) : "—"}</td>
                  <td className="direita">{formatarMinutos(totalProd)}</td>
                  <td className="direita">{totalCupons}</td>
                  <td>
                    <BarraEficiencia ef={efPeriodo} />
                  </td>
                  <td>
                    <BarraEficiencia ef={prodPeriodo} rotulo="Produtividade" />
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

function Indicador({ rotulo, dica, valor, classe }: { rotulo: string; dica: string; valor: number | null; classe: string }) {
  const texto = situacao(valor);
  const Icone = valor !== null && valor >= 0.85 ? CheckCircle2 : AlertTriangle;
  return (
    <div className="indicador" title={dica}>
      <span className="indicador-rotulo legenda">
        <i className={classe} />
        {rotulo}
      </span>
      <div className="numero-heroi">{pct(valor)}</div>
      {texto && (
        <span className="situacao" style={{ color: corEficiencia(valor) }}>
          <Icone size={14} aria-hidden />
          {texto}
        </span>
      )}
    </div>
  );
}

function DetalheDias({ dias }: { dias: Dia[] }) {
  const tabela = useTabela<Dia>(dias, [
    { id: "data", titulo: "Dia", valor: (d) => d.data, texto: (d) => `${formatarData(d.data)} ${DIAS_SEMANA[diaSemana(d.data)]}` },
    { id: "jornada", titulo: "Jornada", alinhar: "right", valor: (d) => d.jornada },
    { id: "ocorrencias", titulo: "Ocorrências", alinhar: "right", valor: (d) => d.ocorrencias },
    { id: "disponivel", titulo: "Disponível", alinhar: "right", valor: (d) => d.disponivel },
    { id: "produzido", titulo: "Produzido", alinhar: "right", valor: (d) => d.produzido, texto: (d) => minutos(d.produzido) },
    { id: "cupons", titulo: "Cupons", alinhar: "right", valor: (d) => d.operacoes },
    {
      id: "eficiencia",
      titulo: <span title={DICA_EFICIENCIA}>Eficiência</span>,
      largura: "20%",
      valor: (d) => emPct(razao(d.produzido, d.disponivel)),
      texto: (d) => (d.disponivel > 0 ? pct(razao(d.produzido, d.disponivel)) : "produção sem jornada"),
    },
    {
      id: "produtividade",
      titulo: <span title={DICA_PRODUTIVIDADE}>Produtividade</span>,
      largura: "20%",
      valor: (d) => emPct(razao(d.produzido, d.previsto)),
      texto: (d) => pct(razao(d.produzido, d.previsto)),
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
                  <BarraEficiencia ef={razao(d.produzido, d.disponivel)} />
                ) : d.produzido > 0 ? (
                  <span style={{ color: "var(--alerta)", fontSize: 12.5 }}>Produção num dia sem jornada</span>
                ) : (
                  <span className="fraco">—</span>
                )}
              </td>
              <td>
                {d.previsto > 0 ? (
                  <BarraEficiencia ef={razao(d.produzido, d.previsto)} rotulo="Produtividade" />
                ) : (
                  <span className="fraco">—</span>
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
