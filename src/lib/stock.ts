import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, type DB } from "@/db/client";
import {
  compras,
  comprasItems,
  marcas,
  productos,
  proveedores,
} from "@/db/schema";
import {
  costoDeReferencia,
  costoPorContenido,
  type Unidad,
} from "@/lib/negocio";
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
  marcaId: string | null;
  marca: string | null;
  /** cuánto trae una unidad de venta: 2250 (ml) para la Coca grande */
  contenido: number | null;
  contenidoUnidad: Unidad | null;
  falta: boolean;
  /** lo que salió la unidad, el kilo o el litro, la última vez que se compró */
  costoCentavos: number | null;
  /** cómo se lee ese costo: "cada una", "el kilo", "el litro" */
  porCada: string | null;
  ultimaCompra: string | null;
  /**
   * Lo mismo llevado a kilo o litro, cuando el producto declara su contenido.
   * Es el único número con el que se pueden comparar dos tamaños entre sí.
   */
  porContenidoCentavos: number | null;
  porContenido: string | null;
  /** cómo venía: 3 packs de 6 unidades, o 2 bolsas de 1000 gr */
  cantidad: number | null;
  unidadesPorBulto: number | null;
  unidad: Unidad | null;
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
        marcaId: productos.marcaId,
        marca: marcas.nombre,
        contenido: productos.contenido,
        contenidoUnidad: productos.contenidoUnidad,
      })
      .from(productos)
      .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
      .leftJoin(marcas, eq(marcas.id, productos.marcaId))
      .where(isNull(productos.archivadoEn))
      .orderBy(asc(productos.nombre)),

    // Ordenado de más viejo a más nuevo: al recorrerlo, lo último que se
    // escribe de cada producto es su compra más reciente.
    db
      .select({
        productoId: comprasItems.productoId,
        cantidad: comprasItems.cantidad,
        unidadesPorBulto: comprasItems.unidadesPorBulto,
        unidad: comprasItems.unidad,
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
    const costo = compra ? costoDeReferencia(compra) : null;
    const porContenido = compra
      ? costoPorContenido({
          ...compra,
          contenido: producto.contenido,
          contenidoUnidad: producto.contenidoUnidad,
        })
      : null;
    return {
      id: producto.id,
      nombre: producto.nombre,
      proveedor: producto.proveedor,
      marcaId: producto.marcaId,
      marca: producto.marca,
      contenido: producto.contenido,
      contenidoUnidad: producto.contenidoUnidad,
      falta: producto.falta,
      costoCentavos: costo?.centavos ?? null,
      porCada: costo?.porCada ?? null,
      porContenidoCentavos: porContenido?.centavos ?? null,
      porContenido: porContenido?.porCada ?? null,
      ultimaCompra: compra?.fecha ?? null,
      cantidad: compra?.cantidad ?? null,
      unidadesPorBulto: compra?.unidadesPorBulto ?? null,
      unidad: compra?.unidad ?? null,
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

/* ── Marcas ───────────────────────────────────────────────────────────────── */

/** Mismo patrón que clientes, proveedores y productos. */
async function buscarOCrearMarcaCon(db: Ejecutor, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const normalizado = normalizarNombre(limpio);
  if (!normalizado) return null;

  const [existente] = await db
    .select()
    .from(marcas)
    .where(eq(marcas.nombreNormalizado, normalizado))
    .limit(1);
  if (existente) return existente;

  const [creada] = await db
    .insert(marcas)
    .values({ nombre: limpio, nombreNormalizado: normalizado })
    .onConflictDoNothing({ target: marcas.nombreNormalizado })
    .returning();
  if (creada) return creada;

  const [ganadora] = await db
    .select()
    .from(marcas)
    .where(eq(marcas.nombreNormalizado, normalizado))
    .limit(1);
  return ganadora ?? null;
}

export async function listarMarcas() {
  const db = await getDb();
  return db
    .select({ id: marcas.id, nombre: marcas.nombre })
    .from(marcas)
    .where(isNull(marcas.archivadoEn))
    .orderBy(asc(marcas.nombre));
}

export type FichaProducto = {
  nombre?: string;
  /** vacío saca la marca; el pan no tiene y está bien */
  marca?: string | null;
  contenido?: number | null;
  contenidoUnidad?: Unidad | null;
};

/**
 * Lo que se edita a mano de un producto. El costo y el proveedor NO están acá:
 * esos los escribe la última compra, y dejarlos editar sería tener dos
 * verdades para el mismo número.
 */
export async function actualizarProducto(id: string, ficha: FichaProducto) {
  if (!UUID.test(id)) return null;
  const db = await getDb();

  const cambios: {
    nombre?: string;
    nombreNormalizado?: string;
    marcaId?: string | null;
    contenido?: number | null;
    contenidoUnidad?: Unidad | null;
  } = {};

  if (ficha.nombre != null) {
    const limpio = ficha.nombre.trim();
    if (!limpio) throw new Error("El nombre no puede estar vacío");
    cambios.nombre = limpio;
    cambios.nombreNormalizado = normalizarNombre(limpio);
  }

  if (ficha.marca !== undefined) {
    const marca = ficha.marca
      ? await buscarOCrearMarcaCon(db, ficha.marca)
      : null;
    cambios.marcaId = marca?.id ?? null;
  }

  if (ficha.contenido !== undefined) {
    // El contenido y su unidad viajan juntos: un 2250 sin decir de qué no se
    // puede leer, y una unidad sin número no mide nada.
    cambios.contenido =
      ficha.contenido && ficha.contenido > 0 ? ficha.contenido : null;
    cambios.contenidoUnidad = cambios.contenido
      ? (ficha.contenidoUnidad ?? null)
      : null;
    if (cambios.contenido && !cambios.contenidoUnidad) {
      throw new Error("Falta decir si el contenido va en gramos o mililitros");
    }
  }

  if (!Object.keys(cambios).length) return null;

  const [fila] = await db
    .update(productos)
    .set(cambios)
    .where(eq(productos.id, id))
    .returning();
  return fila ?? null;
}
