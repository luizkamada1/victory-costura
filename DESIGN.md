# DESIGN.md — Victory · Costura

Mundo visual: **malha de pijama, em rosa**, com tipografia no estilo da Apple. Ferramenta de trabalho (modo Operate): a interface é um sistema comum de cadastro e tabelas; o mundo entra só pela paleta, pela densidade, pela tipografia e por um gesto próprio (a faixa da jornada).

Tokens e classes vivem em `app/globals.css`. Componentes compartilhados: `components/Layout.tsx` (casca, menu, `Aviso`, `api`), `components/Tabela.tsx` (`useTabela`: ordenar e filtrar), `components/Medidas.tsx` (`FaixaJornada`, `BarraEficiencia`).

## Cor

Estratégia contida: o rosa bem suave veste a casca (menu) e marca seleção; o grafite é a ação principal, como nos botões da Apple.

| Papel | Token | Valor |
| --- | --- | --- |
| Fundo do menu lateral | `--rosa-fundo` | `#fdf4f7` |
| Item ativo, seleção, selo "Superior" | `--rosa-claro` | `#fbe6ee` |
| Divisórias e seleção de texto | `--rosa-medio` | `#f2c6d5` |
| Nervura da faixa | `--rosa-nervura` | `#eaa9bf` |
| Foco, nervura nova, progresso | `--rosa` | `#d76f93` |
| Texto e ícones sobre rosa | `--rosa-escuro` | `#a9466c` |
| Botão principal | `--grafite` | `#1d1d1f` |
| Fundo de trabalho | `--algodao` | `#f5f5f7` |
| Blocos | `--superficie` | `#ffffff` |
| Texto | `--tinta` / `--tinta-2` / `--tinta-3` | `#1d1d1f` / `#424245` / `#6e6e73` |
| Réguas | `--regua` / `--regua-forte` | `#e8e8ed` / `#d2d2d7` |
| Bom (≥ 85%) / atenção / abaixo de 65% | `--ok` / `--alerta` / `--erro` | `#1d7f43` / `#a1590a` / `#c1271c` |

Proibido: listras ou texturas de tecido, violeta/índigo, texto em gradiente, sombras como elevação de cartão.

## Tipografia

Estilo Apple: San Francisco do sistema no Mac e no iPhone (`-apple-system`, `SF Pro Text/Display`); nos demais, Inter (via `next/font`, servida pelo próprio site). Base 15px com leve aperto (-0.011em). Título de página 34px/700 (-0.028em), subtítulo 17px cinza, título de bloco 20px/600 (-0.022em), rótulos 13px/500, tabela 14px, cabeçalho de tabela 12.5px/500 cinza. Números com `tabular-nums`; códigos de cupom em monoespaçada. Ordinais femininos (1ª operação) iguais aos do cupom impresso.

## Forma e densidade

- Blocos: brancos, sem borda nem sombra, raio 18px, sobre o fundo `#f5f5f7`.
- Botões em pílula (raio 999px), 36px (30px nos pequenos); principal grafite, secundário cinza-claro.
- Campos: 40px, raio 10px, foco com anel rosa.
- Período: controle segmentado (fundo cinza translúcido, opção escolhida em branco com sombra curta).
- Tabelas: linhas de 46px separadas por régua fina, sem quebra de linha; títulos clicáveis ordenam; "Filtrar" abre uma linha de filtros por coluna.
- Ícones: lucide, traço 1.8, 14–18px.

## Casca

Trilho lateral rosa-fundo de 236px (64px recolhido, só ícones); item ativo em rosa-claro com ícone rosa-escuro. Grupos "Dia a dia" (Apontamento, Eficiência, Tickets) e "Cadastros" (Costureiras, Operações, Itens, Jornada e Ocorrências). A preferência de recolher fica no navegador. Abaixo de 860px vira gaveta com barra superior.

## Gesto próprio: a faixa da jornada

Em Apontamento, o dia da costureira é uma faixa: cada cupom apontado vira uma nervura com largura proporcional aos minutos dele. A régua vai até 120% da jornada; o traço escuro marca 100%. Segmentos em rosa lisa (sem textura), separados por um fio branco; o novo entra com `clip-path` (260ms, ease-out forte) em rosa.

A barra de eficiência segue a mesma régua (0–120%, traço em 100%) em toda a tela, para que comparar pessoas seja comparar comprimentos.

## Movimento

Só para estado e retorno: botões encolhem para 0.97 ao pressionar (160ms), menu recolhe em 220ms, nervura nova entra em 260ms. Curva `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. Hover só em ponteiro fino. `prefers-reduced-motion` zera as durações.

## Textos

Vocabulário da fábrica: OP, cupom, ticket, apontamento, célula. Botões dizem a ação ("Gerar e imprimir", "Registrar ocorrência"). Erros dizem o problema e o que fazer. Estados vazios ensinam o próximo passo.
