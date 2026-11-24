import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";

const SQL_MAQUINAS = "alter table costureiras add column if not exists maquinas text[] not null default '{}';";
const SQL_INDICADORES = "alter table costureiras add column if not exists nos_indicadores boolean not null default true;";
const semColuna = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    // "*": as colunas novas (maquinas, nos_indicadores) vêm quando existirem no banco
    const { data, error } = await supabase.from("costureiras").select("*").order("nome");
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
    const maquinas: string[] = Array.isArray(body.maquinas)
      ? Array.from(new Set<string>(body.maquinas.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)))
      : [];

    const supabase = getSupabaseServer();
    const gravar = (dados: Record<string, unknown>) =>
      body.id ? supabase.from("costureiras").update(dados).eq("id", body.id) : supabase.from("costureiras").insert(dados);
    const nosIndicadores = body.nos_indicadores !== false;
    let { error } = await gravar({ ...linha, maquinas, nos_indicadores: nosIndicadores });
    if (semColuna(error)) {
      // banco sem alguma das colunas novas: grava o que der; avisa se o que foi pedido não cabe
      ({ error } = await gravar({ ...linha, maquinas }));
      if (semColuna(error)) {
        if (maquinas.length) {
          return respostaErro(
            new Error(`Para guardar as máquinas, falta preparar o banco. Rode no Supabase (SQL Editor): ${SQL_MAQUINAS}`),
            400
          );
        }
        ({ error } = await gravar(linha));
      }
      if (!error && !nosIndicadores) {
        return respostaErro(
          new Error(`Para tirar dos indicadores, falta preparar o banco. Rode no Supabase (SQL Editor): ${SQL_INDICADORES}`),
          400
        );
      }
    }
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
