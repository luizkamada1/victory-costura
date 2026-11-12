import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";
import { PARTES, Parte } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("operacoes")
      .select("id, nome, tempo_minutos, maquina, parte")
      .order("parte", { ascending: false })
      .order("nome");
    if (error) throw error;
    const operacoes = (data ?? []).map((o) => ({ ...o, tempo_minutos: Number(o.tempo_minutos) }));
    return NextResponse.json({ operacoes });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome ?? "").trim();
    const tempo = Number(body.tempo_minutos);
    const parte = body.parte as Parte;
    if (!nome) return respostaErro(new Error("Informe o nome da operação"), 400);
    if (!(tempo > 0)) return respostaErro(new Error("Informe o tempo da operação (maior que zero)"), 400);
    if (!PARTES.includes(parte)) return respostaErro(new Error("Informe a parte (superior ou inferior)"), 400);

    const linha = { nome, tempo_minutos: tempo, maquina: String(body.maquina ?? "").trim() || null, parte };
    const supabase = getSupabaseServer();
    if (body.id) {
      const { error } = await supabase.from("operacoes").update(linha).eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, id: Number(body.id) });
    }
    const { data, error } = await supabase.from("operacoes").insert(linha).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    return respostaErro(err);
  }
}

// Tickets já gerados guardam uma cópia da operação, então excluir não afeta o histórico
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("operacoes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
