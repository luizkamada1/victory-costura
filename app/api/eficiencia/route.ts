import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, respostaErro } from "@/lib/producao-api";
import { calcularPecas } from "@/lib/pecas";
import { Costureira, Jornada, dataBrasilia, diasEntre, minutosJornada, tipoDaOcorrencia } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Dia = {
  data: string;
  jornada: number;
  ocorrencias: number;
  disponivel: number;
  previsto: number;
  ausencias: number;
  produzido: number;
  operacoes: number;
  pecas: number;
};

// ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Eficiência = minutos produzidos (soma de quantidade × tempo de cada operação apontada)
//            ÷ minutos disponíveis (jornada do dia ± ocorrências)
// Produtividade = minutos produzidos ÷ minutos previstos, que não descontam as ausências dela
//            (ocorrências do tipo "Falta ou saída"). Paradas (falta de luz, máquina, reunião,
//            sem expediente) e horas extras contam nas duas.
//
// A jornada só conta nos dias em que a costureira estava no sistema: a partir do primeiro
// apontamento da fábrica (antes disso o sistema não era usado) ou do cadastro dela, o que for
// mais tarde. Se ela tiver produção apontada antes disso, conta desde ela.
// E só até o último dia que já tem apontamento na fábrica: a produção é apontada no dia seguinte,
// então hoje (e qualquer dia ainda não apontado) não entra com jornada e produção zerada.
export async function GET(req: NextRequest) {
  try {
    const inicio = req.nextUrl.searchParams.get("inicio") ?? "";
    const fim = req.nextUrl.searchParams.get("fim") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || inicio > fim) {
      return respostaErro(new Error("Período inválido"), 400);
    }
    const dias = diasEntre(inicio, fim);

    const supabase = getSupabaseServer();
    const [costureirasResp, jornadaResp, ocorrenciasResp, producao, primeiroResp, ultimoResp] = await Promise.all([
      supabase.from("costureiras").select("id, nome, setor, jornada, ativa, created_at").order("nome"),
      supabase.from("jornada_padrao").select("dia_semana, minutos"),
      supabase.from("ocorrencias").select("costureira_id, data, minutos, tipo").gte("data", inicio).lte("data", fim),
      buscarTodos((de, ate) =>
        supabase
          .from("ticket_operacoes")
          .select("ticket_id, costureira_id, data_producao, quantidade, minutos_total")
          .not("costureira_id", "is", null)
          .gte("data_producao", inicio)
          .lte("data_producao", fim)
          .order("id")
          .range(de, ate)
      ),
      supabase
        .from("ticket_operacoes")
        .select("data_producao")
        .not("data_producao", "is", null)
        .order("data_producao")
        .limit(1),
      supabase
        .from("ticket_operacoes")
        .select("data_producao")
        .not("data_producao", "is", null)
        .order("data_producao", { ascending: false })
        .limit(1),
    ]);
    if (costureirasResp.error) throw costureirasResp.error;
    if (jornadaResp.error) throw jornadaResp.error;
    // banco ainda sem a coluna "tipo": busca sem ela (o tipo é deduzido)
    let ocorrenciasLidas = ocorrenciasResp.data as { costureira_id: number | null; data: string; minutos: number; tipo?: string | null }[] | null;
    if (ocorrenciasResp.error?.code === "42703") {
      const r = await supabase.from("ocorrencias").select("costureira_id, data, minutos").gte("data", inicio).lte("data", fim);
      if (r.error) throw r.error;
      ocorrenciasLidas = r.data;
    } else if (ocorrenciasResp.error) throw ocorrenciasResp.error;
    if (primeiroResp.error) throw primeiroResp.error;
    if (ultimoResp.error) throw ultimoResp.error;

    const hoje = dataBrasilia();
    const inicioSistema: string | null = primeiroResp.data?.[0]?.data_producao ?? null;
    const ultimoApontado: string | null = ultimoResp.data?.[0]?.data_producao ?? null;
    // último dia em que a jornada conta
    const limite = ultimoApontado && ultimoApontado < hoje ? ultimoApontado : hoje;
    const primeiraProducao = new Map<number, string>();
    for (const p of producao) {
      const atual = primeiraProducao.get(p.costureira_id);
      if (!atual || p.data_producao < atual) primeiraProducao.set(p.costureira_id, p.data_producao);
    }

    const padrao: Jornada = {};
    for (const row of jornadaResp.data ?? []) padrao[String(row.dia_semana)] = row.minutos;

    const chave = (costureiraId: number | null, data: string) => `${costureiraId ?? "todas"}|${data}`;
    // separadas em ausências (só tiram da eficiência) e o resto (paradas e horas extras, contam nas duas)
    const ocorrencias = new Map<string, { ausencia: number; outras: number }>();
    for (const o of ocorrenciasLidas ?? []) {
      const k = chave(o.costureira_id, o.data);
      const atual = ocorrencias.get(k) ?? { ausencia: 0, outras: 0 };
      if (tipoDaOcorrencia(o as Parameters<typeof tipoDaOcorrencia>[0]) === "ausencia") atual.ausencia += o.minutos;
      else atual.outras += o.minutos;
      ocorrencias.set(k, atual);
    }
    const soma = (o?: { ausencia: number; outras: number }) => (o ? o.ausencia + o.outras : 0);

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

    const resultado = ((costureirasResp.data ?? []) as (Costureira & { created_at: string })[])
      .filter((c) => c.ativa || comProducao.has(c.id))
      .map((c) => {
        // primeiro dia em que a jornada dela conta (sem nenhum apontamento na fábrica, nenhum dia conta)
        const cadastro = dataBrasilia(c.created_at);
        let inicioDela = inicioSistema === null ? null : cadastro > inicioSistema ? cadastro : inicioSistema;
        const prod1 = primeiraProducao.get(c.id);
        if (prod1 && (inicioDela === null || prod1 < inicioDela)) inicioDela = prod1;

        const porDia: Dia[] = dias.map((data) => {
          const conta = inicioDela !== null && data >= inicioDela && data <= limite;
          const jornada = conta ? minutosJornada(c, padrao, data) : 0;
          const dela = conta ? ocorrencias.get(chave(c.id, data)) : undefined;
          const geral = conta ? soma(ocorrencias.get(chave(null, data))) : 0;
          const ocorr = soma(dela) + geral;
          const previsto = Math.max(0, jornada + geral + (dela?.outras ?? 0));
          const disponivel = Math.max(0, jornada + ocorr);
          const prod = produzido.get(chave(c.id, data));
          return {
            data,
            jornada,
            ocorrencias: ocorr,
            disponivel,
            previsto,
            ausencias: previsto - disponivel,
            produzido: prod?.minutos ?? 0,
            operacoes: prod?.operacoes ?? 0,
            pecas: prod?.pecas ?? 0,
          };
        });
        const disponivel = porDia.reduce((s, d) => s + d.disponivel, 0);
        const produzidoTotal = porDia.reduce((s, d) => s + d.produzido, 0);
        const previsto = porDia.reduce((s, d) => s + d.previsto, 0);
        return {
          id: c.id,
          nome: c.nome,
          setor: c.setor,
          ativa: c.ativa,
          disponivel,
          previsto,
          ausencias: porDia.reduce((s, d) => s + d.ausencias, 0),
          produzido: produzidoTotal,
          operacoes: porDia.reduce((s, d) => s + d.operacoes, 0),
          eficiencia: disponivel > 0 ? produzidoTotal / disponivel : null,
          produtividade: previsto > 0 ? produzidoTotal / previsto : null,
          dias: porDia.filter((d) => d.previsto > 0 || d.disponivel > 0 || d.produzido > 0 || d.ocorrencias !== 0),
        };
      });

    // peças produzidas (equipe toda), só até o último dia apontado
    const pecas = await calcularPecas(
      supabase,
      producao.map((p) => p.ticket_id),
      inicio,
      fim < limite ? fim : limite
    );

    return NextResponse.json({ costureiras: resultado, ultimoApontado, pecas });
  } catch (err) {
    return respostaErro(err);
  }
}
