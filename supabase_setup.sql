-- Módulo "Produtividade da Costura": cadastro de costureiras, operações e itens,
-- geração de tickets com código de barras por operação, apontamento diário e
-- cálculo de eficiência (minutos produzidos ÷ minutos disponíveis).

-- Jornada padrão da empresa: minutos de trabalho em cada dia da semana
-- (0 = domingo, 1 = segunda ... 6 = sábado).
create table if not exists jornada_padrao (
  dia_semana smallint primary key check (dia_semana between 0 and 6),
  minutos integer not null default 0
);
insert into jornada_padrao (dia_semana, minutos) values
  (0, 0), (1, 528), (2, 528), (3, 528), (4, 528), (5, 528), (6, 0)
on conflict (dia_semana) do nothing;

-- jornada: null = usa a jornada padrão; senão objeto {"0":0,"1":528,...}
create table if not exists costureiras (
  id bigint generated always as identity primary key,
  nome text not null,
  setor text,
  jornada jsonb,
  ativa boolean not null default true,
  created_at timestamptz default now()
);

-- tempo_minutos: tempo padrão para fazer a operação em UMA peça (ex: 0.45)
-- parte: 'superior' | 'inferior'
create table if not exists operacoes (
  id bigint generated always as identity primary key,
  nome text not null,
  tempo_minutos numeric(10,4) not null default 0,
  maquina text,
  parte text not null check (parte in ('superior', 'inferior')),
  created_at timestamptz default now()
);

-- partes: '{superior}', '{inferior}' ou '{superior,inferior}'
create table if not exists itens (
  id bigint generated always as identity primary key,
  referencia text not null unique,
  nome text not null,
  grades text[] not null default '{}',
  tamanhos text[] not null default '{}',
  cores text[] not null default '{}',
  partes text[] not null default '{}',
  created_at timestamptz default now()
);

-- Sequência de operações de cada item (a parte vem da própria operação)
create table if not exists item_operacoes (
  id bigint generated always as identity primary key,
  item_id bigint not null references itens(id) on delete cascade,
  operacao_id bigint not null references operacoes(id) on delete cascade,
  ordem integer not null
);
create index if not exists idx_item_operacoes_item on item_operacoes (item_id);

create table if not exists tickets (
  id bigint generated always as identity primary key,
  op text not null,
  item_id bigint references itens(id) on delete set null,
  referencia text not null,
  nome_item text,
  cor text,
  tamanho text,
  partes text[] not null default '{}',
  quantidade integer not null,
  created_at timestamptz default now()
);
create index if not exists idx_tickets_op on tickets (op);

-- Cada linha é um "cupom" do ticket com código de barras próprio (o código
-- impresso é o id com 8 dígitos). Os dados da operação são copiados no momento
-- da geração para que mudanças futuras no cadastro não alterem o histórico.
-- costureira_id / data_producao ficam preenchidos depois do apontamento.
create table if not exists ticket_operacoes (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  operacao_id bigint references operacoes(id) on delete set null,
  nome_operacao text not null,
  maquina text,
  parte text not null,
  ordem integer not null,
  tempo_minutos numeric(10,4) not null,
  quantidade integer not null,
  minutos_total numeric(12,4) not null,
  costureira_id bigint references costureiras(id) on delete restrict,
  data_producao date,
  apontado_em timestamptz
);
create index if not exists idx_ticket_operacoes_ticket on ticket_operacoes (ticket_id);
create index if not exists idx_ticket_operacoes_apont on ticket_operacoes (costureira_id, data_producao);

-- Ocorrências que aumentam (+) ou reduzem (−) os minutos disponíveis num dia.
-- costureira_id null = vale para todas as costureiras (ex: falta de luz, feriado).
create table if not exists ocorrencias (
  id bigint generated always as identity primary key,
  costureira_id bigint references costureiras(id) on delete cascade,
  data date not null,
  minutos integer not null,
  descricao text,
  created_at timestamptz default now()
);
create index if not exists idx_ocorrencias_data on ocorrencias (data);

-- Ajuste do tempo das operações por grade, em % sobre o tempo cadastrado (que vale
-- para a grade Adulto). Ex: Plus Size +10 = tempo × 1,10; Infantil -10 = tempo × 0,90.
-- O ajuste é aplicado ao gerar os tickets e fica gravado no ticket.
create table if not exists ajustes_grade (
  grade text primary key,
  percentual numeric(6,2) not null default 0
);
insert into ajustes_grade (grade, percentual) values
  ('Adulto', 0), ('Plus Size', 10), ('Juvenil', -5), ('Infantil', -10)
on conflict (grade) do nothing;
alter table ajustes_grade enable row level security;
