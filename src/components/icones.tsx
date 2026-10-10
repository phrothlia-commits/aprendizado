/** Ícones de traço do redesenho v2 (decorativos: aria-hidden). */
type P = { tamanho?: number; className?: string; espessura?: number };

function Svg({ tamanho = 20, className, espessura = 1.8, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={espessura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const IconeHoje = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </Svg>
);
export const IconeTrilha = (p: P) => (
  <Svg {...p}>
    <path d="M6 19c0-4 3-5.5 6-6.5s6-3 6-7" />
    <circle cx="6" cy="19.5" r="1.8" />
    <circle cx="18" cy="5" r="1.8" />
  </Svg>
);
export const IconeBiblioteca = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h6v16H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M20.5 5.5A1.5 1.5 0 0 0 19 4h-6v16h6a1.5 1.5 0 0 0 1.5-1.5z" />
  </Svg>
);
export const IconeVoce = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" />
  </Svg>
);
export const IconeSeta = (p: P) => (
  <Svg espessura={2.2} tamanho={16} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconeCheck = (p: P) => (
  <Svg espessura={2.8} tamanho={14} {...p}>
    <path d="M5 12.5 10 17 19 7" />
  </Svg>
);
export const IconeFechar = (p: P) => (
  <Svg espessura={2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconeVoltar = (p: P) => (
  <Svg espessura={2} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconeAvancar = (p: P) => (
  <Svg espessura={2} tamanho={16} {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IconeLampada = (p: P) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </Svg>
);
export const IconeDocumento = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Svg>
);
export const IconeVideo = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
  </Svg>
);
export const IconeAudio = (p: P) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="14" width="4" height="6" rx="1.5" />
    <rect x="17" y="14" width="4" height="6" rx="1.5" />
  </Svg>
);
export const IconeLei = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0zM8 21h8" />
  </Svg>
);
export const IconeCurso = (p: P) => (
  <Svg {...p}>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c2 2 10 2 12 0v-5" />
  </Svg>
);
export const IconeEnviar = (p: P) => (
  <Svg espessura={2} tamanho={16} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const IconeMais = (p: P) => (
  <Svg espessura={2.2} tamanho={18} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconeOlhoFechado = (p: P) => (
  <Svg espessura={2} tamanho={14} {...p}>
    <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.6 3.6M6.6 6.6A12 12 0 0 0 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
  </Svg>
);
export const IconeBusca = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const IconeLixo = (p: P) => (
  <Svg tamanho={16} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const IconeExterno = (p: P) => (
  <Svg tamanho={14} espessura={2} {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export function IconeTipoFonte({ tipo, ...p }: P & { tipo: string }) {
  if (tipo === "video") return <IconeVideo {...p} />;
  if (tipo === "audio") return <IconeAudio {...p} />;
  if (tipo === "lei") return <IconeLei {...p} />;
  if (tipo === "curso") return <IconeCurso {...p} />;
  if (tipo === "livro") return <IconeBiblioteca {...p} />;
  return <IconeDocumento {...p} />;
}
