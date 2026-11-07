import type { Metadata } from "next";
import Image from "next/image";
import FondoMarca from "@/components/Lava";
import Vidriera from "@/components/Vidriera";
import { listarVidriera } from "@/lib/tienda";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "El Osito — lo que tenemos",
  description:
    "Mirá todo lo que hay en el maxikiosco El Osito, con precios al día.",
};

/**
 * La tienda, pública: la mira un cliente desde la calle.
 *
 * NO está detrás del PIN y por eso no usa el layout de la app: ese carga el
 * catálogo con costos, los proveedores y los clientes. Acá entra sólo lo que se
 * puede mostrar (`listarVidriera`), que es nombre, marca, rubro, foto y precio.
 *
 * No es un e-commerce: no hay carrito ni checkout. Es la vidriera — para que el
 * que pregunta por WhatsApp "¿tenés tal cosa y a cuánto?" se conteste solo.
 */
export default async function Tienda() {
  const productos = await listarVidriera();

  return (
    <div className="min-h-dvh bg-papel">
      {/* La misma superficie de marca que el panel: quien llega de un link
          tiene que reconocer el kiosco antes de leer nada. */}
      <header className="relative overflow-hidden rounded-b-[28px] px-5 pb-10 pt-12 lg:rounded-b-[40px] lg:px-8 lg:pb-14 lg:pt-16">
        <FondoMarca velo="parejo" />
        <div className="relative mx-auto flex max-w-7xl items-center gap-4">
          <Image
            src="/oso.png"
            alt=""
            width={64}
            height={64}
            priority
            className="h-14 w-14 shrink-0 object-contain lg:h-16 lg:w-16"
          />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-white lg:text-4xl">
              El Osito
            </h1>
            <p className="mt-1.5 text-sm text-emerald-50/80">
              Todo lo que tenemos, con el precio de hoy.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-5 sm:px-6 lg:px-8">
        {productos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea px-6 py-16 text-center text-sm text-tinta-suave">
            Todavía no hay productos con precio publicado.
          </p>
        ) : (
          <Vidriera productos={productos} />
        )}
      </main>
    </div>
  );
}
