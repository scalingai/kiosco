import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { VERDE_MARCA } from "@/components/Lava";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "El Osito",
  description:
    "El maxikiosco de punta a punta: fiado, caja del día, ventas y reposición.",
  applicationName: "El Osito",
  manifest: "/manifest.webmanifest",
  // iOS no lee el manifest: la instalación desde "Agregar a inicio" se
  // configura con estas dos cosas.
  appleWebApp: {
    capable: true,
    title: "El Osito",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: VERDE_MARCA,
  width: "device-width",
  initialScale: 1,
  // En standalone la app ocupa la pantalla entera del celular.
  viewportFit: "cover",
};

/**
 * El layout raíz: sólo las fuentes y el documento.
 *
 * Quedó vacío a propósito. Hay DOS cosas distintas colgando de acá y antes
 * compartían todo:
 *
 *  - `(panel)`, la app del kiosquero: menú, lava de fondo, y la carga del
 *    catálogo con costos, proveedores y clientes.
 *  - `tienda`, la vidriera pública: la mira un cliente desde la calle.
 *
 * Con un solo layout, la tienda salía con el menú de la app encima y —peor—
 * cargaba los datos del panel para cualquiera que abriera el link. El armazón
 * del panel vive ahora en `(panel)/layout.tsx`, que es el único lugar donde se
 * carga algo, y detrás del PIN.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
