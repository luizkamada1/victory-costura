import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AJUSTES_PADRAO, AjustesGrade } from "@/lib/producao";

export function respostaErro(err: unknown, status = 500) {
  const message = err instanceof Error
    ? err.message
    : typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : "Erro desconhecido";
  return NextResponse.json({ error: message }, { status });
}

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

// O Supabase devolve no máximo 1000 linhas por consulta; isso busca página a página
export async function buscarTodos<T>(consulta: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const TAMANHO = 1000;
  const todos: T[] = [];
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await consulta(de, de + TAMANHO - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < TAMANHO) break;
  }
  return todos;
}

// Divide uma lista em blocos (para filtros .in() não estourarem o tamanho da URL)
export function emBlocos<T>(lista: T[], tamanho = 200): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) blocos.push(lista.slice(i, i + tamanho));
  return blocos;
}

// Percentuais de ajuste por grade. Enquanto a tabela ajustes_grade não existir no banco,
// usa os valores iniciais, para a geração de tickets não parar.
export async function carregarAjustes(supabase: SupabaseClient): Promise<{ ajustes: AjustesGrade; tabelaExiste: boolean }> {
  const { data, error } = await supabase.from("ajustes_grade").select("grade, percentual");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { ajustes: { ...AJUSTES_PADRAO }, tabelaExiste: false };
    throw error;
  }
  const ajustes: AjustesGrade = { ...AJUSTES_PADRAO };
  for (const row of data ?? []) ajustes[row.grade] = Number(row.percentual);
  return { ajustes, tabelaExiste: true };
}
