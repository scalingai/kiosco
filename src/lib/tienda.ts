import "server-only";

import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { categorias, marcas, productos } from "@/db/schema";

/**
 * La vidriera: lo que ve un cliente desde la calle.
 *
 * Esta consulta existe aparte de `listarStock()` por UNA razón, y es de
 * seguridad, no de prolijidad: la tienda es pública —no está detrás del PIN— y
 * `FilaStock` trae el COSTO de cada producto, el proveedor y el margen. Eso es
 * exactamente lo que no puede salir a la calle: es a cuánto compra el kiosco.
 *
 * Reusar la consulta de stock "filtrando en la pantalla" ya salió mal una vez
 * en este repo (el catálogo con costos viajaba al navegador en la pantalla de
 * login). Acá los campos sensibles no se filtran: no se seleccionan. Un
 * `select` que no los nombra no los puede filtrar de más.
 */
export type ProductoEnVidriera = {
  id: string;
  nombre: string;
  marca: string | null;
  rubro: string | null;
  precioCentavos: number;
  imagenUrl: string | null;
};

/**
 * Unas pocas fotos para el collage del banner.
 *
 * Se eligen de rubros DISTINTOS a propósito: cuatro alfajores uno al lado del
 * otro dicen "vendemos alfajores", y lo que el banner tiene que decir es
 * "tenemos de todo". El orden no se aleatoriza — un banner que cambia en cada
 * recarga se ve roto, no vivo.
 */
export function fotosParaElBanner(
  productos: ProductoEnVidriera[],
  cuantas = 5,
): ProductoEnVidriera[] {
  const vistos = new Set<string>();
  const elegidas: ProductoEnVidriera[] = [];

  for (const p of productos) {
    if (!p.imagenUrl) continue;
    const rubro = p.rubro ?? "sin rubro";
    if (vistos.has(rubro)) continue;
    vistos.add(rubro);
    elegidas.push(p);
    if (elegidas.length === cuantas) break;
  }

  // Si hay menos rubros que lugares, se completa con lo que haya: un hueco en
  // el collage se ve peor que repetir un rubro.
  if (elegidas.length < cuantas) {
    for (const p of productos) {
      if (!p.imagenUrl || elegidas.includes(p)) continue;
      elegidas.push(p);
      if (elegidas.length === cuantas) break;
    }
  }

  return elegidas;
}

export async function listarVidriera(): Promise<ProductoEnVidriera[]> {
  const db = await getDb();
  const padre = alias(categorias, "categoria_padre");

  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: marcas.nombre,
      // El rubro que se muestra es el de primer nivel (Bebidas, Golosinas):
      // la subcategoría parte el catálogo en treinta pedazos y para elegir una
      // gaseosa eso no ayuda.
      rubro: padre.nombre,
      precioCentavos: productos.precioVentaCentavos,
      imagenUrl: productos.imagenUrl,
    })
    .from(productos)
    .leftJoin(marcas, eq(marcas.id, productos.marcaId))
    .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
    .leftJoin(padre, eq(padre.id, categorias.padreId))
    .where(
      and(
        isNull(productos.archivadoEn),
        /*
         * Sin precio no se puede publicar. Un producto en la vidriera sin
         * número obliga a preguntar, que es justo lo que la tienda vino a
         * evitar — y mostrar "consultar precio" en un kiosco es raro.
         */
        isNotNull(productos.precioVentaCentavos),
      ),
    )
    .orderBy(asc(productos.nombre)) as Promise<ProductoEnVidriera[]>;
}
