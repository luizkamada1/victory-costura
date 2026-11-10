"use client";

import { useId, useMemo, useState } from "react";
import { ui } from "@/components/Layout";

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

function comparar(a: Valor, b: Valor) {
  const vazioA = a === null || a === undefined || a === "";
  const vazioB = b === null || b === undefined || b === "";
  if (vazioA || vazioB) return vazioA === vazioB ? 0 : vazioA ? 1 : -1;
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
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Ordenação (clique no título: crescente → decrescente → original) e filtro por coluna.
 * Devolve as linhas já filtradas/ordenadas e o <thead> pronto para usar na tabela.
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
        const vazio = (v: Valor) => v === null || v === undefined || v === "";
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
    if (c.ordenavel === false || !c.valor) return;
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
          return (
            <th
              key={c.id}
              style={{
                ...ui.th,
                textAlign: c.alinhar ?? "left",
                width: c.largura,
                cursor: ordenavel ? "pointer" : "default",
                userSelect: "none",
                whiteSpace: "nowrap",
                color: ativa ? "#4338ca" : ui.th.color,
              }}
              onClick={() => clicarTitulo(c)}
              title={ordenavel ? "Clique para ordenar" : undefined}
            >
              {c.titulo}
              {ordenavel && (
                <span style={{ marginLeft: 4, opacity: ativa ? 1 : 0.3, fontSize: 10 }}>
                  {ativa ? (ordem!.direcao === "asc" ? "▲" : "▼") : "↕"}
                </span>
              )}
              {ultima && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMostrarFiltros((v) => !v);
                  }}
                  style={{
                    ...botaoFiltro,
                    ...(mostrarFiltros || filtrosAtivos ? botaoFiltroAtivo : {}),
                  }}
                  title="Filtrar por coluna"
                >
                  ⚲ Filtrar{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
                </button>
              )}
            </th>
          );
        })}
      </tr>
      {mostrarFiltros && (
        <tr>
          {colunas.map((c, i) => {
            const filtravel = c.filtravel !== false && !!(c.valor || c.texto);
            const ultima = i === colunas.length - 1;
            const lista = sugestoes[c.id];
            return (
              <th key={c.id} style={{ padding: "6px 6px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                {filtravel && (
                  <>
                    <input
                      style={inputFiltro}
                      placeholder="Filtrar…"
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
                {ultima && filtrosAtivos > 0 && (
                  <button type="button" style={{ ...botaoFiltro, marginLeft: 0, marginTop: 4 }} onClick={() => setFiltros({})}>
                    Limpar filtros
                  </button>
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
      <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0" }}>
        Mostrando {visiveis.length} de {linhas.length}
      </p>
    ) : null;

  return { visiveis, thead, rodape };
}

const botaoFiltro: React.CSSProperties = {
  marginLeft: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 5,
  padding: "2px 7px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  cursor: "pointer",
  textTransform: "none",
  letterSpacing: 0,
};
const botaoFiltroAtivo: React.CSSProperties = { background: "#eef2ff", borderColor: "#818cf8", color: "#4338ca" };
const inputFiltro: React.CSSProperties = {
  width: "100%",
  minWidth: 60,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 5,
  padding: "4px 6px",
  fontSize: 12,
  fontWeight: 400,
  fontFamily: "inherit",
};
