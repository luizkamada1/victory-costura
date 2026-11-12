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
        height: 40,
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
          OP <b>{t.op}</b> · Ref <b>{t.referencia}</b>
        </div>
        <div className="cupom-ref">
          Tam <b>{t.tamanho ?? "—"}</b> · Qtd <b>{t.quantidade}</b> · {t.cor ?? "—"}
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
        <b className={(t.tamanho ?? "").length > 2 ? "cab-texto-longo" : undefined}>{t.tamanho ?? "—"}</b>
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

// Estimativa da altura de cada parte na folha, em mm, para decidir quantas linhas cabem.
// Medidas reais do layout, em mm. Folha A4 (297mm) menos as margens de 5mm em cima e embaixo.
const ALTURA_UTIL = 287;
const ALTURA_FIXA = 30.5; // cabeçalho + título da parte + respiro da célula
const ALTURA_CUPOM = 14;
const ALTURA_CUPOM_NOME_LONGO = 16; // nome da operação que quebra em duas linhas
const alturaParte = (ops: TicketOperacao[]) =>
  ALTURA_FIXA + ops.reduce((s, o) => s + (o.nome_operacao.length > 26 ? ALTURA_CUPOM_NOME_LONGO : ALTURA_CUPOM), 0);

type Bloco = { chave: string; t: Ticket; parte: (typeof PARTES)[number]; ops: TicketOperacao[] };

// Distribui as partes de todos os tickets em folhas com 2 colunas: a 1ª linha recebe o
// 1º ticket (superior | inferior), a 2ª o próximo, e assim por diante. Uma folha nova
// só começa quando a próxima linha não cabe mais.
function montarFolhas(tickets: Ticket[]): Bloco[][][] {
  const blocos: Bloco[] = tickets.flatMap((t) =>
    PARTES.filter((p) => t.operacoes.some((o) => o.parte === p)).map((p) => ({
      chave: `${t.id}-${p}`,
      t,
      parte: p,
      // ordem invertida: a 1ª operação fica embaixo, para destacar de baixo para cima
      ops: t.operacoes.filter((o) => o.parte === p).sort((a, b) => b.ordem - a.ordem),
    }))
  );
  const linhas: Bloco[][] = [];
  for (let i = 0; i < blocos.length; i += 2) linhas.push(blocos.slice(i, i + 2));

  const folhas: Bloco[][][] = [];
  let atual: Bloco[][] = [];
  let usado = 0;
  for (const linha of linhas) {
    const altura = Math.max(...linha.map((b) => alturaParte(b.ops)));
    if (atual.length && usado + altura > ALTURA_UTIL) {
      folhas.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(linha);
    usado += altura;
  }
  if (atual.length) folhas.push(atual);
  return folhas;
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

  // Marca os tickets como impressos quando a janela de impressão do navegador fecha
  // (pelo botão Imprimir ou pelo Ctrl+P). O navegador não informa se a pessoa cancelou.
  useEffect(() => {
    if (!tickets?.length) return;
    const marcar = () => {
      api("/api/tickets", { method: "PATCH", body: JSON.stringify({ ids: tickets.map((t) => t.id) }) }).catch(() => {
        // sem o campo no banco, só não registra a impressão
      });
    };
    window.addEventListener("afterprint", marcar);
    return () => window.removeEventListener("afterprint", marcar);
  }, [tickets]);

  if (erro) return <p style={{ padding: 24, color: "var(--erro)" }}>Não foi possível abrir os tickets: {erro}</p>;
  if (!tickets) return <p style={{ padding: 24 }}>Carregando os tickets…</p>;

  const folhas = montarFolhas(tickets);

  return (
    <>
      <div className="barra-impressao nao-imprimir">
        <span className="num">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} ·{" "}
          {tickets.reduce((s, t) => s + t.operacoes.length, 0)} cupons · {folhas.length}{" "}
          {folhas.length === 1 ? "folha" : "folhas"}
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

      {folhas.map((linhas, f) => (
        <div key={f} className="folha">
          {linhas.flat().map((b) => (
            <div key={b.chave} className="parte">
              <Cabecalho t={b.t} />
              <div className="parte-titulo">{NOME_PARTE[b.parte]}</div>
              {b.ops.map((o) => (
                <Cupom key={o.id} t={b.t} o={o} />
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
        /* folha A4: 2 colunas; cada parte ocupa cerca de 1/4 da folha */
        .folha { display: grid; grid-template-columns: 1fr 1fr; align-content: start; background: #fff;
          width: 210mm; min-height: 297mm; margin: 20px auto; padding: 5mm; box-sizing: border-box;
          box-shadow: 0 2px 10px rgba(0,0,0,.12); color: #000; }
        .parte { padding: 2.5mm 3mm; min-width: 0; break-inside: avoid; page-break-inside: avoid; }
        /* linhas de corte entre as partes */
        .parte:nth-child(2n) { border-left: 1.5px dashed #555; }
        .parte:nth-child(n+3) { border-top: 1.5px dashed #555; }
        /* fundo preto + 1px de espaço entre as caixas brancas = as linhas da grade do cabeçalho */
        .cabecalho { display: grid; grid-template-columns: 1.25fr 1.1fr .7fr .9fr; gap: 1px; background: #000;
          border: 2px solid #000; }
        .cab-campo { display: flex; flex-direction: column; padding: 2px 6px 3px; background: #fff; min-width: 0; }
        .cab-cor { grid-column: span 2; }
        .cab-id { grid-column: span 2; }
        .cab-campo span { font-size: 7.5px; text-transform: uppercase; letter-spacing: .5px; color: #444; line-height: 1.2; }
        .cab-campo b { font-size: 16px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cab-cor b { font-size: 13px; }
        .cab-campo b.cab-texto-longo { font-size: 11px; line-height: 1.45; }
        .cab-id b { font-size: 12px; }
        .cab-id small { font-size: 9px; font-weight: 400; color: #333; }
        .parte-titulo { margin-top: 2mm; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
          background: #000; color: #fff; padding: 3px 8px; }
        .cupom { display: flex; align-items: center; gap: 8px; padding: 2px 2px; border-bottom: 1.5px dashed #555;
          break-inside: avoid; page-break-inside: avoid; min-height: 14mm; box-sizing: border-box; }
        .cupom-ordem { font-size: 18px; font-weight: 900; width: 26px; text-align: center; flex-shrink: 0; }
        .cupom-info { flex: 1; min-width: 0; }
        .cupom-nome { font-size: 12px; font-weight: 800; line-height: 1.1; }
        .cupom-maquina { font-size: 9.5px; line-height: 1.15; }
        .cupom-ref { font-size: 8px; color: #222; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cupom-codigo { flex-shrink: 0; }
        .cupom-codigo svg { display: block; height: 42px; width: auto; }
        @media print {
          @page { size: A4; margin: 5mm; }
          .nao-imprimir { display: none !important; }
          .pagina-impressao { background: #fff; padding: 0; }
          .folha { margin: 0; width: auto; min-height: 0; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
          .folha:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
