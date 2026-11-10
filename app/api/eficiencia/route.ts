import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { Costureira, Jornada, diasEntre, minutosJornada } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Dia = {
  data: string;
  jornada: number;
  ocorrencias: number;
  disponivel: number;
  produzido: number;
  operacoes: number;
  pecas: number;
};

// ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Eficiência = minutos produzidos (soma de quantidade × tempo de cada operação apontada)
//            ÷ minutos disponíveis (jornada do dia ± ocorrências)
export async function GET(req: NextRequest) {
  try {
    const inicio = req.nextUrl.searchParams.get("inicio") ?? "";
    const fim = req.nextUrl.searchParams.get("fim") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
      return respostaErro(new Error("Período inválido"), 400);
    }
    const dias = diasEntre(inicio, fim);

    const supabase = getSupabaseServer();
    const [costureirasResp, jornadaResp, ocorrenciasResp, producao] = await Promise.all([
      supabase.from("costureiras").select("id, nome, setor, jornada, ativa").order("nome"),
      supabase.from("jornada_padrao").select("dia_semana, minutos"),
      supabase.from("ocorrencias").select("costureira_id, data, minutos").gte("data", inicio).lte("data", fim),
      buscarTodos((de, ate) =>
        supabase
          .from("ticket_operacoes")
          .select("costureira_id, data_producao, quantidade, minutos_total")
          .not("costureira_id", "is", null)
          .gte("data_producao", inicio)
          .lte("data_producao", fim)
          .order("id")
          .range(de, ate)
      ),
    ]);
    if (costureirasResp.error) throw costureirasResp.error;
    if (jornadaResp.error) throw jornadaResp.error;
    if (ocorrenciasResp.error) throw ocorrenciasResp.error;

    const padrao: Jornada = {};
    for (const row of jornadaResp.data ?? []) padrao[String(row.dia_semana)] = row.minutos;

    const chave = (costureiraId: number | null, data: string) => `${costureiraId ?? "todas"}|${data}`;
    const ocorrencias = new Map<string, number>();
    for (const o of ocorrenciasResp.data ?? []) {
      const k = chave(o.costureira_id, o.data);
      ocorrencias.set(k, (ocorrencias.get(k) ?? 0) + o.minutos);
    }

    const produzido = new Map<string, { minutos: number; operacoes: number; pecas: number }>();
    for (const p of producao) {
      const k = chave(p.costureira_id, p.data_producao);
      const atual = produzido.get(k) ?? { minutos: 0, operacoes: 0, pecas: 0 };
      atual.minutos += Number(p.minutos_total);
      atual.operacoes += 1;
      atual.pecas += p.quantidade;
      produzido.set(k, atual);
    }
    const comProducao = new Set(producao.map((p) => p.costureira_id));

    const resultado = ((costureirasResp.data ?? []) as Costureira[])
      .filter((c) => c.ativa || comProducao.has(c.id))
      .map((c) => {
        const porDia: Dia[] = dias.map((data) => {
          const jornada = minutosJornada(c, padrao, data);
          const ocorr = (ocorrencias.get(chave(c.id, data)) ?? 0) + (ocorrencias.get(chave(null, data)) ?? 0);
          const prod = produzido.get(chave(c.id, data));
          return {
            data,
            jornada,
            ocorrencias: ocorr,
            disponivel: Math.max(0, jornada + ocorr),
            produzido: prod?.minutos ?? 0,
            operacoes: prod?.operacoes ?? 0,
            pecas: prod?.pecas ?? 0,
          };
        });
        const disponivel = porDia.reduce((s, d) => s + d.disponivel, 0);
        const produzidoTotal = porDia.reduce((s, d) => s + d.produzido, 0);
        return {
          id: c.id,
          nome: c.nome,
          setor: c.setor,
          ativa: c.ativa,
          disponivel,
          produzido: produzidoTotal,
          operacoes: porDia.reduce((s, d) => s + d.operacoes, 0),
          eficiencia: disponivel > 0 ? produzidoTotal / disponivel : null,
          dias: porDia.filter((d) => d.disponivel > 0 || d.produzido > 0 || d.ocorrencias !== 0),
        };
      });

    return NextResponse.json({ costureiras: resultado });
  } catch (err) {
    return respostaErro(err);
  }
}
