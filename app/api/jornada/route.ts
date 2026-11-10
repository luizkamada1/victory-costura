import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.from("jornada_padrao").select("dia_semana, minutos");
    if (error) throw error;
    const jornada: Record<string, number> = {};
    for (let d = 0; d < 7; d++) jornada[String(d)] = 0;
    for (const row of data ?? []) jornada[String(row.dia_semana)] = row.minutos;
    return NextResponse.json({ jornada });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jornada: Record<string, number> = body.jornada ?? {};
    const linhas = Array.from({ length: 7 }, (_, d) => ({
      dia_semana: d,
      minutos: Math.max(0, Math.round(Number(jornada[String(d)]) || 0)),
    }));
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("jornada_padrao").upsert(linhas, { onConflict: "dia_semana" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
