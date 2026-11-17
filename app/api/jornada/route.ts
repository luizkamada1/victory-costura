import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";
import { DIAS_SEMANA, HorariosSemana, Periodo, minutosDosPeriodos, problemaHorarios } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SQL_HORARIOS = "alter table jornada_padrao add column if not exists horarios jsonb;";

// jornada: minutos por dia da semana ("0" = domingo); horarios: períodos de cada dia (null se ainda não cadastrados)
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    let horariosDisponivel = true;
    let resp = await supabase.from("jornada_padrao").select("dia_semana, minutos, horarios");
    if (resp.error?.code === "42703") {
      horariosDisponivel = false;
      resp = (await supabase.from("jornada_padrao").select("dia_semana, minutos")) as typeof resp;
    }
    if (resp.error) throw resp.error;
    const jornada: Record<string, number> = {};
    const horarios: Record<string, Periodo[] | null> = {};
    for (let d = 0; d < 7; d++) {
      jornada[String(d)] = 0;
      horarios[String(d)] = null;
    }
    for (const row of (resp.data ?? []) as { dia_semana: number; minutos: number; horarios?: Periodo[] | null }[]) {
      jornada[String(row.dia_semana)] = row.minutos;
      horarios[String(row.dia_semana)] = Array.isArray(row.horarios) ? row.horarios : null;
    }
    return NextResponse.json({ jornada, horarios, horariosDisponivel });
  } catch (err) {
    return respostaErro(err);
  }
}

// Recebe os horários de cada dia; os minutos são calculados aqui a partir deles
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const horarios: HorariosSemana | undefined = body.horarios;
    const supabase = getSupabaseServer();

    if (!horarios) {
      // formato antigo: só os minutos
      const jornada: Record<string, number> = body.jornada ?? {};
      const linhas = Array.from({ length: 7 }, (_, d) => ({
        dia_semana: d,
        minutos: Math.max(0, Math.round(Number(jornada[String(d)]) || 0)),
      }));
      const { error } = await supabase.from("jornada_padrao").upsert(linhas, { onConflict: "dia_semana" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const linhas = [];
    for (let d = 0; d < 7; d++) {
      const periodos: Periodo[] = (horarios[String(d)] ?? []).map((p) => [String(p[0] ?? ""), String(p[1] ?? "")]);
      const problema = problemaHorarios(periodos);
      if (problema) return respostaErro(new Error(`${DIAS_SEMANA[d]}: ${problema}`), 400);
      const ordenados = [...periodos].sort((a, b) => a[0].localeCompare(b[0]));
      linhas.push({ dia_semana: d, minutos: minutosDosPeriodos(ordenados), horarios: ordenados });
    }
    const { error } = await supabase.from("jornada_padrao").upsert(linhas, { onConflict: "dia_semana" });
    if (error?.code === "42703" || error?.code === "PGRST204") {
      return respostaErro(new Error(`Falta preparar o banco para os horários. Rode no Supabase (SQL Editor): ${SQL_HORARIOS}`), 400);
    }
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
