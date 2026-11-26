import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTodos, emBlocos } from "@/lib/producao-api";
import { Parte } from "@/lib/producao";

export type PecasDia = { data: string; pecas: number; conjuntos: number; superior: number; inferior: number };
export type PecasReferencia = { referencia: string; nome: string | null; pecas: number };
export type ResumoPecas = { porDia: PecasDia[]; porReferencia: PecasReferencia[]; total: number; totalConjuntos: number };

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
 * Peças e conjuntos prontos por dia.
 *
 * Peças: uma parte de um ticket fica pronta no dia em que o último cupom dela é apontado, e cada
 * parte pronta conta como peça (um ticket de 48 conjuntos com as duas partes dá 96 peças).
 *
 * Conjuntos: o pijama com todas as partes prontas. As partes se juntam por OP + referência + cor +
 * tamanho (ou só OP + referência + cor, quando as partes foram geradas com tamanhos diferentes,
 * ex.: a de cima por tamanho e a de baixo como "Único"). Em cada grupo, os conjuntos prontos até um
 * dia são o menor número de prontas entre as partes; o conjunto conta no dia em que a última parte
 * que faltava fica pronta. Item de uma parte só conta 1 conjunto por peça.
 *
 * ticketsDoPeriodo: tickets com algum cupom apontado no período (os únicos que podem ter ficado
 * prontos nele). As OPs deles são lidas inteiras, para saber o que já estava pronto antes.
 */
export async function calcularPecas(
  supabase: SupabaseClient,
  ticketsDoPeriodo: number[],
  inicio: string,
  fim: string
): Promise<ResumoPecas> {
  const vazio: ResumoPecas = { porDia: [], porReferencia: [], total: 0, totalConjuntos: 0 };
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

  const porDia = new Map<string, PecasDia>();
  const linhaDo = (dia: string) => {
    const l = porDia.get(dia) ?? { data: dia, pecas: 0, conjuntos: 0, superior: 0, inferior: 0 };
    porDia.set(dia, l);
    return l;
  };
  const dentro = (dia: string) => dia >= inicio && dia <= fim;

  // peças: cada parte pronta no período conta como peça
  const porReferencia = new Map<string, PecasReferencia>();
  for (const t of tickets) {
    for (const p of t.partes ?? []) {
      const dia = prontaEm.get(`${t.id}|${p}`);
      if (!dia || !dentro(dia)) continue;
      const linha = linhaDo(dia);
      linha.pecas += t.quantidade;
      linha[p] += t.quantidade;
      const r = porReferencia.get(t.referencia) ?? { referencia: t.referencia, nome: t.nome_item, pecas: 0 };
      r.pecas += t.quantidade;
      porReferencia.set(t.referencia, r);
    }
  }

  // conjuntos: junta as partes por OP + referência + cor (+ tamanho, quando as partes têm os mesmos tamanhos)
  const base = (t: TicketLido) => [t.op, t.referencia, t.cor ?? ""].join("|");
  const tamanhosPorParte = new Map<string, Map<Parte, Set<string>>>();
  for (const t of tickets) {
    const m = tamanhosPorParte.get(base(t)) ?? new Map<Parte, Set<string>>();
    for (const p of t.partes ?? []) {
      const s = m.get(p) ?? new Set<string>();
      s.add(t.tamanho ?? "");
      m.set(p, s);
    }
    tamanhosPorParte.set(base(t), m);
  }
  const porTamanho = new Map<string, boolean>();
  tamanhosPorParte.forEach((m, k) => {
    const conjuntos = Array.from(m.values()).map((s) => Array.from(s).sort().join(","));
    porTamanho.set(k, conjuntos.every((s) => s === conjuntos[0]));
  });

  type Grupo = { partes: Set<Parte>; dias: Map<string, Partial<Record<Parte, number>>> };
  const grupos = new Map<string, Grupo>();
  for (const t of tickets) {
    const k = porTamanho.get(base(t)) ? `${base(t)}|${t.tamanho ?? ""}` : base(t);
    const g = grupos.get(k) ?? { partes: new Set<Parte>(), dias: new Map() };
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
  grupos.forEach((g) => {
    const partes = Array.from(g.partes);
    if (!partes.length) return;
    const acumulado: Partial<Record<Parte, number>> = {};
    let antes = 0;
    for (const dia of Array.from(g.dias.keys()).sort()) {
      const doDia = g.dias.get(dia)!;
      for (const p of partes) acumulado[p] = (acumulado[p] ?? 0) + (doDia[p] ?? 0);
      const completos = Math.min(...partes.map((p) => acumulado[p] ?? 0));
      const novos = completos - antes;
      antes = completos;
      if (novos > 0 && dentro(dia)) linhaDo(dia).conjuntos += novos;
    }
  });

  const dias = Array.from(porDia.values()).sort((a, b) => a.data.localeCompare(b.data));
  return {
    porDia: dias,
    porReferencia: Array.from(porReferencia.values()).sort((a, b) => b.pecas - a.pecas),
    total: dias.reduce((s, d) => s + d.pecas, 0),
    totalConjuntos: dias.reduce((s, d) => s + d.conjuntos, 0),
  };
}
