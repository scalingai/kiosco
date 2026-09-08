import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import AccionesFlotantes from "@/components/AccionesFlotantes";
import RegistrarSW from "@/components/RegistrarSW";
import { listarCandidatos } from "@/lib/consultas";
import { pinConfigurado } from "@/lib/sesion";
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
  themeColor: "#faf7f0",
  width: "device-width",
  initialScale: 1,
  // En standalone la app ocupa la pantalla entera del celular.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Si la base no contesta, el portón y la pantalla de sin conexión tienen que
  // seguir dibujándose igual.
  let candidatos: { id: string; nombre: string }[] = [];
  try {
    candidatos = await listarCandidatos();
  } catch {
    candidatos = [];
  }

  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/*
          El menú es fijo: una columna a la izquierda en pantalla grande y una
          barra con un solo botón arriba en el celular. El contenido se corre
          para dejarle el lugar en cada caso.
        */}
        <div className="lg:pl-64">
          {/*
            Antes esto estaba capado en 5xl (1024px) y las planillas no
            entraban: con el menú al costado sobraba pantalla y la tabla igual
            scrolleaba. 7xl usa lo que hay sin volver ilegibles las pantallas
            de lectura.
          */}
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:pt-8">
            {children}
          </main>
        </div>

        <AccionesFlotantes clientes={candidatos} conSalir={Boolean(pinConfigurado())} />
        <RegistrarSW />
      </body>
    </html>
  );
}
