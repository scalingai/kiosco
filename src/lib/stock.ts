import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, type DB } from "@/db/client";
import {
  compras,
  comprasItems,
  productos,
  proveedores,
} from "@/db/schema";
import { costoPorUnidad } from "@/lib/negocio";
import { normalizarNombre } from "@/lib/nombres";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ejecutor = Pick<DB, "select" | "insert" | "update">;

/**
 * Igual que clientes y proveedores: por nombre normalizado, y el índice único
 * evita duplicados si dos cargas caen juntas.
 */
export async function buscarOCrearProductoCon(db: Ejecutor, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const normalizado = normalizarNombre(limpio);
  if (!normalizado) return null;

  const [existente] = await db
    .select()
    .from(productos)
    .where(eq(productos.nombreNormalizado, normalizado))
    .limit(1);
  if (existente) return existente;

  const [creado] = await db
    .insert(productos)
    .values({ nombre: limpio, nombreNormalizado: normalizado })
    .onConflictDoNothing({ target: productos.nombreNormalizado })
    .returning();
  if (creado) return creado;

  const [ganadorDeLaCarrera] = await db
    .select()
    .from(productos)
    .where(eq(productos.nombreNormalizado, normalizado))
    .limit(1);
  return ganadorDeLaCarrera ?? null;
}

export async function listarNombresDeProductos() {
  const db = await getDb();
  return db
    .select({ id: productos.id, nombre: productos.nombre })
    .from(productos)
    .where(isNull(productos.archivadoEn))
    .orderBy(asc(productos.nombre));
}

export type FilaStock = {
  id: string;
  nombre: string;
  proveedor: string | null;
  falta: boolean;
  /** lo que salió cada unidad la última vez que se compró */
  costoUnitarioCentavos: number | null;
  ultimaCompra: string | null;
  /** cómo venía: 3 packs de 6, por ejemplo */
  cantidad: number | null;
  unidadesPorBulto: number | null;
};

/**
 * El catálogo con el último costo de cada cosa.
 *
 * El último costo NO se guarda en `productos`: se lee de la última compra. Es
 * la misma regla que el saldo del fiado — un campo copiado se desactualiza en
 * silencio y después nadie sabe cuál de los dos números es el bueno.
 */
export async function listarStock(): Promise<FilaStock[]> {
  const db = await getDb();

  const [catalogo, renglones] = await Promise.all([
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        falta: productos.falta,
        proveedor: proveedores.nombre,
      })
      .from(productos)
      .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
      .where(isNull(productos.archivadoEn))
      .orderBy(asc(productos.nombre)),

    // Ordenado de más viejo a más nuevo: al recorrerlo, lo último que se
    // escribe de cada producto es su compra más reciente.
    db
      .select({
        productoId: comprasItems.productoId,
        cantidad: comprasItems.cantidad,
        unidadesPorBulto: comprasItems.unidadesPorBulto,
        importeCentavos: comprasItems.importeCentavos,
        fecha: compras.fecha,
      })
      .from(comprasItems)
      .innerJoin(compras, eq(compras.id, comprasItems.compraId))
      .where(isNull(compras.anuladoEn))
      .orderBy(asc(compras.fecha), asc(compras.creadoEn)),
  ]);

  const ultima = new Map<string, (typeof renglones)[number]>();
  for (const renglon of renglones) {
    if (renglon.productoId) ultima.set(renglon.productoId, renglon);
  }

  return catalogo.map((producto) => {
    const compra = ultima.get(producto.id);
    return {
      id: producto.id,
      nombre: producto.nombre,
      proveedor: producto.proveedor,
      falta: producto.falta,
      costoUnitarioCentavos: compra ? costoPorUnidad(compra) : null,
      ultimaCompra: compra?.fecha ?? null,
      cantidad: compra?.cantidad ?? null,
      unidadesPorBulto: compra?.unidadesPorBulto ?? null,
    };
  });
}

/** Marcar que falta, o que ya se repuso. Es lo único que se carga a mano acá. */
export async function marcarFalta(id: string, falta: boolean) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(productos)
    .set({ falta })
    .where(eq(productos.id, id))
    .returning();
  return fila ?? null;
}

export async function crearProducto(nombre: string) {
  const db = await getDb();
  const producto = await buscarOCrearProductoCon(db, nombre);
  if (!producto) throw new Error("El nombre del producto no puede estar vacío");
  return producto;
}

/** Sacarlo de la lista sin borrar el historial de compras que lo menciona. */
export async function archivarProducto(id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(productos)
    .set({ archivadoEn: new Date() })
    .where(and(eq(productos.id, id), isNull(productos.archivadoEn)))
    .returning();
  return fila ?? null;
}

/** Cuántas cosas están marcadas como faltantes, para el resumen de inicio. */
export async function contarFaltantes(): Promise<number> {
  const db = await getDb();
  const filas = await db
    .select({ id: productos.id })
    .from(productos)
    .where(and(eq(productos.falta, true), isNull(productos.archivadoEn)));
  return filas.length;
}

/** Los faltantes, para la lista que se lleva al mayorista. */
export async function listarFaltantes() {
  const db = await getDb();
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      proveedor: proveedores.nombre,
    })
    .from(productos)
    .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
    .where(and(eq(productos.falta, true), isNull(productos.archivadoEn)))
    // Agrupados por proveedor: la lista se usa para ir a comprar, y se compra
    // por proveedor, no por orden alfabético.
    .orderBy(asc(proveedores.nombre), asc(productos.nombre));
}
