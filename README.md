# Victory Pijamas — Produtividade da Costura

Controle da produção da costura com tickets de código de barras: cada operação de cada
ticket é um cupom destacável. No fim do dia as costureiras entregam os cupons que fizeram,
eles são escaneados e o sistema calcula a eficiência de cada uma.

**Eficiência** = minutos produzidos (quantidade × tempo de cada operação apontada)
÷ minutos disponíveis (jornada do dia ± ocorrências).

## Passo a passo para publicar (gratuito)

### 1. Banco de dados (Supabase)

1. Entre em https://supabase.com e clique em **New project** (ex: `victory-costura`).
2. Quando o projeto estiver pronto, vá em **SQL Editor → New query**, cole o conteúdo do
   arquivo `supabase_setup.sql` e clique em **Run**.
3. Vá em **Project Settings → API** e copie:
   - **Project URL** → `SUPABASE_URL`
   - chave **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (nunca exponha essa chave publicamente)

### 2. GitHub

Crie um repositório novo (ex: `victory-costura`) e envie esta pasta:

```bash
git remote add origin https://github.com/SEU_USUARIO/victory-costura.git
git push -u origin master
```

### 3. Publicar (Vercel)

1. Em https://vercel.com clique em **Add New → Project** e selecione o repositório `victory-costura`.
2. Em **Environment Variables** adicione `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Clique em **Deploy**.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

## Ordem de uso

1. **Jornada e Ocorrências** — minutos de trabalho de cada dia da semana (padrão: 528 min de seg a sex).
2. **Costureiras** — nome e setor (e, se precisar, uma jornada própria).
3. **Operações** — nome, tempo por peça (minutos), máquina e parte (superior/inferior).
4. **Itens** — referência, nome, grade, tamanhos, cores, partes e a sequência de operações.
5. **Tickets** — OP, referência, cor, parte e quantidade por tamanho; os tickets abrem prontos para imprimir.
6. **Apontamento** — selecione a costureira e a data e escaneie os cupons que ela entregou.
7. **Eficiência** — ranking por período, detalhe por dia e exportação para Excel.

O código de barras de cada cupom é um número de 8 dígitos (Code 128) e funciona com
qualquer leitor USB comum, que age como teclado.
