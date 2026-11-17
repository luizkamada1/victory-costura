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

// Sem costureira = ocorrência vale para a fábrica toda (ex: falta de luz, feriado).
// Com várias costureiras (costureira_ids), cria uma ocorrência para cada uma. Os minutos podem
// vir por costureira (minutos_por_costureira), para lançar "dia inteiro" com a jornada de cada uma.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = String(body.data ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return respostaErro(new Error("Informe a data"), 400);
    const descricao = String(body.descricao ?? "").trim() || null;

    const ids: number[] = Array.isArray(body.costureira_ids)
      ? Array.from(new Set(body.costureira_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
      : body.costureira_id
        ? [Number(body.costureira_id)]
        : [];
    const porCostureira: Record<string, number> = body.minutos_por_costureira ?? {};
    const minutosDe = (id: number | null) =>
      Math.round(Number(id !== null && porCostureira[String(id)] !== undefined ? porCostureira[String(id)] : body.minutos));

    const linhas = (ids.length ? ids : [null]).map((id) => ({ costureira_id: id, data, minutos: minutosDe(id), descricao }));
    if (linhas.some((l) => !l.minutos)) {
      return respostaErro(new Error("Informe os minutos (positivo aumenta, negativo reduz)"), 400);
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase.from("ocorrencias").insert(linhas);
    if (error) throw error;
    return NextResponse.json({ ok: true, criadas: linhas.length });
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
