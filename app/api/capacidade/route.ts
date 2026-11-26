import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { Costureira, Jornada, Parte, contaNosIndicadores, dataBrasilia, diasEntre } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TicketLido = {
  id: number;
  op: string;
  referencia: string;
  cor: string | null;
  tamanho: string | null;
  partes: Parte[];
  quantidade: number;
  created_at: string;
};
type CupomLido = { ticket_id: number; minutos_total: number | string; costureira_id: number | null; data_producao: string | null };

export type DiaCapacidade = { data: string; entrada: number; saida: number; fila: number; filaDias: number | null };

// ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// A costura está dando conta? Entrada = minutos de costura dos tickets gerados no dia;
// saída = minutos dos cupons apontados no dia; fila = o que entrou e ainda não saiu, ao fim de cada dia.
// A fila em dias usa a capacidade diária: costureiras ativas × jornada média de um dia de trabalho.
export async function GET(req: NextRequest) {
  try {
    const inicio = req.nextUrl.searchParams.get("inicio") ?? "";
    const fim = req.nextUrl.searchParams.get("fim") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
      return respostaErro(new Error("Período inválido"), 400);
    }
    const supabase = getSupabaseServer();
    const [tickets, cupons, costureirasResp, jornadaResp] = await Promise.all([
      buscarTodos<TicketLido>((de, ate) =>
        supabase
          .from("tickets")
          .select("id, op, referencia, cor, tamanho, partes, quantidade, created_at")
          .order("id")
          .range(de, ate)
      ),
      buscarTodos<CupomLido>((de, ate) =>
        supabase.from("ticket_operacoes").select("ticket_id, minutos_total, costureira_id, data_producao").order("id").range(de, ate)
      ),
      supabase.from("costureiras").select("*"),
      supabase.from("jornada_padrao").select("dia_semana, minutos"),
    ]);
    if (costureirasResp.error) throw costureirasResp.error;
    if (jornadaResp.error) throw jornadaResp.error;

    // capacidade de um dia de trabalho
    const padrao: Jornada = {};
    for (const r of jornadaResp.data ?? []) padrao[String(r.dia_semana)] = r.minutos;
    const mediaDia = (j: Jornada) => {
      const dias = Object.values(j).map(Number).filter((v) => v > 0);
      return dias.length ? dias.reduce((s, v) => s + v, 0) / dias.length : 0;
    };
    const ativas = ((costureirasResp.data ?? []) as Costureira[]).filter((c) => c.ativa && contaNosIndicadores(c));
    const apoio = new Set(((costureirasResp.data ?? []) as Costureira[]).filter((c) => !contaNosIndicadores(c)).map((c) => c.id));
    const capacidadeDia = ativas.reduce((s, c) => s + mediaDia(c.jornada ?? padrao), 0);

    const hoje = dataBrasilia();
    // a saída só é conhecida até o último dia apontado (os apontamentos são feitos no dia seguinte)
    const ultimoApontado = cupons.reduce<string | null>(
      (m, c) =>
        c.costureira_id !== null && !apoio.has(c.costureira_id) && c.data_producao && (!m || c.data_producao > m) ? c.data_producao : m,
      null
    );
    const limite = [fim, hoje, ultimoApontado ?? hoje].sort()[0];

    const geradoEm = new Map(tickets.map((t) => [t.id, dataBrasilia(t.created_at)]));
    const entradaDia = new Map<string, number>();
    const saidaDia = new Map<string, number>();
    let filaAgora = 0;
    for (const c of cupons) {
      const min = Number(c.minutos_total) || 0;
      const gerado = geradoEm.get(c.ticket_id);
      if (gerado) entradaDia.set(gerado, (entradaDia.get(gerado) ?? 0) + min);
      if (c.costureira_id !== null && c.data_producao) saidaDia.set(c.data_producao, (saidaDia.get(c.data_producao) ?? 0) + min);
      if (c.costureira_id === null) filaAgora += min;
    }

    // fila ao fim do dia anterior ao período: tudo o que entrou antes menos tudo o que saiu antes
    let fila = 0;
    for (const [d, v] of Array.from(entradaDia.entries())) if (d < inicio) fila += v;
    for (const [d, v] of Array.from(saidaDia.entries())) if (d < inicio) fila -= v;
    const filaInicio = fila;

    const emDias = (m: number) => (capacidadeDia > 0 ? m / capacidadeDia : null);
    const dias: DiaCapacidade[] = [];
    let entrou = 0;
    let saiu = 0;
    if (limite >= inicio) {
      for (const data of diasEntre(inicio, limite)) {
        const entrada = entradaDia.get(data) ?? 0;
        const saida = saidaDia.get(data) ?? 0;
        fila += entrada - saida;
        entrou += entrada;
        saiu += saida;
        dias.push({ data, entrada, saida, fila: Math.max(0, fila), filaDias: emDias(Math.max(0, fila)) });
      }
    }

    // peças que entraram: tickets gerados no período; como na saída, cada parte (de cima, de baixo) conta como peça
    let pecasEntrada = 0;
    for (const t of tickets) {
      const d = geradoEm.get(t.id)!;
      if (d < inicio || d > limite) continue;
      pecasEntrada += t.quantidade * (t.partes?.length ?? 0);
    }

    return NextResponse.json({
      dias,
      entrou,
      saiu,
      saldo: entrou - saiu,
      pecasEntrada,
      filaInicio: Math.max(0, filaInicio),
      filaInicioDias: emDias(Math.max(0, filaInicio)),
      filaAgora,
      filaAgoraDias: emDias(filaAgora),
      capacidadeDia,
      limite,
    });
  } catch (err) {
    return respostaErro(err);
  }
}
