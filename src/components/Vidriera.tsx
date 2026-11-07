"use client";

import { useMemo, useState } from "react";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos } from "@/lib/plata";
import type { ProductoEnVidriera } from "@/lib/tienda";

/**
 * La tienda, como la ve un cliente.
 *
 * El diseño sale de la tienda de AppGenda (`site/tienda/TiendaContent` y
 * `EditorialProductCard`): tarjeta blanca con la foto cuadrada arriba, borde
 * suave, el nombre en dos líneas y el precio grande abajo. La foto va ENTERA y
 * sin velo encima — los packshots vienen sobre fondo claro, y un degradé negro
 * les tapa media etiqueta.
 *
 * Lo que NO se trajo es el código: aquel componente son mil líneas atadas al
 * modelo de datos de AppGenda (carrito, checkout, temas por organización).
 * Acá hace falta una vidriera que se lee, no un e-commerce, y arrastrar todo
 * eso sería traer un carrito que no lleva a ninguna caja.
 */

/** Cuántos se dibujan de entrada. El resto entra al apretar "ver más". */
const TANDA = 24;

function Tarjeta({ producto }: { producto: ProductoEnVidriera }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-tarjeta shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
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
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [cuantos, setCuantos] = useState(TANDA);

  /** Los rubros que de verdad tienen algo publicado, con cuánto hay en cada uno. */
  const rubros = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const p of productos) {
      if (!p.rubro) continue;
      cuenta.set(p.rubro, (cuenta.get(p.rubro) ?? 0) + 1);
    }
    return [...cuenta.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
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

  function cambiarRubro(elegido: string | null) {
    setRubro(elegido);
    // Volver al principio: con el filtro nuevo, seguir mostrando 96 productos
    // de una tanda anterior deja la pantalla a mitad de camino.
    setCuantos(TANDA);
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-4 bg-papel/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setCuantos(TANDA);
          }}
          placeholder="Buscar un producto"
          aria-label="Buscar un producto"
          className="w-full rounded-full border border-linea bg-white px-5 py-3 text-base shadow-sm"
        />

        {rubros.length > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            <button
              type="button"
              onClick={() => cambiarRubro(null)}
              className={
                "shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors " +
                (rubro === null
                  ? "bg-acento text-white"
                  : "border border-linea bg-tarjeta text-tinta")
              }
            >
              Todo
            </button>
            {rubros.map((r) => (
              <button
                key={r.nombre}
                type="button"
                onClick={() => cambiarRubro(r.nombre)}
                className={
                  "shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors " +
                  (rubro === r.nombre
                    ? "bg-acento text-white"
                    : "border border-linea bg-tarjeta text-tinta")
                }
              >
                {r.nombre}{" "}
                <span className="cifra opacity-60">{r.total}</span>
              </button>
            ))}
          </div>
        )}
      </div>

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
            <div className="flex flex-col items-center gap-2 pt-2">
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
    </div>
  );
}
