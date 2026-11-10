"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProducaoLayout, { api, mensagemErro, ui } from "@/components/Layout";
import { useTabela } from "@/components/Tabela";
import {
  Costureira,
  NOME_PARTE,
  Parte,
  codigoBarras,
  corEficiencia,
  formatarMinutos,
  hojeISO,
} from "@/lib/producao";

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
type Aviso = { tipo: "ok" | "erro"; texto: string };

// Bipe curto para o operador saber o resultado sem olhar a tela
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

export default function ApontamentoPage() {
  const [costureiras, setCostureiras] = useState<Costureira[]>([]);
  const [costureiraId, setCostureiraId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [codigo, setCodigo] = useState("");
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ costureiras: Costureira[] }>("/api/costureiras")
      .then((r) => setCostureiras(r.costureiras.filter((c) => c.ativa)))
      .catch((e) => setAviso({ tipo: "erro", texto: mensagemErro(e) }));
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
      setAviso({ tipo: "erro", texto: mensagemErro(e) });
    }
  }, [costureiraId, data]);

  useEffect(() => {
    carregar();
    campo.current?.focus();
  }, [carregar]);

  async function apontar(e: React.FormEvent) {
    e.preventDefault();
    const valor = codigo.trim();
    if (!valor || enviando) return;
    setCodigo("");
    if (!costureiraId) {
      bipe(false);
      setAviso({ tipo: "erro", texto: "Selecione a costureira antes de escanear." });
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
      setAviso({
        tipo: "ok",
        texto: `✓ ${a.nome_operacao} — OP ${a.ticket.op} · Tam ${a.ticket.tamanho ?? "—"} · ${a.quantidade} pç · ${a.minutos_total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min`,
      });
      await carregar();
    } catch (err) {
      bipe(false);
      setAviso({ tipo: "erro", texto: mensagemErro(err) });
    } finally {
      setEnviando(false);
      campo.current?.focus();
    }
  }

  async function desfazer(a: Apontamento) {
    if (!confirm(`Desfazer o apontamento de "${a.nome_operacao}" (OP ${a.ticket.op})?`)) return;
    try {
      await api(`/api/apontamentos?id=${a.id}`, { method: "DELETE" });
      setAviso({ tipo: "ok", texto: `Apontamento de "${a.nome_operacao}" desfeito.` });
      await carregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemErro(e) });
    } finally {
      campo.current?.focus();
    }
  }

  const produzido = apontamentos.reduce((s, a) => s + a.minutos_total, 0);
  const pecas = apontamentos.reduce((s, a) => s + a.quantidade, 0);
  const eficiencia = resumo && resumo.disponivel > 0 ? produzido / resumo.disponivel : null;
  const tabela = useTabela<Apontamento>(apontamentos, [
    { id: "codigo", titulo: "Código", valor: (a) => codigoBarras(a.id) },
    { id: "op", titulo: "OP", valor: (a) => a.ticket.op },
    {
      id: "ref",
      titulo: "Ref / Cor / Tam",
      valor: (a) => a.ticket.referencia,
      texto: (a) => `${a.ticket.referencia} ${a.ticket.cor ?? ""} ${a.ticket.tamanho ?? ""}`,
    },
    {
      id: "operacao",
      titulo: "Operação",
      valor: (a) => a.nome_operacao,
      texto: (a) => `${a.nome_operacao} ${NOME_PARTE[a.parte]} ${a.maquina ?? ""}`,
    },
    { id: "qtd", titulo: "Qtd", alinhar: "right", valor: (a) => a.quantidade },
    {
      id: "minutos",
      titulo: "Minutos",
      alinhar: "right",
      valor: (a) => a.minutos_total,
      texto: (a) => a.minutos_total.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
    },
    { id: "acoes", titulo: "", alinhar: "right" },
  ]);

  return (
    <ProducaoLayout titulo="Apontamento de Produção" subtitulo="Escaneie os tickets que a costureira entregou">
      <section style={{ ...ui.secao, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }} className="grade-apont">
        <label style={ui.campo}>
          <span style={ui.label}>Costureira</span>
          <select
            style={{ ...ui.input, fontSize: 17, padding: "10px 12px", fontWeight: 700 }}
            value={costureiraId}
            onChange={(e) => {
              setCostureiraId(e.target.value);
              setAviso(null);
            }}
          >
            <option value="">Selecione…</option>
            {costureiras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.setor ? ` — ${c.setor}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.campo}>
          <span style={ui.label}>Data da produção</span>
          <input
            type="date"
            style={{ ...ui.input, fontSize: 17, padding: "9px 12px" }}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
        <form onSubmit={apontar} style={{ gridColumn: "1 / -1" }}>
          <span style={ui.label}>Código de barras</span>
          <input
            ref={campo}
            style={{
              ...ui.input,
              fontSize: 26,
              padding: "14px 16px",
              fontFamily: "monospace",
              letterSpacing: 2,
              marginTop: 4,
              borderWidth: 2,
              borderColor: costureiraId ? "#818cf8" : "#d1d5db",
            }}
            placeholder={costureiraId ? "Escaneie o ticket…" : "Selecione a costureira primeiro"}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            disabled={!costureiraId}
            autoComplete="off"
            inputMode="numeric"
          />
        </form>
        {aviso && (
          <div
            style={{
              gridColumn: "1 / -1",
              ...(aviso.tipo === "ok" ? ui.sucessoBox : ui.erroBox),
              marginBottom: 0,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {aviso.texto}
          </div>
        )}
      </section>

      {costureiraId && (
        <>
          <div style={cartoes}>
            <Cartao rotulo="Tempo produzido" valor={formatarMinutos(produzido)} detalhe={`${Math.round(produzido)} min`} />
            <Cartao
              rotulo="Tempo disponível"
              valor={resumo ? formatarMinutos(resumo.disponivel) : "—"}
              detalhe={resumo ? `${resumo.disponivel} min` : ""}
            />
            <Cartao
              rotulo="Eficiência do dia"
              valor={eficiencia === null ? "—" : `${(eficiencia * 100).toFixed(1)}%`}
              cor={corEficiencia(eficiencia)}
              detalhe={resumo && resumo.disponivel === 0 ? "dia sem jornada" : ""}
            />
            <Cartao rotulo="Tickets / peças" valor={`${apontamentos.length}`} detalhe={`${pecas} peças-operação`} />
          </div>

          <section style={ui.secao}>
            <h2 style={ui.secaoTitulo}>Operações apontadas no dia</h2>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={ui.tabela}>
                {tabela.thead}
                <tbody>
                  {tabela.visiveis.map((a) => (
                    <tr key={a.id}>
                      <td style={{ ...ui.td, fontFamily: "monospace", color: "#6b7280" }}>{codigoBarras(a.id)}</td>
                      <td style={{ ...ui.td, fontWeight: 700 }}>{a.ticket.op}</td>
                      <td style={ui.td}>
                        {a.ticket.referencia} · {a.ticket.cor ?? "—"} · {a.ticket.tamanho ?? "—"}
                      </td>
                      <td style={ui.td}>
                        <b>{a.nome_operacao}</b>
                        <div style={{ fontSize: 11.5, color: "#6b7280" }}>
                          {NOME_PARTE[a.parte]} · {a.ordem}º · {a.maquina ?? "—"}
                        </div>
                      </td>
                      <td style={{ ...ui.td, textAlign: "right" }}>{a.quantidade}</td>
                      <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>
                        {a.minutos_total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </td>
                      <td style={{ ...ui.td, textAlign: "right" }}>
                        <button style={ui.botaoPerigo} onClick={() => desfazer(a)}>
                          Desfazer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tabela.rodape}
              {apontamentos.length === 0 && <p style={ui.vazio}>Nenhum ticket apontado para essa costureira nesse dia.</p>}
            </div>
          </section>
        </>
      )}
      <style>{`@media (max-width: 640px) { .grade-apont { grid-template-columns: 1fr !important; } }`}</style>
    </ProducaoLayout>
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

const cartoes: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 14,
  marginBottom: 20,
};
