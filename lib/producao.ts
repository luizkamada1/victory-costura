export type Parte = "superior" | "inferior";
export const PARTES: Parte[] = ["superior", "inferior"];
export const NOME_PARTE: Record<Parte, string> = {
  superior: "Parte Superior",
  inferior: "Parte Inferior",
};

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Tamanhos sugeridos ao marcar uma grade no cadastro de itens (editáveis depois)
export const GRADES: Record<string, string[]> = {
  Adulto: ["P", "M", "G", "GG"],
  "Plus Size": ["48", "50", "52", "54"],
  Juvenil: ["12", "14", "16"],
  Infantil: ["4", "6", "8", "10"],
};

// Ajuste do tempo por grade, em % sobre o tempo cadastrado (que vale para a grade Adulto).
// Estes são os valores iniciais; a fábrica muda em Operações → Ajuste de tempo por grade.
export type AjustesGrade = Record<string, number>;
export const AJUSTES_PADRAO: AjustesGrade = { Adulto: 0, "Plus Size": 10, Juvenil: -5, Infantil: -10 };

// Multiplicador do tempo para a grade do item (um item tem uma grade só; sem grade = 1)
export function fatorGrade(grades: string[] | undefined, ajustes: AjustesGrade) {
  const grade = grades?.[0];
  if (!grade) return 1;
  return 1 + (Number(ajustes[grade] ?? 0) || 0) / 100;
}

// jornada: chave = dia da semana ("0" = domingo), valor = minutos
export type Jornada = Record<string, number>;

export type Costureira = {
  id: number;
  nome: string;
  setor: string | null;
  jornada: Jornada | null;
  ativa: boolean;
};

export type Operacao = {
  id: number;
  nome: string;
  tempo_minutos: number;
  maquina: string | null;
  parte: Parte;
};

export type ItemOperacao = { operacao_id: number; ordem: number };

export type Item = {
  id: number;
  referencia: string;
  nome: string;
  grades: string[];
  tamanhos: string[];
  cores: string[];
  partes: Parte[];
  colecao?: string | null; // ausente enquanto o campo não existir no banco
  operacoes: ItemOperacao[];
};

export type TicketOperacao = {
  id: number;
  ticket_id: number;
  operacao_id: number | null;
  nome_operacao: string;
  maquina: string | null;
  parte: Parte;
  ordem: number;
  tempo_minutos: number;
  quantidade: number;
  minutos_total: number;
  costureira_id: number | null;
  data_producao: string | null;
  apontado_em: string | null;
};

export type Ticket = {
  id: number;
  op: string;
  item_id: number | null;
  referencia: string;
  nome_item: string | null;
  cor: string | null;
  tamanho: string | null;
  partes: Parte[];
  quantidade: number;
  created_at: string;
  impresso_em?: string | null; // primeira impressão; ausente enquanto o campo não existir no banco
  grade?: string | null; // grade do item (Adulto, Plus Size...), vinda do cadastro do item
  operacoes: TicketOperacao[];
};

export type TipoOcorrencia = "ausencia" | "parada" | "conserto" | "extra";

export type Ocorrencia = {
  id: number;
  costureira_id: number | null;
  data: string;
  minutos: number;
  descricao: string | null;
  tipo?: TipoOcorrencia | null; // ausente/nulo nas ocorrências antigas
};

export const TIPOS_OCORRENCIA: Record<TipoOcorrencia, { nome: string; dica: string }> = {
  ausencia: { nome: "Falta ou saída", dica: "A costureira se ausentou. Conta como ausência e baixa a produtividade." },
  parada: { nome: "Parada", dica: "Falta de luz, máquina quebrada, reunião, sem expediente. Não afeta a produtividade." },
  conserto: {
    nome: "Conserto de oficina",
    dica: "Consertando serviço que veio de oficina externa. Não afeta a eficiência nem a produtividade dela.",
  },
  extra: { nome: "Hora extra", dica: "Tempo trabalhado além da jornada." },
};

// Oficina/OP do conserto: o motivo sem o horário que o formulário acrescenta ("Oficina X (10:00 às 11:30)")
export function oficinaDoConserto(descricao: string | null | undefined) {
  const limpo = String(descricao ?? "")
    .replace(/^Das \d.*$/, "")
    .replace(/\s*\([^()]*\)\s*$/, "")
    .trim();
  return limpo || "Sem oficina informada";
}

// Ocorrências antigas não têm tipo: deduz pela regra de antes
// (somar = hora extra; tirar de uma costureira = ausência; tirar da fábrica toda = parada)
export function tipoDaOcorrencia(o: Pick<Ocorrencia, "minutos" | "costureira_id" | "tipo">): TipoOcorrencia {
  if (o.tipo === "ausencia" || o.tipo === "parada" || o.tipo === "conserto" || o.tipo === "extra") return o.tipo;
  if (o.minutos > 0) return "extra";
  return o.costureira_id ? "ausencia" : "parada";
}

// O código de barras impresso é o id do cupom com 8 dígitos
export function codigoBarras(ticketOperacaoId: number) {
  return String(ticketOperacaoId).padStart(8, "0");
}

export function idDoCodigo(codigo: string): number | null {
  const limpo = codigo.trim();
  if (!/^\d{1,8}$/.test(limpo)) return null;
  const id = Number(limpo);
  return id > 0 ? id : null;
}

// Datas sempre no formato "YYYY-MM-DD", tratadas em UTC para não sofrer com fuso
export function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Data "YYYY-MM-DD" no horário de Brasília (o servidor roda em UTC)
export function dataBrasilia(instante: Date | string = new Date()) {
  return new Date(instante).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function diaSemana(dataISO: string) {
  return new Date(dataISO + "T00:00:00Z").getUTCDay();
}

export function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(inicio + "T00:00:00Z");
  const f = new Date(fim + "T00:00:00Z");
  while (d <= f && dias.length < 400) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

export function formatarData(dataISO: string) {
  const [a, m, d] = dataISO.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatarMinutos(min: number) {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${h}h${String(m).padStart(2, "0")}`;
}

export function minutosJornada(costureira: Pick<Costureira, "jornada">, padrao: Jornada, dataISO: string) {
  const dia = String(diaSemana(dataISO));
  const fonte = costureira.jornada ?? padrao;
  return Number(fonte[dia] ?? 0) || 0;
}

// Verde a partir de 85%, amarelo a partir de 65%, vermelho abaixo
export function corEficiencia(ef: number | null) {
  if (ef === null) return "var(--tinta-3)";
  if (ef >= 0.85) return "var(--ok)";
  if (ef >= 0.65) return "var(--alerta)";
  return "var(--erro)";
}

// Horários de trabalho de um dia: lista de [início, fim] em "HH:MM"
export type Periodo = [string, string];
export type HorariosSemana = Record<string, Periodo[]>;

export function minutosDoHorario(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Confere os períodos de um dia: cada um termina depois de começar e eles não se sobrepõem
export function problemaHorarios(periodos: Periodo[]): string | null {
  const faixas: [number, number][] = [];
  for (const [ini, fim] of periodos) {
    const a = minutosDoHorario(ini);
    const b = minutosDoHorario(fim);
    if (a === null || b === null) return "Preencha início e fim de cada período.";
    if (b <= a) return `O período ${ini} a ${fim} termina antes de começar.`;
    faixas.push([a, b]);
  }
  faixas.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i][0] < faixas[i - 1][1]) return "Há períodos que se sobrepõem.";
  }
  return null;
}

// Minutos trabalhados no dia (soma dos períodos válidos)
export function minutosDosPeriodos(periodos: Periodo[]): number {
  return periodos.reduce((s, [ini, fim]) => {
    const a = minutosDoHorario(ini);
    const b = minutosDoHorario(fim);
    return a !== null && b !== null && b > a ? s + (b - a) : s;
  }, 0);
}

// Minutos de [início, fim] que caem dentro dos períodos de trabalho (os intervalos ficam de fora).
// Ex: 10:00 às 15:00 numa segunda (07:30–09:30, 09:45–12:00, 13:00–15:30, 15:45–17:30) = 120 + 120 = 240
export function minutosDentroDosPeriodos(inicio: string, fim: string, periodos: Periodo[]): number {
  const a = minutosDoHorario(inicio);
  const b = minutosDoHorario(fim);
  if (a === null || b === null || b <= a) return 0;
  return periodos.reduce((s, [pi, pf]) => {
    const x = minutosDoHorario(pi);
    const y = minutosDoHorario(pf);
    if (x === null || y === null) return s;
    return s + Math.max(0, Math.min(b, y) - Math.max(a, x));
  }, 0);
}
