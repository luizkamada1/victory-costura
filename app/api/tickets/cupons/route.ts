import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { carregarAjustes, respostaErro } from "@/lib/producao-api";
import { Parte, fatorGrade } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OperacaoCadastro = { id: number; nome: string; tempo_minutos: number; maquina: string | null; parte: Parte };

// Carrega o ticket e a sequência atual de operações do item dele (só das partes do ticket),
// indicando quais já têm cupom no ticket. Usado para imprimir cupons avulsos: os que faltaram
// (operação incluída no item depois que o ticket foi gerado) ou os que se perderam.
async function carregar(ticketId: number) {
  const supabase = getSupabaseServer();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("id, op, item_id, referencia, nome_item, cor, tamanho, partes, quantidade")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!ticket) return { erro: `Ticket #${ticketId} não encontrado` } as const;
  if (!ticket.item_id) return { erro: `O item do ticket #${ticketId} foi excluído do cadastro` } as const;

  const [{ data: item, error: erroItem }, { data: vinculos, error: erroVinculos }, { data: cupons, error: erroCupons }] =
    await Promise.all([
      supabase.from("itens").select("id, grades").eq("id", ticket.item_id).maybeSingle(),
      supabase
        .from("item_operacoes")
        .select("ordem, operacoes(id, nome, tempo_minutos, maquina, parte)")
        .eq("item_id", ticket.item_id)
        .order("ordem"),
      supabase
        .from("ticket_operacoes")
        .select("id, operacao_id, ordem, costureira_id")
        .eq("ticket_id", ticketId),
    ]);
  if (erroItem) throw erroItem;
  if (erroVinculos) throw erroVinculos;
  if (erroCupons) throw erroCupons;

  const { ajustes } = await carregarAjustes(supabase);
  const fator = fatorGrade(item?.grades ?? [], ajustes);
  const partes = (ticket.partes ?? []) as Parte[];
  const ordemPorParte: Record<string, number> = {};
  const sequencia = (vinculos ?? [])
    .map((v) => v.operacoes as unknown as OperacaoCadastro | null)
    .filter((o): o is OperacaoCadastro => !!o && partes.includes(o.parte))
    .map((o) => {
      ordemPorParte[o.parte] = (ordemPorParte[o.parte] ?? 0) + 1;
      const cupom = (cupons ?? []).find((c) => c.operacao_id === o.id);
      return {
        operacao_id: o.id,
        nome: o.nome,
        maquina: o.maquina,
        parte: o.parte,
        ordem: ordemPorParte[o.parte],
        tempo_minutos: Math.round(Number(o.tempo_minutos) * fator * 10000) / 10000,
        cupom_id: cupom?.id ?? null,
        apontado: !!cupom?.costureira_id,
      };
    });
  return { ticket, sequencia } as const;
}

// ?ticket=149
export async function GET(req: NextRequest) {
  try {
    const ticketId = Number(req.nextUrl.searchParams.get("ticket"));
    if (!ticketId) return respostaErro(new Error("Informe o número do ticket"), 400);
    const r = await carregar(ticketId);
    if ("erro" in r) return respostaErro(new Error(r.erro), 404);
    return NextResponse.json(r);
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { ticket_id, operacao_ids: [..] } → cria os cupons que o ticket ainda não tem e devolve
// os ids de todos os cupons escolhidos (novos e já existentes), para imprimir.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticketId = Number(body.ticket_id);
    const escolhidas: number[] = (Array.isArray(body.operacao_ids) ? body.operacao_ids : []).map(Number);
    if (!ticketId) return respostaErro(new Error("Informe o número do ticket"), 400);
    if (!escolhidas.length) return respostaErro(new Error("Escolha ao menos uma operação"), 400);

    const r = await carregar(ticketId);
    if ("erro" in r) return respostaErro(new Error(r.erro), 404);
    const linhas = r.sequencia.filter((o) => escolhidas.includes(o.operacao_id));
    const novas = linhas.filter((o) => !o.cupom_id);

    let criados: number[] = [];
    if (novas.length) {
      const supabase = getSupabaseServer();
      const { data, error } = await supabase
        .from("ticket_operacoes")
        .insert(
          novas.map((o) => ({
            ticket_id: ticketId,
            operacao_id: o.operacao_id,
            nome_operacao: o.nome,
            maquina: o.maquina,
            parte: o.parte,
            ordem: o.ordem,
            tempo_minutos: o.tempo_minutos,
            quantidade: r.ticket.quantidade,
            minutos_total: Math.round(o.tempo_minutos * r.ticket.quantidade * 10000) / 10000,
          }))
        )
        .select("id");
      if (error) throw error;
      criados = (data ?? []).map((c) => c.id);
    }
    const existentes = linhas.filter((o) => o.cupom_id).map((o) => o.cupom_id as number);
    return NextResponse.json({ ok: true, cupons: [...existentes, ...criados], criados: criados.length });
  } catch (err) {
    return respostaErro(err);
  }
}
