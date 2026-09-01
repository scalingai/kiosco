import type { MetadataRoute } from "next";

/**
 * Lo que hace que Android y iOS ofrezcan instalarla como app. Chrome pide
 * name, icons de 192 y 512, start_url y display: standalone, más un service
 * worker con handler de fetch (está en public/sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "El Osito — Fiado",
    short_name: "El Osito",
    description: "El fiado del maxikiosco: quién debe, cuánto y desde cuándo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f0",
    theme_color: "#faf7f0",
    lang: "es-AR",
    dir: "ltr",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/iconos/icono-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/iconos/icono-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android recorta esta en círculo: el oso va más chico para que entre.
        src: "/iconos/icono-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
