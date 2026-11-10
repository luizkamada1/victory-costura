"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";
import { ArrowLeft, Printer } from "lucide-react";
import { api, mensagemErro } from "@/components/Layout";
import { NOME_PARTE, PARTES, Ticket, TicketOperacao, codigoBarras, formatarData } from "@/lib/producao";

function CodigoDeBarras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      // Code 128C: os 8 dígitos viram 4 pares, então o código fica com metade da largura
      // e cabe na meia folha; os leitores USB comuns leem igual ao Code 128 normal.
      JsBarcode(ref.current, valor, {
        format: valor.length % 2 === 0 ? "CODE128C" : "CODE128",
        width: 2,
        height: 46,
        margin: 0,
        fontSize: 14,
        textMargin: 2,
        font: "monospace",
      });
    }
  }, [valor]);
  return <svg ref={ref} />;
}

function Cupom({ t, o }: { t: Ticket; o: TicketOperacao }) {
  return (
    <div className="cupom">
      <div className="cupom-ordem">{o.ordem}ª</div>
      <div className="cupom-info">
        <div className="cupom-nome">{o.nome_operacao}</div>
        <div className="cupom-maquina">Máquina: {o.maquina ?? "—"}</div>
        <div className="cupom-ref">
          OP <b>{t.op}</b> · Ref <b>{t.referencia}</b> · {t.cor ?? "—"} · Tam <b>{t.tamanho ?? "—"}</b> · Qtd{" "}
          <b>{t.quantidade}</b>
        </div>
      </div>
      <div className="cupom-codigo">
        <CodigoDeBarras valor={codigoBarras(o.id)} />
      </div>
    </div>
  );
}

// Linha 1: campos curtos (OP até 6, referência 5, tamanho 2, quantidade 4 caracteres).
// Linha 2: a cor, que pode ser longa, e o número do ticket.
function Cabecalho({ t }: { t: Ticket }) {
  return (
    <div className="cabecalho">
      <div className="cab-campo">
        <span>OP</span>
        <b>{t.op}</b>
      </div>
      <div className="cab-campo">
        <span>Ref.</span>
        <b>{t.referencia}</b>
      </div>
      <div className="cab-campo">
        <span>Tam.</span>
        <b>{t.tamanho ?? "—"}</b>
      </div>
      <div className="cab-campo">
        <span>Qtd.</span>
        <b>{t.quantidade}</b>
      </div>
      <div className="cab-campo cab-cor">
        <span>Cor</span>
        <b>{t.cor ?? "—"}</b>
      </div>
      <div className="cab-campo cab-id">
        <span>Ticket</span>
        <b>
          #{t.id} <small>{formatarData(t.created_at)}</small>
        </b>
      </div>
    </div>
  );
}

function Tickets() {
  const params = useSearchParams();
  const ids = params.get("ids") ?? "";
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<{ tickets: Ticket[] }>(`/api/tickets?ids=${encodeURIComponent(ids)}`)
      .then((r) => setTickets(r.tickets))
      .catch((e) => setErro(mensagemErro(e)));
  }, [ids]);

  if (erro) return <p style={{ padding: 24, color: "var(--erro)" }}>Não foi possível abrir os tickets: {erro}</p>;
  if (!tickets) return <p style={{ padding: 24 }}>Carregando os tickets…</p>;

  return (
    <>
      <div className="barra-impressao nao-imprimir">
        <span className="num">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} ·{" "}
          {tickets.reduce((s, t) => s + t.operacoes.length, 0)} cupons
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/tickets" className="botao botao-secundario">
            <ArrowLeft size={16} aria-hidden />
            Voltar
          </a>
          <button type="button" onClick={() => window.print()} className="botao botao-primario">
            <Printer size={16} aria-hidden />
            Imprimir
          </button>
        </div>
      </div>

      {tickets.map((t) => {
        const partes = PARTES.filter((p) => t.operacoes.some((o) => o.parte === p));
        return (
          <div key={t.id} className="ticket" style={{ gridTemplateColumns: `repeat(${partes.length}, 1fr)` }}>
            {partes.map((p) => (
              <div key={p} className="parte">
                <Cabecalho t={t} />
                <div className="parte-titulo">{NOME_PARTE[p]}</div>
                {/* ordem invertida: a 1ª operação fica embaixo, para destacar de baixo para cima */}
                {t.operacoes
                  .filter((o) => o.parte === p)
                  .sort((a, b) => b.ordem - a.ordem)
                  .map((o) => (
                    <Cupom key={o.id} t={t} o={o} />
                  ))}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function ImprimirTicketsPage() {
  return (
    <div className="pagina-impressao">
      <Suspense fallback={<p style={{ padding: 24 }}>Carregando...</p>}>
        <Tickets />
      </Suspense>
      <style>{`
        .pagina-impressao { background: #dcdcd6; min-height: 100vh; padding-bottom: 40px; }
        .barra-impressao { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between;
          align-items: center; background: var(--rosa-fundo); color: var(--tinta); border-bottom: 1px solid #f3dfe7;
          padding: 10px 24px; font-size: 14px;
          font-weight: 600; }
        .ticket { display: grid; gap: 0; background: #fff; width: 190mm; margin: 20px auto; padding: 8mm 0;
          box-sizing: border-box; box-shadow: 0 2px 10px rgba(0,0,0,.12); color: #000; }
        .parte { padding: 0 5mm; min-width: 0; }
        /* linha de corte entre as duas partes */
        .parte + .parte { border-left: 1.5px dashed #555; }
        /* fundo preto + 1px de espaço entre as caixas brancas = as linhas da grade do cabeçalho */
        /* fundo preto + 1px de espaço entre as caixas brancas = as linhas da grade do cabeçalho */
        .cabecalho { display: grid; grid-template-columns: 1.25fr 1.1fr .7fr .9fr; gap: 1px; background: #000;
          border: 2px solid #000; }
        .cab-campo { display: flex; flex-direction: column; padding: 2px 6px 3px; background: #fff; min-width: 0; }
        .cab-cor { grid-column: span 2; }
        .cab-id { grid-column: span 2; }
        .cab-campo span { font-size: 7.5px; text-transform: uppercase; letter-spacing: .5px; color: #444; line-height: 1.2; }
        .cab-campo b { font-size: 16px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cab-cor b { font-size: 13px; }
        .cab-id b { font-size: 12px; }
        .cab-id small { font-size: 9px; font-weight: 400; color: #333; }
        .parte-titulo { margin-top: 2mm; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
          background: #000; color: #fff; padding: 3px 8px; }
        .cupom { display: flex; align-items: center; gap: 8px; padding: 5px 2px; border-bottom: 1.5px dashed #555;
          break-inside: avoid; page-break-inside: avoid; min-height: 19mm; box-sizing: border-box; }
        .cupom-ordem { font-size: 18px; font-weight: 900; width: 26px; text-align: center; flex-shrink: 0; }
        .cupom-info { flex: 1; min-width: 0; }
        .cupom-nome { font-size: 13px; font-weight: 800; line-height: 1.2; }
        .cupom-maquina { font-size: 10.5px; margin-top: 1px; }
        .cupom-ref { font-size: 9px; color: #222; margin-top: 2px; line-height: 1.3; }
        .cupom-codigo { flex-shrink: 0; }
        .cupom-codigo svg { display: block; height: 52px; width: auto; }
        @media print {
          @page { size: A4; margin: 8mm; }
          .nao-imprimir { display: none !important; }
          .pagina-impressao { background: #fff; padding: 0; }
          .ticket { margin: 0; width: auto; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
          .parte:first-child { padding-left: 0; }
          .parte:last-child { padding-right: 0; }
          .ticket:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
