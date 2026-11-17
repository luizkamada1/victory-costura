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
 * Peças produzidas por dia. Uma parte de um ticket fica pronta no dia em que o último cupom
 * dela é apontado. O pijama conta como peça produzida quando as partes dele estão prontas:
 * dentro de cada OP + referência + cor + tamanho, as peças completas são o menor número de
 * prontas entre as partes (quem só tem a parte de cima conta só por ela).
 *
 * ticketsDoPeriodo: tickets com algum cupom apontado no período (os únicos que podem ter
 * ficado prontos nele). As OPs deles são lidas inteiras, para somar o que já estava pronto antes.
 */
export async function calcularPecas(
  supabase: SupabaseClient,
  ticketsDoPeriodo: number[],
  inicio: string,
  fim: string
): Promise<ResumoPecas> {
  const vazio: ResumoPecas = { porDia: [], porReferencia: [], total: 0 };
  if (!ticketsDoPeriodo.length) return vazio;

  // OPs envolvidas
  const ops = new Set<string>();
  for (const bloco of emBlocos(Array.from(new Set(ticketsDoPeriodo)))) {
    const { data, error } = await supabase.from("tickets").select("op").in("id", bloco);
    if (error) throw error;
    for (const t of data ?? []) ops.add(t.op);
  }
  // todos os tickets dessas OPs e todos os cupons deles
  const tickets: TicketLido[] = [];
  for (const bloco of emBlocos(Array.from(ops), 100)) {
    tickets.push(
      ...(await buscarTodos<TicketLido>((de, ate) =>
        supabase
          .from("tickets")
          .select("id, op, referencia, nome_item, cor, tamanho, partes, quantidade")
          .in("op", bloco)
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

  // por grupo (mesma peça): quantas ficaram prontas em cada dia, por parte
  type Grupo = { referencia: string; nome: string | null; partes: Set<Parte>; dias: Map<string, Partial<Record<Parte, number>>> };
  const grupos = new Map<string, Grupo>();
  for (const t of tickets) {
    const k = [t.op, t.referencia, t.cor ?? "", t.tamanho ?? ""].join("|");
    const g = grupos.get(k) ?? { referencia: t.referencia, nome: t.nome_item, partes: new Set<Parte>(), dias: new Map() };
    for (const p of t.partes ?? []) {
      g.partes.add(p);
      const dia = prontaEm.get(`${t.id}|${p}`);
      if (!dia) continue;
      const doDia = g.dias.get(dia) ?? {};
      doDia[p] = (doDia[p] ?? 0) + t.quantidade;
      g.dias.set(dia, doDia);
    }
    grupos.set(k, g);
  }

  const porDia = new Map<string, PecasDia>();
  const porReferencia = new Map<string, PecasReferencia>();
  for (const g of Array.from(grupos.values())) {
    const partes = Array.from(g.partes);
    const acumulado: Partial<Record<Parte, number>> = {};
    let completasAntes = 0;
    for (const dia of Array.from(g.dias.keys()).sort()) {
      const doDia = g.dias.get(dia)!;
      for (const p of partes) acumulado[p] = (acumulado[p] ?? 0) + (doDia[p] ?? 0);
      const completas = Math.min(...partes.map((p) => acumulado[p] ?? 0));
      const novas = completas - completasAntes;
      completasAntes = completas;
      if (dia < inicio || dia > fim) continue;
      const linha = porDia.get(dia) ?? { data: dia, pecas: 0, superior: 0, inferior: 0 };
      linha.pecas += novas;
      linha.superior += doDia.superior ?? 0;
      linha.inferior += doDia.inferior ?? 0;
      porDia.set(dia, linha);
      if (novas > 0) {
        const r = porReferencia.get(g.referencia) ?? { referencia: g.referencia, nome: g.nome, pecas: 0 };
        r.pecas += novas;
        porReferencia.set(g.referencia, r);
      }
    }
  }

  const dias = Array.from(porDia.values()).sort((a, b) => a.data.localeCompare(b.data));
  return {
    porDia: dias,
    porReferencia: Array.from(porReferencia.values()).sort((a, b) => b.pecas - a.pecas),
    total: dias.reduce((s, d) => s + d.pecas, 0),
  };
}
