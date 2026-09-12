import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DB } from "@/db/client";
import {
  categorias,
  compras,
  comprasItems,
  marcas,
  productos,
  proveedores,
} from "@/db/schema";
import {
  calcularMargen,
  costoConIva,
  costoDeReferencia,
  precioSugerido,
  type Margen,
  type Unidad,
} from "@/lib/negocio";
import { normalizarNombre } from "@/lib/nombres";

/**
 * Valida un código de barras por su dígito verificador.
 *
 * Los EAN-13 y EAN-8 llevan el último dígito calculado a partir de los otros,
 * justamente para detectar un dígito mal leído o mal tipeado. Chequearlo es lo
 * que evita el peor caso: un código que "parece" bien, se guarda, y el día que
 * se escanee trae otro producto.
 *
 * Los EAN argentinos arrancan en 779, pero eso NO se exige: en la góndola hay
 * importados y productos con código de otro país.
 */
export function codigoValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;
  if (codigo.length !== 8 && codigo.length !== 13) return false;

  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop()!;
  // De derecha a izquierda, uno de cada dos pesa 3 y el otro 1.
  const suma = digitos
    .reverse()
    .reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador;
}

/** La misma tabla otra vez, para poder leer la categoría padre en la consulta. */
const padre = alias(categorias, "categoria_padre");

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

/**
 * Los productos para elegir al cargar una compra.
 *
 * Van con su precio de venta y su multiplicador porque el renglón los necesita
 * para dos cosas: sugerir a cuánto venderlo, y avisar si el precio que estás
 * poniendo hoy es distinto del que tenía. Sin eso, el precio de la góndola
 * cambia sin que nadie lo note.
 */
export async function listarNombresDeProductos() {
  const db = await getDb();
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      precioVentaCentavos: productos.precioVentaCentavos,
      multiplicadorMilesimas: productos.multiplicadorMilesimas,
    })
    .from(productos)
    .where(isNull(productos.archivadoEn))
    .orderBy(asc(productos.nombre));
}

export type Envase = "botella" | "retornable" | "lata" | "tetra" | "otro";

export type FilaStock = {
  id: string;
  nombre: string;
  proveedor: string | null;
  marcaId: string | null;
  marca: string | null;
  categoriaId: string | null;
  /** el rubro chico: "Gaseosas" */
  subcategoria: string | null;
  /** el rubro grande, el padre del de arriba: "Bebidas" */
  categoria: string | null;
  envase: Envase | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  /** cuánto trae una unidad de venta: 2250 (ml) para la Coca grande */
  contenido: number | null;
  contenidoUnidad: Unidad | null;
  falta: boolean;
  /** lo que decía la factura: la unidad, el kilo o el litro, sin IVA */
  costoCentavos: number | null;
  /** cómo se lee ese costo: "cada una", "el kilo", "el litro" */
  porCada: string | null;
  /** la última compra fue con factura, así que al costo le falta el IVA */
  enBlanco: boolean;
  /** lo que sale DE VERDAD: el de arriba con el IVA ya sumado si va */
  costoRealCentavos: number | null;
  /** a cuánto se vende hoy, si alguien lo cargó */
  precioVentaCentavos: number | null;
  /** el multiplicador propio de este producto; null = usa el general */
  multiplicadorMilesimas: number | null;
  /** a cuánto habría que venderlo con SU multiplicador, ya redondeado */
  sugeridoCentavos: number | null;
  /** el margen que sale de verdad; sólo existe si hay precio de venta */
  margen: Margen | null;
  ultimaCompra: string | null;
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
        categoriaId: productos.categoriaId,
        subcategoria: categorias.nombre,
        categoria: padre.nombre,
        envase: productos.envase,
        codigoBarras: productos.codigoBarras,
        imagenUrl: productos.imagenUrl,
        contenido: productos.contenido,
        contenidoUnidad: productos.contenidoUnidad,
        precioVentaCentavos: productos.precioVentaCentavos,
        multiplicadorMilesimas: productos.multiplicadorMilesimas,
      })
      .from(productos)
      .leftJoin(proveedores, eq(proveedores.id, productos.proveedorId))
      .leftJoin(marcas, eq(marcas.id, productos.marcaId))
      // La categoría del producto es la subcategoría; el rubro grande es su
      // padre, y por eso la tabla se junta consigo misma.
      .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
      .leftJoin(padre, eq(padre.id, categorias.padreId))
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
        descuentoCentavos: comprasItems.descuentoCentavos,
        fecha: compras.fecha,
        enBlanco: compras.enBlanco,
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
    // La factura no dice lo que sale: comprando en blanco hay que sumarle el
    // IVA. Sobre ESE número se calcula el precio sugerido y el margen, porque
    // sacar el margen contra el importe de la factura infla la ganancia un 21%.
    const enBlanco = compra?.enBlanco ?? false;
    const costoReal =
      costo != null ? costoConIva(costo.centavos, enBlanco) : null;

    return {
      id: producto.id,
      nombre: producto.nombre,
      proveedor: producto.proveedor,
      marcaId: producto.marcaId,
      marca: producto.marca,
      categoriaId: producto.categoriaId,
      subcategoria: producto.subcategoria,
      categoria: producto.categoria,
      envase: producto.envase,
      codigoBarras: producto.codigoBarras,
      imagenUrl: producto.imagenUrl,
      contenido: producto.contenido,
      contenidoUnidad: producto.contenidoUnidad,
      enBlanco,
      costoRealCentavos: costoReal,
      precioVentaCentavos: producto.precioVentaCentavos,
      multiplicadorMilesimas: producto.multiplicadorMilesimas,
      sugeridoCentavos:
        costoReal != null
          ? precioSugerido(costoReal, producto.multiplicadorMilesimas)
          : null,
      margen:
        costoReal != null && producto.precioVentaCentavos != null
          ? calcularMargen(costoReal, producto.precioVentaCentavos)
          : null,
      falta: producto.falta,
      costoCentavos: costo?.centavos ?? null,
      porCada: costo?.porCada ?? null,
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

/**
 * Archiva varios de una. Se usa desde la selección múltiple del catálogo, que
 * es la única forma de podar 500 productos importados sin morir de clicks.
 *
 * Archiva, no borra: un producto archivado sale de la lista pero sigue
 * explicando las compras viejas que lo mencionan.
 */
export async function archivarProductos(ids: string[]): Promise<number> {
  const validos = ids.filter((id) => UUID.test(id));
  if (!validos.length) return 0;

  const db = await getDb();
  const filas = await db
    .update(productos)
    .set({ archivadoEn: new Date() })
    .where(and(inArray(productos.id, validos), isNull(productos.archivadoEn)))
    .returning({ id: productos.id });
  return filas.length;
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
  /** a cuánto se vende; `null` lo borra y vuelve a mostrarse el sugerido */
  precioVentaCentavos?: number | null;
  /** el multiplicador propio; `null` lo devuelve al general */
  multiplicadorMilesimas?: number | null;
  /** la subcategoría; `null` lo deja sin rubro */
  categoriaId?: string | null;
  envase?: Envase | null;
  /** el EAN del envase; `null` lo borra */
  codigoBarras?: string | null;
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
    precioVentaCentavos?: number | null;
    multiplicadorMilesimas?: number | null;
    categoriaId?: string | null;
    envase?: Envase | null;
    codigoBarras?: string | null;
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

  if (ficha.precioVentaCentavos !== undefined) {
    const precio = ficha.precioVentaCentavos;
    if (precio != null && precio <= 0) {
      throw new Error("El precio de venta tiene que ser mayor a cero");
    }
    cambios.precioVentaCentavos = precio;
  }

  if (ficha.multiplicadorMilesimas !== undefined) {
    const m = ficha.multiplicadorMilesimas;
    // Abajo de 1 estarías vendiendo a pérdida y arriba de 10 es un cero de más:
    // las dos son tipeos, no decisiones.
    if (m != null && (m < 1000 || m > 10_000)) {
      throw new Error("El multiplicador tiene que estar entre 1 y 10");
    }
    cambios.multiplicadorMilesimas = m;
  }

  if (ficha.categoriaId !== undefined) {
    cambios.categoriaId =
      ficha.categoriaId && UUID.test(ficha.categoriaId)
        ? ficha.categoriaId
        : null;
  }

  if (ficha.envase !== undefined) cambios.envase = ficha.envase;

  if (ficha.codigoBarras !== undefined) {
    const limpio = ficha.codigoBarras?.replace(/\D/g, "") ?? "";
    if (limpio && !codigoValido(limpio)) {
      throw new Error(
        "Ese código de barras no cierra. Revisá que esté completo y volvé a escanearlo.",
      );
    }
    cambios.codigoBarras = limpio || null;
  }

  if (!Object.keys(cambios).length) return null;

  const [fila] = await db
    .update(productos)
    .set(cambios)
    .where(eq(productos.id, id))
    .returning();
  return fila ?? null;
}

export type OpcionCategoria = { id: string; nombre: string; padre: string };

/**
 * Las subcategorías con el nombre de su padre. Es lo que se elige en la ficha
 * de un producto: nadie clasifica algo como "Bebidas" a secas, lo clasifica
 * como "Bebidas › Gaseosas".
 */
export async function listarSubcategorias(): Promise<OpcionCategoria[]> {
  const db = await getDb();
  const filas = await db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      padre: padre.nombre,
    })
    .from(categorias)
    .innerJoin(padre, eq(padre.id, categorias.padreId))
    .orderBy(asc(padre.nombre), asc(categorias.nombre));
  return filas.map((f) => ({ ...f, padre: f.padre ?? "" }));
}
