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
  operacoes: TicketOperacao[];
};

export type Ocorrencia = {
  id: number;
  costureira_id: number | null;
  data: string;
  minutos: number;
  descricao: string | null;
};

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
