import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { Parte } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type FilaMaquina = {
  maquina: string;
  minutos: number;
  cupons: number;
  ops: { op: string; minutos: number }[];
};
export type FilaRecorte = { maquinas: FilaMaquina[]; total: number; pecas: number };
export type EscopoFila = "andamento" | "aguardando" | "todos";

type TicketLido = {
  id: number;
  op: string;
  referencia: string;
  cor: string | null;
  tamanho: string | null;
  partes: Parte[];
  quantidade: number;
};
type CupomLido = { ticket_id: number; maquina: string | null; minutos_total: number | string; costureira_id: number | null };

// Fila de agora: tudo o que ainda falta costurar (cupons não apontados), por máquina.
// Separado pela situação da OP, como no quadro de Produção: em andamento (já tem cupom apontado)
// ou aguardando (nenhum apontado). Não depende de período.
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const [tickets, cupons] = await Promise.all([
      buscarTodos<TicketLido>((de, ate) =>
        supabase.from("tickets").select("id, op, referencia, cor, tamanho, partes, quantidade").order("id").range(de, ate)
      ),
      buscarTodos<CupomLido>((de, ate) =>
        supabase.from("ticket_operacoes").select("ticket_id, maquina, minutos_total, costureira_id").order("id").range(de, ate)
      ),
    ]);
    const ticketPorId = new Map(tickets.map((t) => [t.id, t]));

    // situação de cada OP
    const opComApontado = new Set<string>();
    for (const c of cupons) {
      const t = ticketPorId.get(c.ticket_id);
      if (t && c.costureira_id !== null) opComApontado.add(t.op);
    }

    const montar = (escopo: EscopoFila): FilaRecorte => {
      const entra = (op: string) =>
        escopo === "todos" || (escopo === "andamento" ? opComApontado.has(op) : !opComApontado.has(op));
      const porMaquina = new Map<string, { minutos: number; cupons: number; ops: Map<string, number> }>();
      const ticketsPendentes = new Set<number>();
      for (const c of cupons) {
        if (c.costureira_id !== null) continue;
        const t = ticketPorId.get(c.ticket_id);
        if (!t || !entra(t.op)) continue;
        ticketsPendentes.add(t.id);
        const maquina = c.maquina?.trim() || "Sem máquina";
        const min = Number(c.minutos_total) || 0;
        const m = porMaquina.get(maquina) ?? { minutos: 0, cupons: 0, ops: new Map<string, number>() };
        m.minutos += min;
        m.cupons += 1;
        m.ops.set(t.op, (m.ops.get(t.op) ?? 0) + min);
        porMaquina.set(maquina, m);
      }

      // peças a terminar: tickets com algo pendente; a parte de cima e a de baixo da mesma peça contam uma vez
      const grupos = new Map<string, Partial<Record<Parte, number>>>();
      for (const id of Array.from(ticketsPendentes)) {
        const t = ticketPorId.get(id)!;
        const k = [t.op, t.referencia, t.cor ?? "", t.tamanho ?? ""].join("|");
        const g = grupos.get(k) ?? {};
        for (const p of t.partes ?? []) g[p] = (g[p] ?? 0) + t.quantidade;
        grupos.set(k, g);
      }
      const pecas = Array.from(grupos.values()).reduce((s, g) => s + Math.max(0, ...Object.values(g).map(Number)), 0);

      const maquinas: FilaMaquina[] = Array.from(porMaquina.entries())
        .map(([maquina, m]) => ({
          maquina,
          minutos: m.minutos,
          cupons: m.cupons,
          ops: Array.from(m.ops.entries())
            .map(([op, minutos]) => ({ op, minutos }))
            .sort((a, b) => b.minutos - a.minutos),
        }))
        .sort((a, b) => b.minutos - a.minutos);
      return { maquinas, total: maquinas.reduce((s, m) => s + m.minutos, 0), pecas };
    };

    return NextResponse.json({ andamento: montar("andamento"), aguardando: montar("aguardando"), todos: montar("todos") });
  } catch (err) {
    return respostaErro(err);
  }
}
