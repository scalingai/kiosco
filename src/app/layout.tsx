import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import AccionesFlotantes from "@/components/AccionesFlotantes";
import BotonSalir from "@/components/BotonSalir";
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
  title: "El Osito — Fiado",
  description: "El fiado del maxikiosco: quién debe, cuánto y desde cuándo.",
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
      <body className="min-h-full flex flex-col">
        <header className="border-b border-linea bg-papel-hondo/70">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/oso.png"
                alt=""
                width={36}
                height={36}
                priority
                className="h-9 w-9 object-contain"
              />
              <span className="font-display text-2xl leading-none tracking-tight sm:text-3xl">
                El Osito
              </span>
            </Link>
            <span className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
              Fiado
            </span>
            {/* Sin PIN configurado no hay sesión que cerrar. */}
            {pinConfigurado() && (
              <span className="ml-auto">
                <BotonSalir />
              </span>
            )}
          </div>
        </header>

        {/* El padding de abajo deja libre la columna de botones flotantes. */}
        {/* El padding de abajo deja libre la barra de navegación. */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-6 sm:px-6">
          {children}
        </main>

        <AccionesFlotantes clientes={candidatos} />
        <RegistrarSW />
      </body>
    </html>
  );
}
