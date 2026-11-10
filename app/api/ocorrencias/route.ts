import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const inicio = req.nextUrl.searchParams.get("inicio");
    const fim = req.nextUrl.searchParams.get("fim");
    const supabase = getSupabaseServer();
    let consulta = supabase
      .from("ocorrencias")
      .select("id, costureira_id, data, minutos, descricao")
      .order("data", { ascending: false })
      .limit(500);
    if (inicio) consulta = consulta.gte("data", inicio);
    if (fim) consulta = consulta.lte("data", fim);
    const { data, error } = await consulta;
    if (error) throw error;
    return NextResponse.json({ ocorrencias: data ?? [] });
  } catch (err) {
    return respostaErro(err);
  }
}

// costureira_id vazio = ocorrência vale para todas (ex: falta de luz, feriado)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = String(body.data ?? "");
    const minutos = Math.round(Number(body.minutos));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return respostaErro(new Error("Informe a data"), 400);
    if (!minutos) return respostaErro(new Error("Informe os minutos (positivo aumenta, negativo reduz)"), 400);

    const supabase = getSupabaseServer();
    const { error } = await supabase.from("ocorrencias").insert({
      costureira_id: body.costureira_id ? Number(body.costureira_id) : null,
      data,
      minutos,
      descricao: String(body.descricao ?? "").trim() || null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("ocorrencias").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
