import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";
import { formatarData, idDoCodigo } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS =
  "id, ticket_id, nome_operacao, maquina, parte, ordem, tempo_minutos, quantidade, minutos_total, costureira_id, data_producao, apontado_em, tickets(op, referencia, nome_item, cor, tamanho)";

type LinhaBanco = {
  tickets: unknown;
  tempo_minutos: number | string;
  minutos_total: number | string;
  [k: string]: unknown;
};

function achatar(linha: LinhaBanco) {
  const { tickets, ...resto } = linha;
  return {
    ...resto,
    tempo_minutos: Number(linha.tempo_minutos),
    minutos_total: Number(linha.minutos_total),
    ticket: tickets,
  };
}

// ?costureira_id=1&data=YYYY-MM-DD → operações apontadas para ela nesse dia
export async function GET(req: NextRequest) {
  try {
    const costureiraId = Number(req.nextUrl.searchParams.get("costureira_id"));
    const data = req.nextUrl.searchParams.get("data");
    if (!costureiraId || !data) return respostaErro(new Error("Informe costureira e data"), 400);

    const supabase = getSupabaseServer();
    const { data: linhas, error } = await supabase
      .from("ticket_operacoes")
      .select(CAMPOS)
      .eq("costureira_id", costureiraId)
      .eq("data_producao", data)
      .order("apontado_em", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ apontamentos: (linhas ?? []).map((l) => achatar(l as LinhaBanco)) });
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { codigo, costureira_id, data }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = idDoCodigo(String(body.codigo ?? ""));
    const costureiraId = Number(body.costureira_id);
    const data = String(body.data ?? "");
    if (!id) return respostaErro(new Error(`Código inválido: "${body.codigo}"`), 400);
    if (!costureiraId) return respostaErro(new Error("Selecione a costureira"), 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return respostaErro(new Error("Informe a data"), 400);

    const supabase = getSupabaseServer();
    const { data: atual, error: erroBusca } = await supabase
      .from("ticket_operacoes")
      .select("id, nome_operacao, costureira_id, data_producao, costureiras(nome)")
      .eq("id", id)
      .maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!atual) return respostaErro(new Error(`Ticket ${body.codigo} não encontrado`), 404);
    if (atual.costureira_id) {
      const quem = (atual.costureiras as unknown as { nome: string } | null)?.nome ?? "outra costureira";
      return respostaErro(
        new Error(
          `"${atual.nome_operacao}" já foi apontada para ${quem} em ${formatarData(atual.data_producao ?? "")}`
        ),
        409
      );
    }

    // O filtro costureira_id is null evita apontamento duplo se dois leitores agirem ao mesmo tempo
    const { data: atualizado, error } = await supabase
      .from("ticket_operacoes")
      .update({ costureira_id: costureiraId, data_producao: data, apontado_em: new Date().toISOString() })
      .eq("id", id)
      .is("costureira_id", null)
      .select(CAMPOS)
      .maybeSingle();
    if (error) throw error;
    if (!atualizado) return respostaErro(new Error("Esse ticket acabou de ser apontado por outra pessoa"), 409);
    return NextResponse.json({ apontamento: achatar(atualizado as LinhaBanco) });
  } catch (err) {
    return respostaErro(err);
  }
}

// ?id=123 → desfaz o apontamento (o cupom volta a ficar pendente)
export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("ticket_operacoes")
      .update({ costureira_id: null, data_producao: null, apontado_em: null })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
