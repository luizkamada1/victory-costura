"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, X } from "lucide-react";

type Valor = string | number | null | undefined;

export type Coluna<T> = {
  id: string;
  titulo: React.ReactNode;
  // valor usado para ordenar (números ordenam como números)
  valor?: (linha: T) => Valor;
  // texto usado no filtro; se omitido, usa o valor
  texto?: (linha: T) => string;
  alinhar?: "left" | "right" | "center";
  largura?: number | string;
  ordenavel?: boolean;
  filtravel?: boolean;
};

type Ordem = { id: string; direcao: "asc" | "desc" } | null;

// Sem acentos e em minúsculas, para "costura" encontrar "Costura" e "acao" encontrar "Ação"
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const comparador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const vazio = (v: Valor) => v === null || v === undefined || v === "";

function comparar(a: Valor, b: Valor) {
  if (vazio(a) || vazio(b)) return vazio(a) === vazio(b) ? 0 : vazio(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return comparador.compare(String(a), String(b));
}

// Em colunas numéricas aceita ">80", "<=50", "=10"; nas demais, busca o texto contido
function passaNoFiltro(filtro: string, texto: string, valor: Valor) {
  const f = filtro.trim();
  if (!f) return true;
  const op = f.match(/^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/);
  if (op && typeof valor === "number") {
    const n = Number(op[2].replace(/\./g, "").replace(",", "."));
    switch (op[1]) {
      case ">":
        return valor > n;
      case "<":
        return valor < n;
      case ">=":
        return valor >= n;
      case "<=":
        return valor <= n;
      default:
        return valor === n;
    }
  }
  return normalizar(texto).includes(normalizar(f));
}

function textoDe<T>(c: Coluna<T>, linha: T) {
  if (c.texto) return c.texto(linha);
  const v = c.valor?.(linha);
  return vazio(v) ? "" : String(v);
}

/**
 * Ordenação (clique no título: crescente → decrescente → original) e filtro por coluna.
 * Devolve as linhas já filtradas/ordenadas, o <thead> pronto e o rodapé com a contagem.
 */
export function useTabela<T>(linhas: T[], colunas: Coluna<T>[], ordemInicial: Ordem = null) {
  const [ordem, setOrdem] = useState<Ordem>(ordemInicial);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const prefixo = useId();

  const visiveis = useMemo(() => {
    const ativos = colunas.filter((c) => filtros[c.id]?.trim());
    let resultado = ativos.length
      ? linhas.filter((l) => ativos.every((c) => passaNoFiltro(filtros[c.id], textoDe(c, l), c.valor?.(l))))
      : linhas;
    const col = ordem && colunas.find((c) => c.id === ordem.id);
    if (col && col.valor) {
      const fator = ordem!.direcao === "asc" ? 1 : -1;
      resultado = [...resultado].sort((a, b) => {
        const va = col.valor!(a);
        const vb = col.valor!(b);
        // vazios sempre no fim, independente da direção
        if (vazio(va) || vazio(vb)) return comparar(va, vb);
        return comparar(va, vb) * fator;
      });
    }
    return resultado;
  }, [linhas, colunas, filtros, ordem]);

  // sugestões do filtro: valores distintos de cada coluna (só quando são poucos)
  const sugestoes = useMemo(() => {
    if (!mostrarFiltros) return {};
    const mapa: Record<string, string[]> = {};
    for (const c of colunas) {
      if (c.filtravel === false || !(c.valor || c.texto)) continue;
      const distintos = new Set<string>();
      for (const l of linhas) {
        const t = textoDe(c, l);
        if (t) distintos.add(t);
        if (distintos.size > 60) break;
      }
      if (distintos.size <= 60) mapa[c.id] = Array.from(distintos).sort(comparador.compare);
    }
    return mapa;
  }, [linhas, colunas, mostrarFiltros]);

  const filtrosAtivos = Object.values(filtros).filter((v) => v.trim()).length;

  function clicarTitulo(c: Coluna<T>) {
    setOrdem((atual) => {
      if (!atual || atual.id !== c.id) return { id: c.id, direcao: "asc" };
      if (atual.direcao === "asc") return { id: c.id, direcao: "desc" };
      return null;
    });
  }

  const thead = (
    <thead>
      <tr>
        {colunas.map((c, i) => {
          const ordenavel = c.ordenavel !== false && !!c.valor;
          const ativa = ordem?.id === c.id;
          const ultima = i === colunas.length - 1;
          const Seta = !ativa ? ArrowUpDown : ordem!.direcao === "asc" ? ArrowUp : ArrowDown;
          return (
            <th
              key={c.id}
              style={{ textAlign: c.alinhar ?? "left", width: c.largura }}
              aria-sort={ativa ? (ordem!.direcao === "asc" ? "ascending" : "descending") : undefined}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {ordenavel ? (
                  <button type="button" className="ordenar" data-ativo={ativa} onClick={() => clicarTitulo(c)}>
                    {c.titulo}
                    <Seta size={13} aria-hidden />
                  </button>
                ) : (
                  c.titulo
                )}
                {ultima && (
                  <button
                    type="button"
                    className="botao botao-pequeno botao-secundario"
                    onClick={() => setMostrarFiltros((v) => !v)}
                    aria-expanded={mostrarFiltros}
                    style={filtrosAtivos ? { background: "var(--rosa-claro)", color: "var(--rosa-escuro)" } : undefined}
                  >
                    <ListFilter size={14} aria-hidden />
                    Filtrar{filtrosAtivos ? ` · ${filtrosAtivos}` : ""}
                  </button>
                )}
              </span>
            </th>
          );
        })}
      </tr>
      {mostrarFiltros && (
        <tr className="linha-filtros">
          {colunas.map((c) => {
            const filtravel = c.filtravel !== false && !!(c.valor || c.texto);
            const lista = sugestoes[c.id];
            return (
              <th key={c.id}>
                {filtravel && (
                  <>
                    <input
                      className="filtro"
                      placeholder="Filtrar"
                      aria-label={`Filtrar ${typeof c.titulo === "string" ? c.titulo : c.id}`}
                      list={lista ? `${prefixo}-${c.id}` : undefined}
                      value={filtros[c.id] ?? ""}
                      onChange={(e) => setFiltros({ ...filtros, [c.id]: e.target.value })}
                    />
                    {lista && (
                      <datalist id={`${prefixo}-${c.id}`}>
                        {lista.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    )}
                  </>
                )}
              </th>
            );
          })}
        </tr>
      )}
    </thead>
  );

  const rodape =
    filtrosAtivos > 0 ? (
      <div className="tabela-rodape">
        Mostrando {visiveis.length} de {linhas.length}
        <button type="button" className="botao botao-pequeno botao-fantasma" onClick={() => setFiltros({})}>
          <X size={14} aria-hidden />
          Limpar filtros
        </button>
      </div>
    ) : null;

  return { visiveis, thead, rodape, filtrando: filtrosAtivos > 0 };
}
