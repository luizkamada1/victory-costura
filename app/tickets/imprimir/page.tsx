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
      JsBarcode(ref.current, valor, {
        format: "CODE128",
        width: 2,
        height: 42,
        margin: 0,
        fontSize: 13,
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

      {tickets.map((t) => (
        <div key={t.id} className="ticket">
          <div className="cabecalho">
            <div className="cab-campo cab-op">
              <span>OP</span>
              <b>{t.op}</b>
            </div>
            <div className="cab-campo">
              <span>Referência</span>
              <b>{t.referencia}</b>
              <small>{t.nome_item}</small>
            </div>
            <div className="cab-campo">
              <span>Cor</span>
              <b>{t.cor ?? "—"}</b>
            </div>
            <div className="cab-campo">
              <span>Tamanho</span>
              <b>{t.tamanho ?? "—"}</b>
            </div>
            <div className="cab-campo">
              <span>Quantidade</span>
              <b>{t.quantidade}</b>
            </div>
            <div className="cab-campo cab-id">
              <span>Ticket</span>
              <b>#{t.id}</b>
              <small>{formatarData(t.created_at)}</small>
            </div>
          </div>

          {PARTES.filter((p) => t.operacoes.some((o) => o.parte === p)).map((p) => (
            <div key={p} className="parte">
              <div className="parte-titulo">{NOME_PARTE[p]}</div>
              {t.operacoes
                .filter((o) => o.parte === p)
                .sort((a, b) => a.ordem - b.ordem)
                .map((o) => (
                  <Cupom key={o.id} t={t} o={o} />
                ))}
            </div>
          ))}
        </div>
      ))}
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
        .ticket { background: #fff; width: 190mm; margin: 20px auto; padding: 8mm 10mm; box-sizing: border-box;
          box-shadow: 0 2px 10px rgba(0,0,0,.12); color: #000; }
        .cabecalho { display: grid; grid-template-columns: 1.2fr 2fr 1.3fr .9fr 1fr 1fr; border: 2px solid #000; }
        .cab-campo { display: flex; flex-direction: column; padding: 5px 8px; border-right: 1px solid #000; min-width: 0; }
        .cab-campo:last-child { border-right: none; }
        .cab-campo span { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #444; }
        .cab-campo b { font-size: 17px; line-height: 1.2; overflow-wrap: anywhere; }
        .cab-campo small { font-size: 9.5px; color: #333; line-height: 1.2; }
        .cab-op b { font-size: 22px; }
        .cab-id b { font-size: 13px; }
        .parte { margin-top: 5mm; }
        .parte-titulo { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
          background: #000; color: #fff; padding: 3px 8px; }
        .cupom { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 1.5px dashed #555;
          break-inside: avoid; page-break-inside: avoid; min-height: 19mm; box-sizing: border-box; }
        .cupom-ordem { font-size: 20px; font-weight: 900; width: 34px; text-align: center; flex-shrink: 0; }
        .cupom-info { flex: 1; min-width: 0; }
        .cupom-nome { font-size: 14.5px; font-weight: 800; line-height: 1.2; }
        .cupom-maquina { font-size: 11.5px; margin-top: 1px; }
        .cupom-ref { font-size: 10px; color: #222; margin-top: 3px; }
        .cupom-codigo { flex-shrink: 0; }
        .cupom-codigo svg { display: block; height: 58px; width: auto; }
        @media print {
          @page { size: A4; margin: 8mm; }
          .nao-imprimir { display: none !important; }
          .pagina-impressao { background: #fff; padding: 0; }
          .ticket { margin: 0; width: auto; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
          .ticket:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
