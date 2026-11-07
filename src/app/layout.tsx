import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import AccionesFlotantes from "@/components/AccionesFlotantes";
import FondoMarca, { VERDE_MARCA } from "@/components/Lava";
import RegistrarSW from "@/components/RegistrarSW";
import { listarCandidatos } from "@/lib/consultas";
import { listarProveedores } from "@/lib/caja";
import { listarParaVender, type ProductoVendible } from "@/lib/stock";
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
  themeColor: VERDE_MARCA,
  width: "device-width",
  initialScale: 1,
  // En standalone la app ocupa la pantalla entera del celular.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Si la base no contesta, el portón y la pantalla de sin conexión tienen que
  // seguir dibujándose igual.
  let candidatos: { id: string; nombre: string }[] = [];
  let productos: ProductoVendible[] = [];
  let proveedores: { id: string; nombre: string }[] = [];
  try {
    [candidatos, productos, proveedores] = await Promise.all([
      listarCandidatos(),
      // El catálogo va en el layout y no en la página de ventas porque la
      // venta se arranca desde donde sea que estés: el cliente llega al
      // mostrador sin fijarse qué pantalla tenías abierta.
      listarParaVender(),
      listarProveedores(),
    ]);
  } catch {
    candidatos = [];
    productos = [];
    proveedores = [];
  }

  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/*
          El marco de marca: el verde con la lava, anclado a la PANTALLA y no al
          documento. Fijo a propósito — al scrollear, el humo se queda quieto y
          lo que se mueve es la hoja de trabajo, que es lo que da la sensación
          de tarjeta apoyada encima en vez de fondo pegado al contenido.
        */}
        <div className="fixed inset-0 z-0">
          <FondoMarca />
        </div>

        {/*
          El menú es fijo: una columna a la izquierda en pantalla grande y una
          barra con un solo botón arriba en el celular. Los dos van
          transparentes sobre la lava, así que el contenido se corre para
          dejarles el lugar en vez de taparlos.
        */}
        <div className="relative z-10 lg:pl-56">
          {/*
            La hoja de trabajo. Arranca debajo de la barra en el celular y al
            costado del menú en escritorio, con el filete verde alrededor: ese
            respiro es lo único que hace leer el contenido como una tarjeta
            apoyada sobre la marca y no como una página pintada de verde.
          */}
          <div className="min-h-[calc(100dvh-3.5rem)] rounded-t-3xl bg-papel shadow-xl mt-14 lg:mb-2 lg:mr-2 lg:mt-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-3xl">
            {/*
              Antes esto estaba capado en 5xl (1024px) y las planillas no
              entraban: con el menú al costado sobraba pantalla y la tabla igual
              scrolleaba. 7xl usa lo que hay sin volver ilegibles las pantallas
              de lectura.
            */}
            <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>

        <AccionesFlotantes
          clientes={candidatos}
          conSalir={Boolean(pinConfigurado())}
          productos={productos}
          proveedores={proveedores}
        />
        <RegistrarSW />
      </body>
    </html>
  );
}
