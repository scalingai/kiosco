"use client";

import { useMemo, useState } from "react";
import { useCarrito } from "@/components/TiendaCarrito";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos } from "@/lib/plata";
import type { ProductoEnVidriera } from "@/lib/tienda";

/**
 * La tienda, como la ve un cliente.
 *
 * El diseño sale de la tienda de AppGenda (`site/tienda/TiendaContent` y
 * `EditorialProductCard`): tarjeta blanca con la foto cuadrada arriba, el
 * nombre en dos líneas, el precio grande abajo y un "+" que suma al carrito
 * sin entrar a la ficha. La foto va ENTERA y sin velo encima — los packshots
 * vienen sobre fondo claro, y un degradé negro les tapa media etiqueta.
 *
 * Lo que NO se trajo es el código: aquel componente son mil líneas atadas al
 * modelo de AppGenda (temas por organización, checkout, reservas). Acá el
 * catálogo es otro y el pedido termina en otro lado.
 */

/** Cuántos se dibujan de entrada. El resto entra al apretar "ver más". */
const TANDA = 24;

function IconoCarrito() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3 4h2l2.4 10.4a1 1 0 0 0 1 .8h8.1a1 1 0 0 0 1-.75L19 8H6" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </svg>
  );
}

function Tarjeta({ producto }: { producto: ProductoEnVidriera }) {
  const { agregar, cuantos } = useCarrito();
  const enCarrito = cuantos(producto.id);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-tarjeta shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <div className="relative aspect-square w-full overflow-hidden bg-papel-hondo">
        {producto.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imagenUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-medium text-tinta-suave">
            {producto.nombre.trim().charAt(0).toUpperCase()}
          </span>
        )}

        {/* El "+" suma una unidad sin entrar a ningún lado. Con el número
            cuando ya hay: es la forma de saber qué llevás sin abrir el cajón. */}
        <button
          type="button"
          onClick={() => agregar(producto)}
          aria-label={"Agregar " + producto.nombre}
          className={
            "absolute right-2 top-2 flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium shadow-sm transition-colors " +
            (enCarrito > 0
              ? "bg-acento text-white"
              : "bg-white/90 text-acento backdrop-blur hover:bg-white")
          }
        >
          {enCarrito > 0 ? <span className="cifra">{enCarrito}</span> : "+"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-black/[0.06] p-3">
        {producto.marca && (
          <p className="truncate text-xs text-tinta-suave">{producto.marca}</p>
        )}
        {/* Dos líneas y corta: los nombres del catálogo traen el gramaje al
            final y en una sola línea se pierde justo eso. */}
        <h3 className="line-clamp-2 text-sm leading-snug">{producto.nombre}</h3>
        <p className="cifra mt-auto pt-1 text-lg font-medium">
          {formatearCentavos(producto.precioCentavos)}
        </p>
      </div>
    </article>
  );
}

export default function Vidriera({
  productos,
}: {
  productos: ProductoEnVidriera[];
}) {
  const { unidades, total, abrir } = useCarrito();
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [cuantos, setCuantos] = useState(TANDA);

  /** Los rubros que de verdad tienen algo publicado, con cuánto hay en cada uno. */
  const rubros = useMemo(() => {
    const cuenta = new Map<string, { total: number; foto: string | null }>();
    for (const p of productos) {
      if (!p.rubro) continue;
      const previo = cuenta.get(p.rubro);
      cuenta.set(p.rubro, {
        total: (previo?.total ?? 0) + 1,
        // La primera foto del rubro hace de portada: una grilla de categorías
        // sin imagen es una lista de palabras con mucho aire al lado.
        foto: previo?.foto ?? p.imagenUrl,
      });
    }
    return [...cuenta.entries()]
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.total - a.total);
  }, [productos]);

  const filtrados = useMemo(() => {
    // Por palabras sueltas, igual que el mostrador: quien busca escribe
    // "coca 600" y el producto se llama "Coca-Cola común 600 ml".
    const palabras = normalizarNombre(busqueda).split(" ").filter(Boolean);

    return productos.filter((p) => {
      if (rubro && p.rubro !== rubro) return false;
      if (!palabras.length) return true;
      const donde = normalizarNombre(`${p.nombre} ${p.marca ?? ""}`);
      return palabras.every((palabra) => donde.includes(palabra));
    });
  }, [productos, busqueda, rubro]);

  const visibles = filtrados.slice(0, cuantos);

  /*
   * La portada con las categorías se muestra sólo cuando no se eligió nada ni
   * se buscó: es para el que llega sin saber qué quiere. Dejarla arriba de los
   * resultados empujaría la lista fuera de la pantalla justo cuando el cliente
   * YA dijo qué busca.
   */
  const enPortada = !rubro && !busqueda.trim();

  function elegirRubro(elegido: string | null) {
    setRubro(elegido);
    setCuantos(TANDA);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pildora =
    "shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors";

  return (
    <div className="space-y-5">
      {/* La barra: busca y lleva al carrito. Pegada arriba porque son las dos
          cosas que se usan desde cualquier punto del scroll. */}
      <div className="sticky top-0 z-20 -mx-4 bg-papel/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setCuantos(TANDA);
            }}
            placeholder="Buscar un producto"
            aria-label="Buscar un producto"
            className="min-w-0 flex-1 rounded-full border border-linea bg-white px-5 py-3 text-base shadow-sm"
          />

          <button
            type="button"
            onClick={abrir}
            aria-label={
              unidades > 0
                ? `Ver el pedido, ${unidades} productos`
                : "Ver el pedido"
            }
            className="flex shrink-0 items-center gap-2 rounded-full bg-acento px-4 py-3 text-sm font-medium text-white shadow-sm"
          >
            <IconoCarrito />
            {unidades > 0 && (
              <span className="cifra">{formatearCentavos(total)}</span>
            )}
          </button>
        </div>

        {rubros.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            <button
              type="button"
              onClick={() => elegirRubro(null)}
              className={
                pildora +
                (rubro === null
                  ? " bg-acento text-white"
                  : " border border-linea bg-tarjeta text-tinta")
              }
            >
              Todo
            </button>
            {rubros.map((r) => (
              <button
                key={r.nombre}
                type="button"
                onClick={() => elegirRubro(r.nombre)}
                className={
                  pildora +
                  (rubro === r.nombre
                    ? " bg-acento text-white"
                    : " border border-linea bg-tarjeta text-tinta")
                }
              >
                {r.nombre} <span className="cifra opacity-60">{r.total}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {enPortada && rubros.length > 1 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold">
            Por categoría
          </h2>
          {/* Si queda una sola en la última fila, se estira a lo ancho: una
              tarjeta suelta con un hueco al lado se lee como un error. */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1">
            {rubros.map((r) => (
              <button
                key={r.nombre}
                type="button"
                onClick={() => elegirRubro(r.nombre)}
                className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl bg-papel-hondo p-3 text-left ring-1 ring-black/[0.06]"
              >
                {r.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.foto}
                    alt=""
                    loading="lazy"
                    className="absolute right-2 top-2 h-16 w-16 object-contain transition-transform duration-500 motion-safe:group-hover:scale-110 md:h-20 md:w-20"
                  />
                )}
                <span className="relative">
                  <span className="block text-sm font-medium">{r.nombre}</span>
                  <span className="cifra block text-xs text-tinta-suave">
                    {r.total} productos
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        {!enPortada && (
          <h2 className="mb-3 font-display text-xl font-semibold">
            {rubro ?? "Resultados"}{" "}
            <span className="cifra text-sm font-normal text-tinta-suave">
              {filtrados.length}
            </span>
          </h2>
        )}

        {filtrados.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-linea px-6 py-16 text-center text-sm text-tinta-suave">
            No encontramos nada con eso.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 md:gap-x-4 lg:grid-cols-4">
              {visibles.map((p) => (
                <Tarjeta key={p.id} producto={p} />
              ))}
            </div>

            {visibles.length < filtrados.length && (
              <div className="flex flex-col items-center gap-2 pt-6">
                <p className="cifra text-xs text-tinta-suave">
                  {visibles.length} de {filtrados.length}
                </p>
                <button
                  type="button"
                  onClick={() => setCuantos((n) => n + TANDA)}
                  className="rounded-full border border-linea bg-tarjeta px-6 py-2.5 text-sm"
                >
                  Ver más
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
