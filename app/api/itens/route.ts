import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { PARTES } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS_ITEM = "id, referencia, nome, grades, tamanhos, cores, partes";

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
    // Os vínculos passam de 1.000 linhas com poucas dezenas de itens; sem paginar, o Supabase
    // cortaria a lista e um item salvo depois perderia as operações que não vieram.
    const buscarItens = (campos: string) => supabase.from("itens").select(campos).order("referencia");
    const [respostaItens, vinculos] = await Promise.all([
      buscarItens(`${CAMPOS_ITEM}, colecao`),
      buscarTodos((de, ate) =>
        supabase
          .from("item_operacoes")
          .select("item_id, operacao_id, ordem")
          .order("item_id")
          .order("ordem")
          .order("id")
          .range(de, ate)
      ),
    ]);
    let { data: itensBrutos, error } = respostaItens;
    // enquanto o campo colecao não for criado no banco, a lista funciona sem ele
    if (error && error.code === "42703") ({ data: itensBrutos, error } = await buscarItens(CAMPOS_ITEM));
    if (error) throw error;
    const itens = itensBrutos as unknown as { id: number }[] | null;

    const porItem = new Map<number, { operacao_id: number; ordem: number }[]>();
    for (const v of vinculos) {
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
      colecao: String(body.colecao ?? "").trim() || null,
    };
    if (linha.partes.length === 0) return respostaErro(new Error("Informe ao menos uma parte"), 400);
    if (linha.grades.length > 1) return respostaErro(new Error("Um item só pode ter uma grade"), 400);

    const supabase = getSupabaseServer();
    // Enquanto o campo colecao não existir no banco: salva sem ele, mas avisa se a coleção foi preenchida
    const gravar = async (dados: Record<string, unknown>) =>
      body.id
        ? { ...(await supabase.from("itens").update(dados).eq("id", body.id)), data: { id: Number(body.id) } }
        : await supabase.from("itens").insert(dados).select("id").single();
    let resultado = await gravar(linha);
    if (resultado.error?.code === "42703") {
      if (linha.colecao) {
        return respostaErro(
          new Error("O campo Coleção ainda não existe no banco. Rode o trecho novo do supabase_setup.sql no Supabase."),
          400
        );
      }
      const { colecao: _ignorar, ...semColecao } = linha;
      resultado = await gravar(semColecao);
    }
    if (resultado.error) {
      if (resultado.error.code === "23505") return respostaErro(new Error(`A referência ${referencia} já existe`), 400);
      throw resultado.error;
    }
    const itemId: number = (resultado.data as { id: number }).id;

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
