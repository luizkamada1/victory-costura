"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode, Undo2 } from "lucide-react";
import ProducaoLayout, { Aviso, api, mensagemErro } from "@/components/Layout";
import { FaixaJornada } from "@/components/Medidas";
import { useTabela } from "@/components/Tabela";
import { Costureira, NOME_PARTE, Parte, codigoBarras, hojeISO } from "@/lib/producao";

type Apontamento = {
  id: number;
  nome_operacao: string;
  maquina: string | null;
  parte: Parte;
  ordem: number;
  quantidade: number;
  minutos_total: number;
  apontado_em: string;
  ticket: { op: string; referencia: string; nome_item: string | null; cor: string | null; tamanho: string | null };
};

type Resumo = { disponivel: number; produzido: number; eficiencia: number | null };
type Retorno = { tipo: "ok" | "erro"; texto: string };

// Bipe curto para a líder saber o resultado sem olhar a tela
function bipe(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 220;
    osc.type = ok ? "sine" : "square";
    ganho.gain.value = 0.15;
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.45));
    osc.onended = () => ctx.close();
  } catch {
    // sem som disponível
  }
}

const minutos = (m: number) => m.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function ApontamentoPage() {
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [costureiraId, setCostureiraId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [codigo, setCodigo] = useState("");
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [novaId, setNovaId] = useState<number | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ costureiras: Costureira[] }>("/api/costureiras")
      .then((r) => setCostureiras(r.costureiras.filter((c) => c.ativa)))
      .catch((e) => setRetorno({ tipo: "erro", texto: mensagemErro(e) }));
  }, []);

  const carregar = useCallback(async () => {
    if (!costureiraId || !data) {
      setApontamentos([]);
      setResumo(null);
      return;
    }
    try {
      const [a, ef] = await Promise.all([
        api<{ apontamentos: Apontamento[] }>(`/api/apontamentos?costureira_id=${costureiraId}&data=${data}`),
        api<{ costureiras: (Resumo & { id: number })[] }>(`/api/eficiencia?inicio=${data}&fim=${data}`),
      ]);
      setApontamentos(a.apontamentos);
      setResumo(ef.costureiras.find((c) => String(c.id) === costureiraId) ?? null);
    } catch (e) {
      setRetorno({ tipo: "erro", texto: mensagemErro(e) });
    }
  }, [costureiraId, data]);

  useEffect(() => {
    carregar();
    setNovaId(null);
    campo.current?.focus();
  }, [carregar]);

  async function apontar(e: React.FormEvent) {
    e.preventDefault();
    const valor = codigo.trim();
    if (!valor || enviando) return;
    setCodigo("");
    if (!costureiraId) {
      bipe(false);
      setRetorno({ tipo: "erro", texto: "Escolha a costureira antes de escanear." });
      return;
    }
    setEnviando(true);
    try {
      const r = await api<{ apontamento: Apontamento }>("/api/apontamentos", {
        method: "POST",
        body: JSON.stringify({ codigo: valor, costureira_id: Number(costureiraId), data }),
      });
      const a = r.apontamento;
      bipe(true);
      setNovaId(a.id);
      setRetorno({
        tipo: "ok",
        texto: `${a.nome_operacao} · OP ${a.ticket.op} · Tam ${a.ticket.tamanho ?? "—"} · ${a.quantidade} peças · ${minutos(a.minutos_total)} min`,
      });
      await carregar();
    } catch (err) {
      bipe(false);
      setRetorno({ tipo: "erro", texto: mensagemErro(err) });
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  async function desfazer(a: Apontamento) {
    if (!confirm(`Desfazer o apontamento de "${a.nome_operacao}" (OP ${a.ticket.op})? O cupom volta a ficar pendente.`))
      return;
    try {
      await api(`/api/apontamentos?id=${a.id}`, { method: "DELETE" });
      setRetorno({ tipo: "ok", texto: `Apontamento de "${a.nome_operacao}" desfeito. O cupom pode ser escaneado de novo.` });
      await carregar();
    } catch (e) {
      setRetorno({ tipo: "erro", texto: mensagemErro(e) });
    } finally {
      campo.current?.focus();
    }
  }

  const tabela = useTabela<Apontamento>(apontamentos, [
    { id: "codigo", titulo: "Código", valor: (a) => codigoBarras(a.id) },
    { id: "op", titulo: "OP", valor: (a) => a.ticket.op },
    {
      id: "ref",
      titulo: "Ref · Cor · Tam",
      valor: (a) => a.ticket.referencia,
      texto: (a) => `${a.ticket.referencia} ${a.ticket.cor ?? ""} ${a.ticket.tamanho ?? ""}`,
    },
    {
      id: "operacao",
      titulo: "Operação",
      valor: (a) => a.nome_operacao,
      texto: (a) => `${a.nome_operacao} ${NOME_PARTE[a.parte]} ${a.maquina ?? ""}`,
    },
    { id: "qtd", titulo: "Peças", alinhar: "right", valor: (a) => a.quantidade },
    { id: "minutos", titulo: "Minutos", alinhar: "right", valor: (a) => a.minutos_total, texto: (a) => minutos(a.minutos_total) },
    { id: "acoes", titulo: "", alinhar: "right", ordenavel: false, filtravel: false },
  ]);

  const costureira = costureiras.find((c) => String(c.id) === costureiraId);
  // a faixa cresce na ordem em que os cupons foram lidos
  const nervuras = [...apontamentos]
    .sort((a, b) => a.apontado_em.localeCompare(b.apontado_em))
    .map((a) => ({
      id: a.id,
      minutos: a.minutos_total,
      rotulo: `${a.nome_operacao} · OP ${a.ticket.op} · ${minutos(a.minutos_total)} min`,
    }));

  return (
    <ProducaoLayout titulo="Apontamento" subtitulo="Escaneie os cupons que a costureira entregou no fim do dia.">
      <section className="bloco">
        <div className="campos grade-leitor">
          <label className="campo">
            <span>Costureira</span>
            <select
              className="entrada"
              value={costureiraId}
              onChange={(e) => {
                setCostureiraId(e.target.value);
                setRetorno(null);
              }}
            >
              <option value="">Escolha quem entregou os cupons</option>
              {costureiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.setor ? ` · ${c.setor}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Dia da produção</span>
            <input type="date" className="entrada" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <form onSubmit={apontar} className="campo leitor">
            <label htmlFor="codigo-cupom">Código do cupom</label>
            <div className="leitor-caixa">
              <ScanBarcode size={22} aria-hidden />
              <input
                ref={campo}
                id="codigo-cupom"
                className="entrada codigo"
                placeholder={costureiraId ? "Escaneie ou digite os 8 números" : "Escolha a costureira primeiro"}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                disabled={!costureiraId}
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
          </form>
        </div>
        {retorno && (
          <div style={{ marginTop: 14 }}>
            <Aviso tipo={retorno.tipo}>
              <strong>{retorno.tipo === "ok" ? "Cupom apontado" : "Cupom não apontado"}</strong>
              <div>{retorno.texto}</div>
            </Aviso>
          </div>
        )}
      </section>

      {costureira ? (
        <>
          <section className="bloco">
            <div className="bloco-cabecalho">
              <h2>Jornada de {costureira.nome}</h2>
            </div>
            <FaixaJornada nervuras={nervuras} disponivel={resumo?.disponivel ?? 0} novaId={novaId} />
          </section>

          <section className="bloco">
            <div className="bloco-cabecalho">
              <h2>
                Cupons do dia<span className="contagem">{apontamentos.length}</span>
              </h2>
            </div>
            {apontamentos.length === 0 ? (
              <div className="vazio">
                <strong>Nenhum cupom apontado neste dia</strong>
                Escaneie o primeiro cupom. Cada um aparece aqui e soma uma nervura na faixa da jornada.
              </div>
            ) : (
              <div className="tabela-caixa">
                <table className="tabela">
                  {tabela.thead}
                  <tbody>
                    {tabela.visiveis.map((a) => (
                      <tr key={a.id} data-selecionada={a.id === novaId}>
                        <td className="codigo fraco">{codigoBarras(a.id)}</td>
                        <td className="forte">{a.ticket.op}</td>
                        <td>
                          {a.ticket.referencia} · {a.ticket.cor ?? "—"} · {a.ticket.tamanho ?? "—"}
                        </td>
                        <td>
                          <div className="forte">{a.nome_operacao}</div>
                          <div className="fraco" style={{ fontSize: 12 }}>
                            {NOME_PARTE[a.parte]} · {a.ordem}ª operação · {a.maquina ?? "sem máquina"}
                          </div>
                        </td>
                        <td className="direita">{a.quantidade}</td>
                        <td className="direita forte">{minutos(a.minutos_total)}</td>
                        <td className="direita">
                          <button type="button" className="botao botao-pequeno botao-fantasma" onClick={() => desfazer(a)}>
                            <Undo2 size={14} aria-hidden />
                            Desfazer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tabela.rodape}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="bloco">
          <div className="vazio">
            <strong>Escolha a costureira para começar</strong>
            Depois é só escanear os cupons, um atrás do outro. O sistema avisa com um bipe se algo der errado.
          </div>
        </section>
      )}
    </ProducaoLayout>
  );
}
