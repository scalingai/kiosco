import type { Metadata } from "next";
import Image from "next/image";
import FondoMarca from "@/components/Lava";
import TiendaCarrito from "@/components/TiendaCarrito";
import Vidriera from "@/components/Vidriera";
import { fotosParaElBanner, listarVidriera } from "@/lib/tienda";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "El Osito — pedí y pasá a buscarlo",
  description:
    "Todo lo del maxikiosco, con precio y foto. Armá el pedido, pasá a buscarlo o te lo mandamos.",
};

/**
 * La tienda, pública: la mira un cliente desde la calle.
 *
 * NO usa el layout del panel —ese carga el catálogo con costos, los
 * proveedores y los clientes—. Acá entra sólo lo que se puede mostrar
 * (`listarVidriera`): nombre, marca, rubro, foto y precio.
 */
export default async function Tienda() {
  const productos = await listarVidriera();
  const collage = fotosParaElBanner(productos);

  return (
    <TiendaCarrito>
      <div className="min-h-dvh bg-papel">
        {/*
          ── El banner ──────────────────────────────────────────────────────
          Un hero de landing, no una barra con el nombre: titular que dice qué
          se puede hacer acá, UN botón, y la prueba al lado —las fotos de lo que
          de verdad hay en la góndola—.

          Las fotos son de productos reales y no una ilustración: en una tienda
          de kiosco, el envase es lo que el cliente reconoce de lejos. Una
          imagen generada se ve linda y no le dice a nadie que acá está la marca
          que viene comprando hace diez años.
        */}
        <header className="relative overflow-hidden rounded-b-[32px] lg:rounded-b-[48px]">
          <FondoMarca velo="degradado" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-14 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-14">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/oso.png"
                  alt=""
                  width={40}
                  height={40}
                  priority
                  className="h-9 w-9 object-contain"
                />
                <span className="font-display text-lg font-semibold tracking-tight text-white">
                  El Osito
                </span>
              </div>

              {/* Interlínea apretada y tracking negativo: es lo que hace que un
                  titular grande se lea como una pieza y no como tres renglones
                  sueltos. */}
              <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.2rem]">
                Lo del kiosco,
                <br />
                sin ir al kiosco.
              </h1>

              <p className="mt-5 max-w-md text-base leading-relaxed text-emerald-50/85 lg:text-lg">
                Mirá todo lo que tenemos con el precio de hoy, armá el pedido y
                pasá a buscarlo. O te lo mandamos.
              </p>

              {/* Un solo botón. Dos CTA al lado hacen que ninguno se apriete. */}
              <a
                href="#todo"
                className="mt-8 inline-flex h-14 items-center gap-3 rounded-full bg-white pl-7 pr-3 text-[15px] font-semibold text-marca shadow-[0_18px_40px_-18px_rgba(4,40,22,0.8)] transition-transform hover:scale-[1.02] active:scale-[0.99]"
              >
                Ver todo lo que hay
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-marca text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                </span>
              </a>

              <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-50/60">
                {productos.length} productos · precios de hoy · sin registrarte
              </p>
            </div>

            {/*
              El collage. Las tarjetas van rotadas apenas y encimadas: una
              grilla prolija de fotos recortadas se lee como un catálogo de
              stock, y esto tiene que leerse como una góndola.
            */}
            {collage.length >= 3 && (
              <div
                aria-hidden
                className="relative mx-auto hidden h-[320px] w-full max-w-md lg:block"
              >
                {collage.slice(0, 5).map((p, i) => {
                  const puestos = [
                    "left-[6%] top-[12%] h-36 w-36 -rotate-6",
                    "left-[34%] top-[0%] h-40 w-40 rotate-3",
                    "right-[2%] top-[18%] h-32 w-32 rotate-8",
                    "left-[14%] bottom-[2%] h-32 w-32 rotate-5",
                    "right-[12%] bottom-[0%] h-36 w-36 -rotate-4",
                  ];
                  return (
                    <span
                      key={p.id}
                      className={
                        "absolute flex items-center justify-center rounded-2xl bg-white p-3 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/5 " +
                        puestos[i]
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imagenUrl!}
                        alt=""
                        loading="eager"
                        className="h-full w-full object-contain"
                      />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </header>

        <main
          id="todo"
          className="mx-auto w-full max-w-7xl scroll-mt-4 px-4 pb-24 pt-6 sm:px-6 lg:px-8"
        >
          {productos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-linea px-6 py-16 text-center text-sm text-tinta-suave">
              Todavía no hay productos con precio publicado.
            </p>
          ) : (
            <Vidriera productos={productos} />
          )}
        </main>

        <footer className="border-t border-linea px-5 py-10 text-center lg:px-8">
          <p className="text-sm text-tinta-suave">
            El Osito · maxikiosco
          </p>
          <p className="mt-1 text-xs text-tinta-suave">
            Los precios pueden cambiar. Te confirmamos el total al tomar el
            pedido.
          </p>
        </footer>
      </div>
    </TiendaCarrito>
  );
}
