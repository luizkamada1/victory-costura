"use client";

import { usePathname } from "next/navigation";

const MENU = [
  { href: "/apontamento", rotulo: "Apontamento" },
  { href: "/eficiencia", rotulo: "Eficiência" },
  { href: "/tickets", rotulo: "Tickets" },
  { href: "/costureiras", rotulo: "Costureiras" },
  { href: "/operacoes", rotulo: "Operações" },
  { href: "/itens", rotulo: "Itens" },
  { href: "/jornada", rotulo: "Jornada e Ocorrências" },
];

export default function ProducaoLayout({
  titulo,
  subtitulo,
  largura = 1100,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  largura?: number;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={estilos.header} className="nao-imprimir">
        <div style={estilos.headerTopo}>
          <div>
            <h1 style={estilos.titulo}>{titulo}</h1>
            {subtitulo && <p style={estilos.subtitulo}>{subtitulo}</p>}
          </div>
          <span style={estilos.marca}>Victory Pijamas · Costura</span>
        </div>
        <nav style={estilos.menu}>
          {MENU.map((m) => (
            <a
              key={m.href}
              href={m.href}
              style={{ ...estilos.menuItem, ...(caminho?.startsWith(m.href) ? estilos.menuAtivo : {}) }}
            >
              {m.rotulo}
            </a>
          ))}
        </nav>
      </header>
      <main style={{ maxWidth: largura, margin: "0 auto", padding: "24px 20px 60px" }}>{children}</main>
    </div>
  );
}

// Faz a chamada à API e lança o erro com a mensagem vinda do servidor
export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data as T;
}

export function mensagemErro(e: unknown) {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

const estilos: Record<string, React.CSSProperties> = {
  header: {
    background: "#14142b",
    color: "#fff",
    padding: "18px 24px 0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  headerTopo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  titulo: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.3 },
  subtitulo: { margin: "2px 0 0", fontSize: 13, color: "#a5a6c9", fontWeight: 500 },
  marca: { fontSize: 12.5, fontWeight: 700, color: "#a5a6c9", letterSpacing: 0.3, paddingTop: 6 },
  menu: { display: "flex", gap: 4, marginTop: 14, overflowX: "auto" },
  menuItem: {
    color: "#a5a6c9",
    textDecoration: "none",
    fontSize: 13.5,
    fontWeight: 600,
    padding: "10px 14px",
    borderBottom: "3px solid transparent",
    whiteSpace: "nowrap",
  },
  menuAtivo: { color: "#fff", borderBottom: "3px solid #818cf8" },
};

// Estilos compartilhados pelas telas do módulo
export const ui: Record<string, React.CSSProperties> = {
  secao: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  secaoTitulo: { fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#111827" },
  secaoDescricao: { fontSize: 12.5, color: "#6b7280", margin: "0 0 14px" },
  grade: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  campo: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13.5,
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    fontFamily: "inherit",
  },
  botaoPrimario: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  botaoSecundario: {
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    color: "#1a1a2e",
    whiteSpace: "nowrap",
    textDecoration: "none",
  },
  botaoPerigo: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "none",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  erroBox: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13.5,
  },
  sucessoBox: {
    background: "#dcfce7",
    color: "#166534",
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13.5,
  },
  tabela: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid #e5e7eb",
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  td: { padding: "9px 10px", borderBottom: "1px solid #f1f2f4", verticalAlign: "middle" },
  vazio: { color: "#9ca3af", fontSize: 13, padding: "10px 0" },
  badge: {
    display: "inline-block",
    fontSize: 11.5,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#4338ca",
  },
};
