import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { respostaErro } from "@/lib/producao-api";
import { TipoOcorrencia, tipoDaOcorrencia } from "@/lib/producao";

const SQL_TIPO = "alter table ocorrencias add column if not exists tipo text;";
const semColuna = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const inicio = req.nextUrl.searchParams.get("inicio");
    const fim = req.nextUrl.searchParams.get("fim");
    const supabase = getSupabaseServer();
    const buscar = (campos: string) => {
      let consulta = supabase.from("ocorrencias").select(campos).order("data", { ascending: false }).limit(500);
      if (inicio) consulta = consulta.gte("data", inicio);
      if (fim) consulta = consulta.lte("data", fim);
      return consulta;
    };
    let resp = await buscar("id, costureira_id, data, minutos, descricao, tipo");
    if (semColuna(resp.error)) resp = await buscar("id, costureira_id, data, minutos, descricao");
    if (resp.error) throw resp.error;
    // as antigas, sem tipo, recebem o tipo deduzido
    const ocorrencias = ((resp.data ?? []) as unknown as { minutos: number; costureira_id: number | null; tipo?: string | null }[]).map(
      (o) => ({ ...o, tipo: tipoDaOcorrencia(o as Parameters<typeof tipoDaOcorrencia>[0]) })
    );
    return NextResponse.json({ ocorrencias });
  } catch (err) {
    return respostaErro(err);
  }
}

// Sem costureira = ocorrência vale para a fábrica toda (ex: falta de luz, feriado).
// Com várias costureiras (costureira_ids), cria uma ocorrência para cada uma. Os minutos podem
// vir por costureira (minutos_por_costureira), para lançar "dia inteiro" com a jornada de cada uma.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = String(body.data ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return respostaErro(new Error("Informe a data"), 400);
    const descricao = String(body.descricao ?? "").trim() || null;

    const ids: number[] = Array.isArray(body.costureira_ids)
      ? Array.from(new Set(body.costureira_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
      : body.costureira_id
        ? [Number(body.costureira_id)]
        : [];
    const porCostureira: Record<string, number> = body.minutos_por_costureira ?? {};
    const minutosDe = (id: number | null) =>
      Math.round(Number(id !== null && porCostureira[String(id)] !== undefined ? porCostureira[String(id)] : body.minutos));

    const tipoPedido = String(body.tipo ?? "");
    const tipo: TipoOcorrencia | null =
      tipoPedido === "ausencia" || tipoPedido === "parada" || tipoPedido === "conserto" || tipoPedido === "extra"
        ? tipoPedido
        : null;
    if (tipo === "ausencia" && !ids.length) {
      return respostaErro(new Error("Falta ou saída é de uma costureira: escolha quem faltou."), 400);
    }
    if (tipo === "conserto" && !ids.length) {
      return respostaErro(new Error("Escolha quem fez o conserto no campo Costureiras."), 400);
    }
    // o sinal vem do tipo: hora extra soma, falta, parada e conserto tiram
    const sinal = (m: number) => (tipo ? (tipo === "extra" ? Math.abs(m) : -Math.abs(m)) : m);
    const linhas = (ids.length ? ids : [null]).map((id) => ({
      costureira_id: id,
      data,
      minutos: sinal(minutosDe(id)),
      descricao,
      ...(tipo ? { tipo } : {}),
    }));
    if (linhas.some((l) => !l.minutos)) {
      return respostaErro(new Error("Informe os minutos (positivo aumenta, negativo reduz)"), 400);
    }

    const supabase = getSupabaseServer();
    let { error } = await supabase.from("ocorrencias").insert(linhas);
    if (semColuna(error)) {
      // banco ainda sem a coluna "tipo": grava sem ela se o tipo for o que a regra antiga deduz
      const bate = linhas.every((l) => !tipo || tipoDaOcorrencia({ ...l, tipo: null }) === tipo);
      if (!bate) {
        return respostaErro(new Error(`Para registrar esse tipo, falta preparar o banco. Rode no Supabase (SQL Editor): ${SQL_TIPO}`), 400);
      }
      ({ error } = await supabase.from("ocorrencias").insert(linhas.map(({ costureira_id, data, minutos, descricao }) => ({ costureira_id, data, minutos, descricao }))));
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, criadas: linhas.length });
  } catch (err) {
    return respostaErro(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("ocorrencias").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
