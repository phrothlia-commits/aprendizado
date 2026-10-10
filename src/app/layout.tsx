import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Trilha de Estudos",
  description: "O que eu estudo e reviso hoje?",
  appleWebApp: { capable: true, title: "Trilha", statusBarStyle: "default" },
  icons: { icon: "/icone.svg", apple: "/icone-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${instrument.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {/* Rotas com parâmetro dinâmico (/aula/[id], /feynman/[temaId]) só conhecem a URL na requisição. */}
        <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-texto-2">Carregando…</div>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
