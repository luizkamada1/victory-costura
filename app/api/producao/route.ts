import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { Parte, dataBrasilia } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Finalizadas aparecem por este tempo depois do último apontamento
const DIAS_FINALIZADAS = 30;

const SQL_OP_INFO =
  "create table if not exists op_info (op text primary key, urgente boolean not null default false, prazo date); alter table op_info enable row level security;";
const semTabela = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

type TicketLido = {
  id: number;
  op: string;
  referencia: string;
  nome_item: string | null;
  cor: string | null;
  partes: Parte[];
  quantidade: number;
  created_at: string;
  itens?: { colecao?: string | null } | null;
};
type CupomLido = {
  ticket_id: number;
  parte: Parte;
  minutos_total: number | string;
  costureira_id: number | null;
  apontado_em: string | null;
};

export type Situacao = "aguardando" | "andamento" | "finalizado";

export type CartaoOP = {
  op: string;
  situacao: Situacao;
  urgente: boolean;
  prazo: string | null; // data de entrega, "YYYY-MM-DD"
  referencias: string[];
  nomes: string[];
  colecoes: string[];
  cores: string[];
  pecas: number;
  tickets: number;
  cupons: number;
  cuponsApontados: number;
  minutos: number;
  minutosApontados: number;
  partes: Partial<Record<Parte, { minutos: number; apontados: number }>>;
  geradoEm: string; // data (Brasília) do primeiro ticket
  primeiroApontamento: string | null;
  ultimoApontamento: string | null; // instante
};

// Kanban da produção: uma OP por cartão, com a situação tirada dos apontamentos.
// Aguardando = nenhum cupom apontado; Em andamento = alguns; Finalizado = todos.
export async function GET() {
  try {
    const supabase = getSupabaseServer();

    const lerTickets = (campos: string) =>
      buscarTodos<TicketLido>((de, ate) =>
        supabase.from("tickets").select(campos).order("id").range(de, ate) as unknown as PromiseLike<{
          data: TicketLido[] | null;
          error: unknown;
        }>
      );
    let tickets: TicketLido[];
    try {
      tickets = await lerTickets("id, op, referencia, nome_item, cor, partes, quantidade, created_at, itens(colecao)");
    } catch (e) {
      // enquanto a coluna colecao não existir no banco
      if ((e as { code?: string }).code !== "42703") throw e;
      tickets = await lerTickets("id, op, referencia, nome_item, cor, partes, quantidade, created_at");
    }

    const cupons = await buscarTodos<CupomLido>((de, ate) =>
      supabase
        .from("ticket_operacoes")
        .select("ticket_id, parte, minutos_total, costureira_id, apontado_em")
        .order("id")
        .range(de, ate)
    );
    const cuponsPorTicket = new Map<number, CupomLido[]>();
    for (const c of cupons) {
      const lista = cuponsPorTicket.get(c.ticket_id) ?? [];
      lista.push(c);
      cuponsPorTicket.set(c.ticket_id, lista);
    }

    type Acumulado = CartaoOP & { _pecasParte: Record<string, number> };
    const porOP = new Map<string, Acumulado>();
    for (const t of tickets) {
      const op = t.op.trim();
      const cartao: Acumulado =
        porOP.get(op) ??
        ({
          op,
          situacao: "aguardando",
          urgente: false,
          prazo: null,
          referencias: [],
          nomes: [],
          colecoes: [],
          cores: [],
          pecas: 0,
          tickets: 0,
          cupons: 0,
          cuponsApontados: 0,
          minutos: 0,
          minutosApontados: 0,
          partes: {},
          geradoEm: dataBrasilia(t.created_at),
          primeiroApontamento: null,
          ultimoApontamento: null,
          _pecasParte: {},
        } as Acumulado);
      const junta = (lista: string[], v: string | null | undefined) => {
        if (v && !lista.includes(v)) lista.push(v);
      };
      junta(cartao.referencias, t.referencia);
      junta(cartao.nomes, t.nome_item);
      junta(cartao.colecoes, t.itens?.colecao);
      junta(cartao.cores, t.cor);
      cartao.tickets += 1;
      const gerado = dataBrasilia(t.created_at);
      if (gerado < cartao.geradoEm) cartao.geradoEm = gerado;
      // peças: a mesma peça pode ter um ticket da parte de cima e outro da de baixo; conta a parte com mais peças
      for (const p of t.partes ?? []) cartao._pecasParte[p] = (cartao._pecasParte[p] ?? 0) + t.quantidade;

      for (const c of cuponsPorTicket.get(t.id) ?? []) {
        const min = Number(c.minutos_total) || 0;
        const apontado = c.costureira_id !== null;
        cartao.cupons += 1;
        cartao.minutos += min;
        const parte = (cartao.partes[c.parte] ??= { minutos: 0, apontados: 0 });
        parte.minutos += min;
        if (apontado) {
          cartao.cuponsApontados += 1;
          cartao.minutosApontados += min;
          parte.apontados += min;
          if (c.apontado_em) {
            if (!cartao.ultimoApontamento || c.apontado_em > cartao.ultimoApontamento) cartao.ultimoApontamento = c.apontado_em;
            if (!cartao.primeiroApontamento || c.apontado_em < cartao.primeiroApontamento) cartao.primeiroApontamento = c.apontado_em;
          }
        }
      }
      porOP.set(op, cartao);
    }

    // urgência e prazo (enquanto a tabela não existir, o quadro funciona sem eles)
    const infoResp = await supabase.from("op_info").select("op, urgente, prazo");
    if (infoResp.error && !semTabela(infoResp.error)) throw infoResp.error;
    for (const i of infoResp.data ?? []) {
      const c = porOP.get(String(i.op).trim());
      if (c) {
        c.urgente = !!i.urgente;
        c.prazo = i.prazo ?? null;
      }
    }

    const hoje = dataBrasilia();
    const limiteFinalizadas = new Date(Date.parse(hoje + "T00:00:00Z") - DIAS_FINALIZADAS * 86400000).toISOString().slice(0, 10);
    const cartoes: CartaoOP[] = [];
    for (const { _pecasParte, ...c } of Array.from(porOP.values())) {
      c.pecas = Math.max(0, ...Object.values(_pecasParte));
      c.situacao =
        c.cupons > 0 && c.cuponsApontados === c.cupons ? "finalizado" : c.cuponsApontados > 0 ? "andamento" : "aguardando";
      if (c.situacao === "finalizado" && c.ultimoApontamento && dataBrasilia(c.ultimoApontamento) < limiteFinalizadas) continue;
      cartoes.push(c);
    }
    return NextResponse.json({ cartoes, diasFinalizadas: DIAS_FINALIZADAS });
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { op, urgente?, prazo? } → marca a OP como urgente e/ou define o prazo (prazo null limpa)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const op = String(body.op ?? "").trim();
    if (!op) return respostaErro(new Error("Informe a OP"), 400);
    const linha: { op: string; urgente?: boolean; prazo?: string | null } = { op };
    if (typeof body.urgente === "boolean") linha.urgente = body.urgente;
    if (body.prazo !== undefined) {
      if (body.prazo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.prazo))) {
        return respostaErro(new Error("Prazo inválido"), 400);
      }
      linha.prazo = body.prazo;
    }
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("op_info").upsert(linha, { onConflict: "op" });
    if (semTabela(error)) {
      return respostaErro(new Error(`Falta preparar o banco. Rode no Supabase (SQL Editor): ${SQL_OP_INFO}`), 400);
    }
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
