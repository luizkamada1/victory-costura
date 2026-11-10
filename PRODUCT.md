# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Líder da costura (usuária principal):** no fim do dia recebe os cupons destacados de cada costureira e faz o apontamento num PC da fábrica com leitor de código de barras USB. Também emite e imprime os tickets das OPs.
- **Dono / gestão no escritório:** cadastra a base (operações, tempos, itens, jornada) e acompanha a eficiência por período para ver quem está abaixo do esperado e onde ajustar.
- **Costureiras (público indireto):** até ~20 pessoas. Não usam o sistema diretamente, mas veem o próprio resultado de eficiência que a gestão mostra a elas.

## Product Purpose

Controlar a produção da Costura Interna da Victory Pijamas com tickets de código de barras. Cada operação de cada ticket é um cupom destacável; a costureira entrega os cupons do que fez, a líder escaneia e o sistema calcula a eficiência de cada uma.

Eficiência = minutos produzidos (quantidade × tempo padrão de cada operação apontada) ÷ minutos disponíveis (jornada do dia ± ocorrências).

Sucesso: apontar os cupons do dia de forma rápida e sem erro, e ter números de eficiência confiáveis o suficiente para a gestão agir e para mostrar às costureiras.

## Positioning

Sistema próprio, feito sob medida para o fluxo real da fábrica: os tempos padrão, a grade de tamanhos, as partes da peça (superior/inferior) e os cupons físicos de papel são os da Victory, não de um ERP genérico.

## Operating Context

- Ordem de uso: Jornada e Ocorrências → Costureiras → Operações → Itens → Tickets (impressos) → Apontamento (diário) → Eficiência.
- A tela inicial é o Apontamento: é a tarefa repetida todo dia.
- Equipamento: PC desktop, leitor USB que age como teclado (código de 8 dígitos, Code 128) e impressora comum para os tickets.
- Jornada padrão de 528 min, de segunda a sexta; ocorrências somam ou subtraem minutos num dia.
- Grades de tamanho incluem Adulto, Plus Size, Juvenil e Infantil.
- Exportação da eficiência para Excel.

## Capabilities and Constraints

- Next.js 14 + Supabase, interface toda em português (pt-BR).
- Projeto separado do antigo victory-kanban, que não é mais usado.
- Ainda não publicado: Supabase e Vercel novos precisam ser configurados.
- Não há login por pessoa. Em aberto: se a líder e a gestão terão acessos diferentes.

## Brand Commitments

- Nome: Victory Pijamas. Ícone com a coroa do logo (`app/icon.png`, `app/apple-icon.png`, `public/favicon.ico`).
- Linguagem simples e direta, no vocabulário da fábrica (OP, cupom, ticket, apontamento, célula, oficina).

## Evidence on Hand

- Cadastros e regras reais definidos no código (`lib/producao.ts`, `supabase_setup.sql`).
- Não há métricas, depoimentos ou dados de produção publicados. Não inventar números de eficiência ou resultados.

## Product Principles

1. **O apontamento diário vem primeiro:** escanear uma pilha de cupons tem que ser rápido, com retorno claro a cada leitura e com erros (cupom repetido, código inválido) impossíveis de passar despercebidos.
2. **Números confiáveis:** a eficiência precisa ser explicável. Dá para ver de onde vem cada minuto (operações apontadas, jornada, ocorrências).
3. **Respeito às costureiras:** os resultados são mostrados a elas, então a forma de apresentar deve informar sem humilhar.
4. **Espelhar o papel:** o ticket impresso e a tela usam os mesmos nomes, números e ordem, para que o físico e o digital nunca se contradigam.
