import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type FilaMaquina = {
  maquina: string;
  minutos: number;
  cupons: number;
  ops: { op: string; minutos: number }[];
};

type CupomPendente = { maquina: string | null; minutos_total: number | string; tickets: { op: string } | null };

// Fila de agora: tudo o que ainda falta costurar (cupons não apontados), por máquina.
// Não depende de período: é a situação no momento.
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const pendentes = await buscarTodos<CupomPendente>((de, ate) =>
      supabase
        .from("ticket_operacoes")
        .select("maquina, minutos_total, tickets(op)")
        .is("costureira_id", null)
        .order("id")
        .range(de, ate) as unknown as PromiseLike<{ data: CupomPendente[] | null; error: unknown }>
    );

    const porMaquina = new Map<string, { minutos: number; cupons: number; ops: Map<string, number> }>();
    for (const c of pendentes) {
      const maquina = c.maquina?.trim() || "Sem máquina";
      const min = Number(c.minutos_total) || 0;
      const m = porMaquina.get(maquina) ?? { minutos: 0, cupons: 0, ops: new Map<string, number>() };
      m.minutos += min;
      m.cupons += 1;
      const op = c.tickets?.op ?? "?";
      m.ops.set(op, (m.ops.get(op) ?? 0) + min);
      porMaquina.set(maquina, m);
    }

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

    return NextResponse.json({ maquinas, total: maquinas.reduce((s, m) => s + m.minutos, 0) });
  } catch (err) {
    return respostaErro(err);
  }
}
