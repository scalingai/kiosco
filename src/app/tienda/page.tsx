import type { Metadata } from "next";
import Image from "next/image";
import FondoMarca from "@/components/Lava";
import TiendaCarrito from "@/components/TiendaCarrito";
import Vidriera from "@/components/Vidriera";
import { listarVidriera } from "@/lib/tienda";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "El Osito — lo que tenemos",
  description:
    "Mirá todo lo que hay en el maxikiosco El Osito, con precios al día. Pedí y pasá a buscarlo.",
};

/**
 * La tienda, pública: la mira un cliente desde la calle.
 *
 * NO usa el layout del panel —ese carga el catálogo con costos, los
 * proveedores y los clientes—. Acá entra sólo lo que se puede mostrar
 * (`listarVidriera`): nombre, marca, rubro, foto y precio.
 *
 * El pedido no se paga acá. En un kiosco la plata se cobra en el mostrador o
 * contra entrega, y meter un checkout con tarjeta sería pedirle al cliente que
 * confíe antes de que haga falta.
 */
export default async function Tienda() {
  const productos = await listarVidriera();

  return (
    <TiendaCarrito>
      <div className="min-h-dvh bg-papel">
        {/*
          El banner. Es la misma superficie de marca que el panel: quien llega
          de un link tiene que reconocer el kiosco antes de leer nada.
        */}
        <header className="relative overflow-hidden rounded-b-[28px] px-5 pb-12 pt-12 lg:rounded-b-[40px] lg:px-8 lg:pb-16 lg:pt-16">
          <FondoMarca velo="parejo" />

          <div className="relative mx-auto max-w-7xl">
            <div className="flex items-center gap-4">
              <Image
                src="/oso.png"
                alt=""
                width={72}
                height={72}
                priority
                className="h-16 w-16 shrink-0 object-contain lg:h-[72px] lg:w-[72px]"
              />
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-white lg:text-5xl">
                  El Osito
                </h1>
                <p className="mt-2 text-sm text-emerald-50/80 lg:text-base">
                  Todo lo que tenemos, con el precio de hoy.
                </p>
              </div>
            </div>

            {/* Las tres cosas que pregunta cualquiera antes de pedir. Van en el
                banner porque contestarlas después de scrollear no sirve. */}
            <ul className="mt-7 flex flex-wrap gap-2 text-sm text-emerald-50 lg:mt-9">
              {[
                `${productos.length} productos con precio`,
                "Pedí y pasá a buscarlo",
                "O te lo mandamos",
              ].map((texto) => (
                <li
                  key={texto}
                  className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 backdrop-blur-sm"
                >
                  {texto}
                </li>
              ))}
            </ul>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
          {productos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-linea px-6 py-16 text-center text-sm text-tinta-suave">
              Todavía no hay productos con precio publicado.
            </p>
          ) : (
            <Vidriera productos={productos} />
          )}
        </main>
      </div>
    </TiendaCarrito>
  );
}
