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
