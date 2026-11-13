import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { buscarTodos, carregarAjustes, emBlocos, respostaErro } from "@/lib/producao-api";
import { PARTES, Parte, fatorGrade } from "@/lib/producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// itens(grades): a grade vem do cadastro do item (o ticket não guarda), para sair no ticket impresso
const CAMPOS_TICKET = "id, op, item_id, referencia, nome_item, cor, tamanho, partes, quantidade, created_at, itens(grades)";
const CAMPOS_OPERACAO =
  "id, ticket_id, operacao_id, nome_operacao, maquina, parte, ordem, tempo_minutos, quantidade, minutos_total, costureira_id, data_producao, apontado_em";

// ?ids=1,2,3 → tickets completos (para imprimir)
// ?op=123     → filtra pela OP; sem filtro traz os 200 mais recentes
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const ids = (req.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => n > 0);
    const op = req.nextUrl.searchParams.get("op")?.trim();

    const buscar = (campos: string) => {
      let consulta = supabase.from("tickets").select(campos).order("id", { ascending: false });
      if (ids.length > 0) consulta = consulta.in("id", ids);
      else if (op) consulta = consulta.eq("op", op);
      return consulta.limit(ids.length > 0 ? ids.length : 200);
    };
    let resposta = await buscar(`${CAMPOS_TICKET}, impresso_em`);
    // enquanto o campo impresso_em não for criado no banco, a lista funciona sem ele
    if (resposta.error && resposta.error.code === "42703") resposta = await buscar(CAMPOS_TICKET);
    if (resposta.error) throw resposta.error;
    const tickets = resposta.data as unknown as { id: number }[] | null;

    const operacoes = [];
    for (const bloco of emBlocos((tickets ?? []).map((t) => t.id))) {
      operacoes.push(
        ...(await buscarTodos((de, ate) =>
          supabase
            .from("ticket_operacoes")
            .select(CAMPOS_OPERACAO)
            .in("ticket_id", bloco)
            .order("id")
            .range(de, ate)
        ))
      );
    }

    const porTicket = new Map<number, typeof operacoes>();
    for (const o of operacoes) {
      const lista = porTicket.get(o.ticket_id) ?? [];
      lista.push({ ...o, tempo_minutos: Number(o.tempo_minutos), minutos_total: Number(o.minutos_total) });
      porTicket.set(o.ticket_id, lista);
    }
    const resultado = (tickets ?? []).map((t) => {
      const { itens: item, ...resto } = t as { id: number; itens?: { grades?: string[] } | null };
      return { ...resto, grade: item?.grades?.[0] ?? null, operacoes: porTicket.get(t.id) ?? [] };
    });
    if (ids.length > 0) resultado.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return NextResponse.json({ tickets: resultado });
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { op, item_id, partes: ["superior"...], pecas_por_pacote?,
//         grupos: [{ cor, linhas: [{ tamanho, quantidade }] }] }
// (ou, no formato antigo, um só grupo: { cor, linhas })
// Gera um ticket por cor e tamanho (ou vários, se informado o tamanho do pacote).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const op = String(body.op ?? "").trim();
    const partes = (Array.isArray(body.partes) ? body.partes : []).filter((p: string) =>
      (PARTES as string[]).includes(p)
    ) as Parte[];
    const porPacote = Math.max(0, Math.floor(Number(body.pecas_por_pacote) || 0));
    type Linha = { cor: string | null; tamanho: string | null; quantidade: number };
    const gruposBrutos: { cor?: string; linhas?: { tamanho?: string; quantidade?: number }[] }[] = Array.isArray(body.grupos)
      ? body.grupos
      : [{ cor: body.cor, linhas: body.linhas }];
    const linhas: Linha[] = gruposBrutos.flatMap((g) =>
      (Array.isArray(g.linhas) ? g.linhas : [])
        .map((l) => ({
          cor: String(g.cor ?? "").trim() || null,
          tamanho: String(l.tamanho ?? "").trim() || null,
          quantidade: Math.floor(Number(l.quantidade) || 0),
        }))
        .filter((l) => l.quantidade > 0)
    );

    if (!op) return respostaErro(new Error("Informe a OP"), 400);
    if (!body.item_id) return respostaErro(new Error("Selecione a referência"), 400);
    if (partes.length === 0) return respostaErro(new Error("Selecione a parte"), 400);
    if (linhas.length === 0) return respostaErro(new Error("Informe a quantidade de ao menos uma cor e tamanho"), 400);

    const supabase = getSupabaseServer();
    const { data: item, error: erroItem } = await supabase
      .from("itens")
      .select("id, referencia, nome, grades")
      .eq("id", body.item_id)
      .single();
    if (erroItem) throw erroItem;

    const { data: vinculos, error: erroVinculos } = await supabase
      .from("item_operacoes")
      .select("ordem, operacoes(id, nome, tempo_minutos, maquina, parte)")
      .eq("item_id", item.id)
      .order("ordem");
    if (erroVinculos) throw erroVinculos;

    // O tempo cadastrado vale para a grade Adulto; as outras grades aplicam o seu percentual.
    // O tempo já ajustado fica gravado no ticket, então mudar o percentual depois não altera o histórico.
    const { ajustes } = await carregarAjustes(supabase);
    const fator = fatorGrade(item.grades, ajustes);

    type OperacaoCadastro = { id: number; nome: string; tempo_minutos: number; maquina: string | null; parte: Parte };
    const sequencia = (vinculos ?? [])
      .map((v) => v.operacoes as unknown as OperacaoCadastro | null)
      .filter((o): o is OperacaoCadastro => !!o && partes.includes(o.parte));
    if (sequencia.length === 0) {
      return respostaErro(new Error("Esse item não tem operações vinculadas para a parte selecionada"), 400);
    }

    // Quebra cada tamanho em pacotes, se pedido
    const pacotes: Linha[] = [];
    for (const l of linhas) {
      if (porPacote > 0 && l.quantidade > porPacote) {
        for (let resto = l.quantidade; resto > 0; resto -= porPacote) {
          pacotes.push({ ...l, quantidade: Math.min(porPacote, resto) });
        }
      } else {
        pacotes.push(l);
      }
    }
    if (pacotes.length > 300) return respostaErro(new Error("Muitos tickets de uma vez (máximo 300)"), 400);

    const { data: criados, error: erroTickets } = await supabase
      .from("tickets")
      .insert(
        pacotes.map((p) => ({
          op,
          item_id: item.id,
          referencia: item.referencia,
          nome_item: item.nome,
          cor: p.cor,
          tamanho: p.tamanho,
          partes,
          quantidade: p.quantidade,
        }))
      )
      .select("id, quantidade");
    if (erroTickets) throw erroTickets;

    const linhasOperacoes = [];
    for (const t of criados ?? []) {
      const ordemPorParte: Record<string, number> = {};
      for (const o of sequencia) {
        ordemPorParte[o.parte] = (ordemPorParte[o.parte] ?? 0) + 1;
        const tempo = Math.round(Number(o.tempo_minutos) * fator * 10000) / 10000;
        linhasOperacoes.push({
          ticket_id: t.id,
          operacao_id: o.id,
          nome_operacao: o.nome,
          maquina: o.maquina,
          parte: o.parte,
          ordem: ordemPorParte[o.parte],
          tempo_minutos: tempo,
          quantidade: t.quantidade,
          minutos_total: Math.round(tempo * t.quantidade * 10000) / 10000,
        });
      }
    }
    for (const bloco of emBlocos(linhasOperacoes, 1000)) {
      const { error } = await supabase.from("ticket_operacoes").insert(bloco);
      if (error) {
        await supabase.from("tickets").delete().in("id", (criados ?? []).map((t) => t.id));
        throw error;
      }
    }

    return NextResponse.json({ ok: true, ids: (criados ?? []).map((t) => t.id) });
  } catch (err) {
    return respostaErro(err);
  }
}

// ?id=123 → exclui um ticket; ?ids=1,2,3 → exclui vários.
// Tickets com cupons já apontados nunca são excluídos (a produção registrada se perderia):
// com um só, a resposta é um erro; com vários, eles são pulados e voltam em "bloqueados".
export async function DELETE(req: NextRequest) {
  try {
    const varios = req.nextUrl.searchParams.get("ids");
    const ids = (varios ?? req.nextUrl.searchParams.get("id") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => n > 0);
    if (ids.length === 0) return respostaErro(new Error("Nenhum ticket informado"), 400);

    const supabase = getSupabaseServer();
    const comApontamento = new Set<number>();
    for (const bloco of emBlocos(ids)) {
      const apontados = await buscarTodos((de, ate) =>
        supabase
          .from("ticket_operacoes")
          .select("ticket_id")
          .in("ticket_id", bloco)
          .not("costureira_id", "is", null)
          .order("id")
          .range(de, ate)
      );
      for (const a of apontados) comApontamento.add(a.ticket_id);
    }

    if (!varios && comApontamento.size) {
      return respostaErro(new Error("Esse ticket já tem operações apontadas. Desfaça os apontamentos antes."), 400);
    }

    const excluir = ids.filter((id) => !comApontamento.has(id));
    for (const bloco of emBlocos(excluir)) {
      const { error } = await supabase.from("tickets").delete().in("id", bloco);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, excluidos: excluir, bloqueados: Array.from(comApontamento) });
  } catch (err) {
    return respostaErro(err);
  }
}

// body: { ids: [1, 2, 3] } → marca os tickets como impressos (guarda só a primeira impressão)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n: number) => n > 0);
    if (ids.length === 0) return NextResponse.json({ ok: true });
    const supabase = getSupabaseServer();
    for (const bloco of emBlocos(ids)) {
      const { error } = await supabase
        .from("tickets")
        .update({ impresso_em: new Date().toISOString() })
        .in("id", bloco)
        .is("impresso_em", null);
      if (error) {
        if (error.code === "42703") {
          return respostaErro(new Error("O campo de impressão ainda não existe no banco. Rode o trecho novo do supabase_setup.sql."), 400);
        }
        throw error;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaErro(err);
  }
}
