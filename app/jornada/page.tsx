"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardPaste, Copy, Plus, Search, Trash2, X } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import { TituloRecolhivel } from "@/components/Recolhivel";
import {
  Costureira,
  DIAS_SEMANA,
  HorariosSemana,
  Jornada,
  Ocorrencia,
  diaSemana,
  formatarData,
  formatarMinutos,
  hojeISO,
  minutosDosPeriodos,
  minutosJornada,
  problemaHorarios,
} from "@/lib/producao";

type FormOcorrencia = {
  data: string;
  costureiras: number[]; // vazio = fábrica toda
  diaInteiro: boolean; // minutos = a jornada do dia de cada costureira
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
    costureiras: [],
    diaInteiro: false,
    sentido: "reduzir",
    minutos: "",
    descricao: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  // fechada por padrão, para ninguém mudar a jornada sem querer
  const [jornadaAberta, setJornadaAberta] = useState(false);
  // horários sendo editados; os minutos salvos (jornada) só mudam ao salvar
  const [horarios, setHorarios] = useState<HorariosSemana>({});
  const [semHorarios, setSemHorarios] = useState<Record<string, boolean>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [j, c] = await Promise.all([
          api<{ jornada: Jornada; horarios?: Record<string, HorariosSemana[string] | null> }>("/api/jornada"),
          api<{ costureiras: Costureira[] }>("/api/costureiras"),
        ]);
        setJornada(j.jornada);
        const h: HorariosSemana = {};
        const sem: Record<string, boolean> = {};
        for (let d = 0; d < 7; d++) {
          const salvos = j.horarios?.[String(d)];
          h[String(d)] = salvos ?? [];
          // dia com minutos mas ainda sem horários cadastrados
          sem[String(d)] = !salvos && (j.jornada[String(d)] ?? 0) > 0;
        }
        setHorarios(h);
        setSemHorarios(sem);
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
    // um dia que tem minutos mas ainda não tem horários ficaria zerado ao salvar
    const faltando = [1, 2, 3, 4, 5, 6, 0].filter((d) => semHorarios[String(d)]).map((d) => DIAS_SEMANA[d]);
    if (faltando.length) {
      setErro(`Cadastre os horários de ${faltando.join(", ")} antes de salvar (sem horários, o dia ficaria com 0 minutos).`);
      return;
    }
    for (let d = 0; d < 7; d++) {
      const problema = problemaHorarios(horarios[String(d)] ?? []);
      if (problema) {
        setErro(`${DIAS_SEMANA[d]}: ${problema}`);
        return;
      }
    }
    try {
      await api("/api/jornada", { method: "POST", body: JSON.stringify({ horarios }) });
      const novos: Jornada = {};
      for (let d = 0; d < 7; d++) novos[String(d)] = minutosDosPeriodos(horarios[String(d)] ?? []);
      setJornada(novos);
      setSemHorarios({});
      setCopiado(null);
      setSucesso("Jornada padrão salva. Vale para todas as costureiras sem jornada própria.");
      setTimeout(() => setSucesso(null), 4000);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  // Minutos da jornada do dia escolhido para cada costureira marcada (ou a padrão, para a fábrica toda)
  const escolhidas = costureiras.filter((c) => form.costureiras.includes(c.id));
  const jornadaDe = (c: Costureira) => (form.data ? minutosJornada(c, jornada, form.data) : 0);
  const jornadasDoDia = escolhidas.length
    ? escolhidas.map(jornadaDe)
    : [form.data ? Number(jornada[String(diaSemana(form.data))] ?? 0) : 0];
  const jornadaDoDia = Math.max(...jornadasDoDia);
  const jornadaVaria = new Set(jornadasDoDia).size > 1;

  async function salvarOcorrencia(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const sinal = form.sentido === "reduzir" ? -1 : 1;
    const minutos = Math.abs(form.diaInteiro ? jornadaDoDia : Number(form.minutos)) * sinal;
    // "dia inteiro": cada costureira perde a jornada dela naquele dia
    if (form.diaInteiro && escolhidas.some((c) => jornadaDe(c) === 0)) {
      const sem = escolhidas.filter((c) => jornadaDe(c) === 0).map((c) => c.nome);
      setErro(`Sem jornada neste dia: ${sem.join(", ")}. Desmarque ${sem.length === 1 ? "essa costureira" : "essas costureiras"}.`);
      return;
    }
    const minutosPorCostureira = form.diaInteiro
      ? Object.fromEntries(escolhidas.map((c) => [c.id, jornadaDe(c) * sinal]))
      : undefined;
    try {
      const r = await api<{ criadas: number }>("/api/ocorrencias", {
        method: "POST",
        body: JSON.stringify({
          data: form.data,
          costureira_ids: form.costureiras,
          minutos,
          minutos_por_costureira: minutosPorCostureira,
          descricao: form.descricao,
        }),
      });
      setForm({ ...form, minutos: "", descricao: "", diaInteiro: false, costureiras: [] });
      setSucesso(r.criadas > 1 ? `${r.criadas} ocorrências registradas, uma para cada costureira.` : "Ocorrência registrada.");
      setTimeout(() => setSucesso(null), 4000);
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
  const totalEditado = Array.from({ length: 7 }, (_, d) =>
    semHorarios[String(d)] ? jornada[String(d)] ?? 0 : minutosDosPeriodos(horarios[String(d)] ?? [])
  ).reduce((a, b) => a + b, 0);

  function mudarPeriodos(dia: string, periodos: HorariosSemana[string]) {
    setHorarios((h) => ({ ...h, [dia]: periodos }));
    setSemHorarios((s) => ({ ...s, [dia]: false }));
  }
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
        <div className="bloco-cabecalho" style={jornadaAberta ? undefined : { marginBottom: 0 }}>
          <div>
            <TituloRecolhivel aberto={jornadaAberta} onAlternar={() => setJornadaAberta((v) => !v)}>
              Jornada padrão
            </TituloRecolhivel>
            <p className="bloco-descricao" style={{ marginTop: 6 }}>
              {jornadaAberta ? "Horários de trabalho de cada dia; os minutos são calculados. " : ""}Total:{" "}
              <span className="num">{formatarMinutos(jornadaAberta ? totalEditado : totalSemana)}</span> por semana
              {jornadaAberta ? "." : " · clique no título para ver ou alterar."}
            </p>
          </div>
          {jornadaAberta && (
            <button type="submit" className="botao botao-primario">
              Salvar jornada
            </button>
          )}
        </div>
        {jornadaAberta && (
          <div className="horarios">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const dia = String(d);
              const periodos = horarios[dia] ?? [];
              const minutos = minutosDosPeriodos(periodos);
              const problema = problemaHorarios(periodos);
              const ultimoFim = periodos[periodos.length - 1]?.[1];
              return (
                <div key={d} className="horario-dia">
                  <div className="horario-nome">{DIAS_SEMANA[d]}</div>
                  <div className="horario-periodos">
                    {periodos.length === 0 && (
                      <span className="fraco horario-folga">
                        {semHorarios[dia]
                          ? `Sem horários cadastrados (hoje vale ${jornada[dia]} min)`
                          : "Folga"}
                      </span>
                    )}
                    {periodos.map(([ini, fim], i) => (
                      <span key={i} className="horario-periodo">
                        <input
                          type="time"
                          className="entrada num"
                          aria-label={`${DIAS_SEMANA[d]}, início do período ${i + 1}`}
                          value={ini}
                          onChange={(e) =>
                            mudarPeriodos(dia, periodos.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))
                          }
                        />
                        <span className="fraco">às</span>
                        <input
                          type="time"
                          className="entrada num"
                          aria-label={`${DIAS_SEMANA[d]}, fim do período ${i + 1}`}
                          value={fim}
                          onChange={(e) =>
                            mudarPeriodos(dia, periodos.map((p, j) => (j === i ? [p[0], e.target.value] : p)))
                          }
                        />
                        <button
                          type="button"
                          className="botao botao-pequeno botao-icone botao-fantasma"
                          aria-label={`Tirar o período ${ini} às ${fim}`}
                          title="Tirar período"
                          onClick={() => mudarPeriodos(dia, periodos.filter((_, j) => j !== i))}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="botao botao-pequeno botao-fantasma"
                      onClick={() => mudarPeriodos(dia, [...periodos, [ultimoFim ?? "07:30", ""]])}
                    >
                      <Plus size={14} aria-hidden />
                      Período
                    </button>
                    {problema && <span className="horario-erro">{problema}</span>}
                  </div>
                  <div className="horario-total">
                    <strong className="num">{formatarMinutos(semHorarios[dia] ? jornada[dia] ?? 0 : minutos)}</strong>
                    <span className="fraco num">{semHorarios[dia] ? jornada[dia] ?? 0 : minutos} min</span>
                  </div>
                  <div className="horario-copiar">
                    {copiado === null ? (
                      periodos.length > 0 && (
                        <button type="button" className="botao botao-pequeno botao-fantasma" onClick={() => setCopiado(dia)} title="Copiar estes horários para outros dias">
                          <Copy size={14} aria-hidden />
                          Copiar
                        </button>
                      )
                    ) : copiado === dia ? (
                      <button type="button" className="botao botao-pequeno botao-contorno" onClick={() => setCopiado(null)}>
                        Pronto
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="botao botao-pequeno botao-fantasma"
                        onClick={() => mudarPeriodos(dia, (horarios[copiado] ?? []).map((p) => [p[0], p[1]]))}
                        title={`Colar os horários de ${DIAS_SEMANA[Number(copiado)]}`}
                      >
                        <ClipboardPaste size={14} aria-hidden />
                        Colar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          <div className="campo">
            <span id="rotulo-costureiras">Costureiras</span>
            <SeletorCostureiras
              costureiras={costureiras.filter((c) => c.ativa)}
              marcadas={form.costureiras}
              onMudar={(ids) => setForm((f) => ({ ...f, costureiras: ids }))}
            />
          </div>
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
              value={form.diaInteiro ? (jornadaVaria ? "" : String(jornadaDoDia)) : form.minutos}
              placeholder={form.diaInteiro && jornadaVaria ? "jornada de cada uma" : undefined}
              onChange={(e) => setForm({ ...form, minutos: e.target.value, diaInteiro: false })}
            />
            <small>
              {jornadaVaria ? (
                <>A jornada do dia varia entre elas</>
              ) : (
                <>
                  Jornada do dia: <span className="num">{jornadaDoDia}</span> min
                </>
              )}
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
                        diaInteiro: true,
                        descricao: form.descricao || (form.costureiras.length ? "Falta" : "Sem expediente"),
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
          {form.costureiras.length > 1 ? `Registrar para ${form.costureiras.length} costureiras` : "Registrar ocorrência"}
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


// Campo para marcar uma, várias ou nenhuma costureira (nenhuma = a fábrica toda).
// Abre uma lista com busca; cada costureira marcada recebe a sua própria ocorrência.
function SeletorCostureiras({
  costureiras,
  marcadas,
  onMudar,
}: {
  costureiras: Costureira[];
  marcadas: number[];
  onMudar: (ids: number[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    campoBusca.current?.focus();
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = costureiras.filter((c) => normal(c.nome).includes(normal(busca.trim())));
  const nomes = costureiras.filter((c) => marcadas.includes(c.id)).map((c) => c.nome);
  const resumo =
    nomes.length === 0 ? "Fábrica toda (todas as costureiras)" : nomes.length <= 2 ? nomes.join(", ") : `${nomes.length} costureiras`;

  function alternar(id: number) {
    onMudar(marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]);
  }

  return (
    <div className="seletor" ref={caixa}>
      <button
        type="button"
        className="entrada seletor-botao"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-labelledby="rotulo-costureiras"
        title={nomes.join(", ") || undefined}
        onClick={() => setAberto((v) => !v)}
      >
        <span className={nomes.length ? undefined : "fraco"}>{resumo}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {aberto && (
        <div className="seletor-painel">
          <label className="seletor-busca">
            <Search size={15} aria-hidden />
            <input ref={campoBusca} placeholder="Buscar costureira" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <ul role="listbox" aria-multiselectable="true" aria-labelledby="rotulo-costureiras">
            <li role="option" aria-selected={marcadas.length === 0}>
              <button type="button" className="seletor-opcao" data-marcada={marcadas.length === 0} onClick={() => onMudar([])}>
                <span className="seletor-caixa seletor-radio">{marcadas.length === 0 && <Check size={13} aria-hidden />}</span>
                <span>
                  Fábrica toda <span className="fraco">· falta de luz, sem expediente</span>
                </span>
              </button>
            </li>
            <li className="seletor-separador" aria-hidden />
            {lista.map((c) => {
              const marcada = marcadas.includes(c.id);
              return (
                <li key={c.id} role="option" aria-selected={marcada}>
                  <button type="button" className="seletor-opcao" data-marcada={marcada} onClick={() => alternar(c.id)}>
                    <span className="seletor-caixa">{marcada && <Check size={13} aria-hidden />}</span>
                    {c.nome}
                  </button>
                </li>
              );
            })}
            {lista.length === 0 && <li className="fraco seletor-vazio">Nenhuma costureira encontrada.</li>}
          </ul>
          <div className="seletor-rodape">
            <span className="fraco">
              {marcadas.length ? `${marcadas.length} marcada${marcadas.length > 1 ? "s" : ""}` : "Nenhuma marcada"}
            </span>
            <button type="button" className="botao botao-pequeno botao-contorno" onClick={() => setAberto(false)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
