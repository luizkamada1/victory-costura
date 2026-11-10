import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("costureiras")
      .select("id, nome, setor, jornada, ativa")
      .order("nome");
    if (error) throw error;
    return NextResponse.json({ costureiras: data ?? [] });
  } catch (err) {
    return respostaErro(err);
  }
}

// Cria (sem id) ou atualiza (com id)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome ?? "").trim();
    if (!nome) return respostaErro(new Error("Informe o nome da costureira"), 400);

    const linha = {
      nome,
      setor: String(body.setor ?? "").trim() || null,
      jornada: body.jornada ?? null,
      ativa: body.ativa !== false,
    };

    const supabase = getSupabaseServer();
    const { error } = body.id
      ? await supabase.from("costureiras").update(linha).eq("id", body.id)
      : await supabase.from("costureiras").insert(linha);
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
    const { count, error: erroContagem } = await supabase
      .from("ticket_operacoes")
      .select("id", { count: "exact", head: true })
      .eq("costureira_id", id);
    if (erroContagem) throw erroContagem;
    if (count) {
      return respostaErro(
        new Error("Essa costureira já tem produção apontada. Desative-a em vez de excluir."),
        400
      );
    }
    const { error } = await supabase.from("costureiras").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
