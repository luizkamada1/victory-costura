import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";
import { PARTES } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function limparLista(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  for (const v of valor) {
    const s = String(v ?? "").trim();
    if (s) vistos.add(s);
  }
  return Array.from(vistos);
}

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const [{ data: itens, error }, { data: vinculos, error: erroVinculos }] = await Promise.all([
      supabase.from("itens").select("id, referencia, nome, grades, tamanhos, cores, partes").order("referencia"),
      supabase.from("item_operacoes").select("item_id, operacao_id, ordem").order("ordem"),
    ]);
    if (error) throw error;
    if (erroVinculos) throw erroVinculos;

    const porItem = new Map<number, { operacao_id: number; ordem: number }[]>();
    for (const v of vinculos ?? []) {
      const lista = porItem.get(v.item_id) ?? [];
      lista.push({ operacao_id: v.operacao_id, ordem: v.ordem });
      porItem.set(v.item_id, lista);
    }
    return NextResponse.json({
      itens: (itens ?? []).map((i) => ({ ...i, operacoes: porItem.get(i.id) ?? [] })),
    });
  } catch (err) {
    return respostaErro(err);
  }
}

// body.operacoes: lista de ids de operação, na ordem de execução
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const referencia = String(body.referencia ?? "").trim();
    const nome = String(body.nome ?? "").trim();
    if (!referencia) return respostaErro(new Error("Informe a referência"), 400);
    if (!nome) return respostaErro(new Error("Informe o nome do item"), 400);

    const linha = {
      referencia,
      nome,
      grades: limparLista(body.grades),
      tamanhos: limparLista(body.tamanhos),
      cores: limparLista(body.cores),
      partes: limparLista(body.partes).filter((p) => (PARTES as string[]).includes(p)),
    };
    if (linha.partes.length === 0) return respostaErro(new Error("Informe ao menos uma parte"), 400);
    if (linha.grades.length > 1) return respostaErro(new Error("Um item só pode ter uma grade"), 400);

    const supabase = getSupabaseServer();
    let itemId: number = body.id;
    if (itemId) {
      const { error } = await supabase.from("itens").update(linha).eq("id", itemId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("itens").insert(linha).select("id").single();
      if (error) {
        if (error.code === "23505") return respostaErro(new Error(`A referência ${referencia} já existe`), 400);
        throw error;
      }
      itemId = data.id;
    }

    const operacoes: number[] = Array.isArray(body.operacoes) ? body.operacoes.map(Number) : [];
    const { error: erroApagar } = await supabase.from("item_operacoes").delete().eq("item_id", itemId);
    if (erroApagar) throw erroApagar;
    if (operacoes.length > 0) {
      const { error } = await supabase
        .from("item_operacoes")
        .insert(operacoes.map((operacao_id, i) => ({ item_id: itemId, operacao_id, ordem: i + 1 })));
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, id: itemId });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("itens").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
