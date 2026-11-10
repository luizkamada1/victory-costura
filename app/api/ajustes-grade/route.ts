import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { carregarAjustes, respostaErro } from "@/lib/producao-api";
import { GRADES } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    return NextResponse.json(await carregarAjustes(supabase));
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { ajustes: { "Plus Size": 10, ... } } (percentual sobre o tempo da grade Adulto)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ajustes: Record<string, number> = body.ajustes ?? {};
    const linhas = Object.keys(GRADES).map((grade) => {
      const percentual = Math.round(Number(ajustes[grade]) * 100) / 100;
      return { grade, percentual: Number.isFinite(percentual) ? percentual : 0 };
    });
    if (linhas.some((l) => l.percentual <= -100 || l.percentual > 500)) {
      return respostaErro(new Error("Use um percentual entre -99% e +500%"), 400);
    }
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("ajustes_grade").upsert(linhas, { onConflict: "grade" });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return respostaErro(
          new Error("A tabela de ajustes ainda não existe no banco. Rode o trecho novo do supabase_setup.sql no Supabase."),
          400
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
