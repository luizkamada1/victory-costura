"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronsLeft,
  Gauge,
  Menu,
  ScanBarcode,
  Scissors,
  Shirt,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

type ItemMenu = { href: string; rotulo: string; icone: LucideIcon };

const MENU: { grupo: string; itens: ItemMenu[] }[] = [
  {
    grupo: "Dia a dia",
    itens: [
      { href: "/apontamento", rotulo: "Apontamento", icone: ScanBarcode },
      { href: "/eficiencia", rotulo: "Eficiência", icone: Gauge },
      { href: "/tickets", rotulo: "Tickets", icone: Ticket },
    ],
  },
  {
    grupo: "Cadastros",
    itens: [
      { href: "/costureiras", rotulo: "Costureiras", icone: Users },
      { href: "/operacoes", rotulo: "Operações", icone: Scissors },
      { href: "/itens", rotulo: "Itens", icone: Shirt },
      { href: "/jornada", rotulo: "Jornada e Ocorrências", icone: CalendarClock },
    ],
  },
];

const CHAVE_RECOLHIDO = "costura:menu-recolhido";

export default function ProducaoLayout({
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const [recolhido, setRecolhido] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [pronto, setPronto] = useState(false);

  // a preferência do menu é só deste navegador; sem armazenamento, o menu fica aberto.
  // A animação só liga depois de aplicar a preferência, para o menu não "pular" ao trocar de tela.
  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {
      // sem acesso ao armazenamento
    }
    const quadro = requestAnimationFrame(() => setPronto(true));
    return () => cancelAnimationFrame(quadro);
  }, []);

  function alternar() {
    setRecolhido((v) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, v ? "0" : "1");
      } catch {
        // sem acesso ao armazenamento
      }
      return !v;
    });
  }

  useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setGaveta(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [gaveta]);

  return (
    <div className="casca" data-recolhido={recolhido} data-gaveta={gaveta} data-pronto={pronto}>
      <aside className="trilho nao-imprimir" aria-label="Menu principal">
        <Link href="/apontamento" className="trilho-marca">
          <img src="/icon.png" alt="" />
          <div>
            <strong>Victory Pijamas</strong>
            <span>Costura</span>
          </div>
        </Link>
        <nav>
          {MENU.map((g) => (
            <div key={g.grupo}>
              <div className="trilho-grupo">{g.grupo}</div>
              {g.itens.map((m) => {
                const Icone = m.icone;
                const ativo = caminho?.startsWith(m.href);
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="trilho-item"
                    onClick={() => setGaveta(false)}
                    aria-current={ativo ? "page" : undefined}
                    title={recolhido ? m.rotulo : undefined}
                  >
                    <Icone size={18} strokeWidth={1.8} aria-hidden />
                    <span className="trilho-rotulo">{m.rotulo}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="trilho-rodape">
          <button
            type="button"
            className="trilho-recolher"
            onClick={alternar}
            aria-expanded={!recolhido}
            title={recolhido ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronsLeft size={18} strokeWidth={1.8} aria-hidden />
            <span className="trilho-rotulo">Recolher menu</span>
          </button>
        </div>
      </aside>

      {gaveta && <div className="veu" onClick={() => setGaveta(false)} aria-hidden />}

      <div className="trabalho">
        <div className="topo-movel nao-imprimir">
          <button
            type="button"
            onClick={() => setGaveta((v) => !v)}
            aria-label={gaveta ? "Fechar menu" : "Abrir menu"}
            aria-expanded={gaveta}
          >
            {gaveta ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
          Victory · Costura
        </div>
        <main className="pagina">
          <header className="pagina-cabecalho">
            <div>
              <h1>{titulo}</h1>
              {subtitulo && <p>{subtitulo}</p>}
            </div>
            {acoes}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "alerta"; children: React.ReactNode }) {
  const Icone = tipo === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === "erro" ? "alert" : "status"}>
      <Icone size={17} aria-hidden />
      <div>{children}</div>
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
