import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTodos, emBlocos } from "@/lib/producao-api";
import { Parte } from "@/lib/producao";

export type PecasDia = { data: string; pecas: number; superior: number; inferior: number };
export type PecasReferencia = { referencia: string; nome: string | null; pecas: number };
export type ResumoPecas = { porDia: PecasDia[]; porReferencia: PecasReferencia[]; total: number };

type TicketLido = {
  id: number;
  op: string;
  referencia: string;
  nome_item: string | null;
  cor: string | null;
  tamanho: string | null;
  partes: Parte[];
  quantidade: number;
};
type CupomLido = { ticket_id: number; parte: Parte; costureira_id: number | null; data_producao: string | null };

/**
 * Peças prontas por dia. Uma parte de um ticket fica pronta no dia em que o último cupom
 * dela é apontado, e cada parte pronta conta como peça: a parte de cima e a de baixo do
 * mesmo pijama contam uma cada (um ticket de 48 conjuntos com as duas partes dá 96 peças).
 *
 * ticketsDoPeriodo: tickets com algum cupom apontado no período (os únicos que podem ter
 * ficado prontos nele).
 */
export async function calcularPecas(
  supabase: SupabaseClient,
  ticketsDoPeriodo: number[],
  inicio: string,
  fim: string
): Promise<ResumoPecas> {
  const vazio: ResumoPecas = { porDia: [], porReferencia: [], total: 0 };
  if (!ticketsDoPeriodo.length) return vazio;

  // os tickets e todos os cupons deles
  const tickets: TicketLido[] = [];
  for (const bloco of emBlocos(Array.from(new Set(ticketsDoPeriodo)))) {
    tickets.push(
      ...(await buscarTodos<TicketLido>((de, ate) =>
        supabase
          .from("tickets")
          .select("id, op, referencia, nome_item, cor, tamanho, partes, quantidade")
          .in("id", bloco)
          .order("id")
          .range(de, ate)
      ))
    );
  }
  const cupons: CupomLido[] = [];
  for (const bloco of emBlocos(tickets.map((t) => t.id))) {
    cupons.push(
      ...(await buscarTodos<CupomLido>((de, ate) =>
        supabase
          .from("ticket_operacoes")
          .select("ticket_id, parte, costureira_id, data_producao")
          .in("ticket_id", bloco)
          .order("id")
          .range(de, ate)
      ))
    );
  }

  // dia em que cada parte de cada ticket ficou pronta (null = ainda falta cupom)
  const prontaEm = new Map<string, string | null>();
  for (const c of cupons) {
    const k = `${c.ticket_id}|${c.parte}`;
    const atual = prontaEm.get(k);
    if (atual === null) continue;
    if (c.costureira_id === null || !c.data_producao) prontaEm.set(k, null);
    else if (atual === undefined || c.data_producao > atual) prontaEm.set(k, c.data_producao);
  }

  // cada parte pronta no período conta como peça
  const porDia = new Map<string, PecasDia>();
  const porReferencia = new Map<string, PecasReferencia>();
  for (const t of tickets) {
    for (const p of t.partes ?? []) {
      const dia = prontaEm.get(`${t.id}|${p}`);
      if (!dia || dia < inicio || dia > fim) continue;
      const linha = porDia.get(dia) ?? { data: dia, pecas: 0, superior: 0, inferior: 0 };
      linha.pecas += t.quantidade;
      linha[p] += t.quantidade;
      porDia.set(dia, linha);
      const r = porReferencia.get(t.referencia) ?? { referencia: t.referencia, nome: t.nome_item, pecas: 0 };
      r.pecas += t.quantidade;
      porReferencia.set(t.referencia, r);
    }
  }

  const dias = Array.from(porDia.values()).sort((a, b) => a.data.localeCompare(b.data));
  return {
    porDia: dias,
    porReferencia: Array.from(porReferencia.values()).sort((a, b) => b.pecas - a.pecas),
    total: dias.reduce((s, d) => s + d.pecas, 0),
  };
}
