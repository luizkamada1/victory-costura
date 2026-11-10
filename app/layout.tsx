import { Inter } from "next/font/google";
import "./globals.css";

// No Mac e no iPhone a página usa a San Francisco do sistema; nos demais, a Inter,
// que tem o mesmo desenho. A Inter é baixada no build e servida pelo próprio site.
const inter = Inter({ subsets: ["latin"], variable: "--fonte-inter", display: "swap" });

export const metadata = {
  title: "Victory Pijamas — Produtividade da Costura",
  description: "Tickets de produção, apontamento e eficiência das costureiras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
