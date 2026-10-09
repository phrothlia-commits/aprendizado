import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trilha de Estudos",
    short_name: "Trilha",
    description: "O que eu estudo e reviso hoje?",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
