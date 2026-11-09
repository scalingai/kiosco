import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  compras,
  comprasItems,
  productos,
  proveedores,
  reposiciones,
  reposicionesItems,
} from "@/db/schema";
import {
  costoConIva,
  MARGEN_SUGERIDO_MILESIMAS,
  MILESIMAS,
  redondearPrecio,
} from "@/lib/negocio";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que se le va a pedir al proveedor, renglón por renglón, con las cuentas
 * ya hechas.
 *
 * Los tres números calculados (`costoUnitario`, `sugerido`, `margenReal`) NO
 * se guardan: salen de `importeBultoCentavos` cada vez que se lee. Guardarlos
 * sería tener dos verdades para el mismo número, y la que está en la base se
 * queda vieja en cuanto alguien corrige la cantidad.
 */
export type RenglonDePedido = {
  id: string;
  productoId: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  cantidad: number;
  unidadesPorBulto: number;
  /** null = el proveedor todavía no cantó el precio */
  importeBultoCentavos: number | null;
  /** lo que sale el renglón entero */
  totalCentavos: number | null;
  /** con IVA ya aplicado si la compra es en blanco */
  costoUnitarioCentavos: number | null;
  /** a cuánto convendría venderlo, con el multiplicador del producto */
  sugeridoCentavos: number | null;
  /** lo que hoy figura en la góndola */
  precioVentaCentavos: number | null;
  /** el margen que daría el precio de hoy contra ESTE costo, en porciento */
  margenRealPorciento: number | null;
  /** lo que salía el bulto la última vez que se compró, para ver si subió */
  importeBultoAnteriorCentavos: number | null;
};

export type PedidoDeReposicion = {
  id: string;
  proveedorId: string;
  proveedor: string;
  enBlanco: boolean;
  nota: string | null;
  cerradaEn: Date | null;
  renglones: RenglonDePedido[];
  /** la suma de los renglones que YA tienen precio */
  totalCentavos: number;
  /** cuántos renglones están esperando que el proveedor diga cuánto sale */
  sinPrecio: number;
};

/** Las cuentas de un renglón. Es la única parte con matemática. */
function calcular(
  cantidad: number,
  unidadesPorBulto: number,
  importeBulto: number | null,
  enBlanco: boolean,
  multiplicadorMilesimas: number | null,
  precioVenta: number | null,
) {
  const unidades = cantidad * unidadesPorBulto;
  if (importeBulto == null || unidades <= 0) {
    return {
      totalCentavos: null,
      costoUnitarioCentavos: null,
      sugeridoCentavos: null,
      margenRealPorciento: null,
    };
  }

  const total = cantidad * importeBulto;
  // En blanco el mayorista factura + IVA: lo que sale de verdad es el importe
  // por 1,21. En negro, el importe ya es el costo.
  const costoUnitario = Math.round(costoConIva(total, enBlanco) / unidades);
  const multiplicador = multiplicadorMilesimas ?? MARGEN_SUGERIDO_MILESIMAS;
  const sugerido = redondearPrecio(
    Math.round((costoUnitario * multiplicador) / MILESIMAS),
  );

  return {
    totalCentavos: total,
    costoUnitarioCentavos: costoUnitario,
    sugeridoCentavos: sugerido,
    margenRealPorciento:
      precioVenta && precioVenta > 0
        ? Math.round(((precioVenta - costoUnitario) / precioVenta) * 100)
        : null,
  };
}

/**
 * Lo que salía el bulto la última vez que se le compró ESE producto a ESE
 * proveedor.
 *
 * Es el número que hace útil la pantalla: sin él, "el cajón sale $69.000" no
 * se puede juzgar. Con él, al lado dice que la vez pasada salía $63.000 y la
 * suba se ve sola.
 *
 * Se divide por `cantidad` porque las compras guardan el importe del RENGLÓN
 * entero (lo que dice la factura) y acá se trabaja por bulto.
 */
async function ultimosImportes(
  proveedorId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const filas = await db
    .select({
      productoId: comprasItems.productoId,
      importe: comprasItems.importeCentavos,
      cantidad: comprasItems.cantidad,
      fecha: compras.fecha,
    })
    .from(comprasItems)
    .innerJoin(compras, eq(compras.id, comprasItems.compraId))
    .where(
      and(
        eq(compras.proveedorId, proveedorId),
        isNull(compras.anuladoEn),
        sql`${comprasItems.productoId} is not null`,
        sql`${comprasItems.importeCentavos} is not null`,
      ),
    )
    .orderBy(desc(compras.fecha));

  const porProducto = new Map<string, number>();
  for (const f of filas) {
    // Vienen de la más nueva a la más vieja: la primera que aparece gana.
    if (!f.productoId || porProducto.has(f.productoId)) continue;
    if (!f.importe || f.cantidad <= 0) continue;
    porProducto.set(f.productoId, Math.round(f.importe / f.cantidad));
  }
  return porProducto;
}

export async function leerPedido(
  id: string,
): Promise<PedidoDeReposicion | null> {
  if (!UUID.test(id)) return null;
  const db = await getDb();

  const [cabecera] = await db
    .select({
      id: reposiciones.id,
      proveedorId: reposiciones.proveedorId,
      proveedor: proveedores.nombre,
      enBlanco: reposiciones.enBlanco,
      nota: reposiciones.nota,
      cerradaEn: reposiciones.cerradaEn,
    })
    .from(reposiciones)
    .innerJoin(proveedores, eq(proveedores.id, reposiciones.proveedorId))
    .where(and(eq(reposiciones.id, id), isNull(reposiciones.archivadaEn)));

  if (!cabecera) return null;

  const filas = await db
    .select({
      id: reposicionesItems.id,
      productoId: reposicionesItems.productoId,
      nombre: productos.nombre,
      imagenUrl: productos.imagenUrl,
      cantidad: reposicionesItems.cantidad,
      unidadesPorBulto: reposicionesItems.unidadesPorBulto,
      importeBulto: reposicionesItems.importeBultoCentavos,
      precioVenta: productos.precioVentaCentavos,
      multiplicador: productos.multiplicadorMilesimas,
      posicion: reposicionesItems.posicion,
    })
    .from(reposicionesItems)
    .innerJoin(productos, eq(productos.id, reposicionesItems.productoId))
    .where(eq(reposicionesItems.reposicionId, id))
    .orderBy(reposicionesItems.posicion);

  const anteriores = await ultimosImportes(cabecera.proveedorId);

  let total = 0;
  let sinPrecio = 0;
  const renglones: RenglonDePedido[] = filas.map((f) => {
    const cuentas = calcular(
      f.cantidad,
      f.unidadesPorBulto,
      f.importeBulto,
      cabecera.enBlanco,
      f.multiplicador,
      f.precioVenta,
    );
    if (cuentas.totalCentavos == null) sinPrecio++;
    else total += cuentas.totalCentavos;

    return {
      id: f.id,
      productoId: f.productoId,
      nombre: f.nombre,
      marca: null,
      imagenUrl: f.imagenUrl,
      cantidad: f.cantidad,
      unidadesPorBulto: f.unidadesPorBulto,
      importeBultoCentavos: f.importeBulto,
      precioVentaCentavos: f.precioVenta,
      importeBultoAnteriorCentavos: anteriores.get(f.productoId) ?? null,
      ...cuentas,
    };
  });

  return {
    ...cabecera,
    renglones,
    totalCentavos: total,
    sinPrecio,
  };
}

/** Los pedidos abiertos, para la lista. */
export async function listarPedidos() {
  const db = await getDb();
  return db
    .select({
      id: reposiciones.id,
      proveedor: proveedores.nombre,
      enBlanco: reposiciones.enBlanco,
      cerradaEn: reposiciones.cerradaEn,
      creadaEn: reposiciones.creadaEn,
      renglones: sql<number>`(
        select count(*)::int from ${reposicionesItems}
        where ${reposicionesItems.reposicionId} = ${reposiciones.id}
      )`,
    })
    .from(reposiciones)
    .innerJoin(proveedores, eq(proveedores.id, reposiciones.proveedorId))
    .where(isNull(reposiciones.archivadaEn))
    .orderBy(desc(reposiciones.creadaEn));
}

export async function abrirPedido(proveedorId: string, enBlanco: boolean) {
  if (!UUID.test(proveedorId)) throw new Error("Ese proveedor no existe");
  const db = await getDb();
  const [fila] = await db
    .insert(reposiciones)
    .values({ proveedorId, enBlanco })
    .returning();
  return fila;
}

/**
 * Arranca el pedido con lo que ya se le compró a ese proveedor alguna vez.
 *
 * Es el atajo que hace que la pantalla sirva desde el primer segundo: las
 * cantidades y los bultos salen de la última compra, así que lo normal es
 * mirar la lista y corregir dos renglones en vez de cargar treinta.
 *
 * El importe NO se copia: el precio de la vez pasada no es el de hoy, y
 * dejarlo puesto haría que el total diga algo que nadie cotizó. Se muestra al
 * lado como referencia, que es otra cosa.
 */
export async function llenarConLoDeSiempre(reposicionId: string) {
  if (!UUID.test(reposicionId)) throw new Error("Ese pedido no existe");
  const db = await getDb();

  const [cab] = await db
    .select({ proveedorId: reposiciones.proveedorId })
    .from(reposiciones)
    .where(eq(reposiciones.id, reposicionId));
  if (!cab) throw new Error("Ese pedido no existe");

  const filas = await db
    .select({
      productoId: comprasItems.productoId,
      cantidad: comprasItems.cantidad,
      unidadesPorBulto: comprasItems.unidadesPorBulto,
      fecha: compras.fecha,
    })
    .from(comprasItems)
    .innerJoin(compras, eq(compras.id, comprasItems.compraId))
    .where(
      and(
        eq(compras.proveedorId, cab.proveedorId),
        isNull(compras.anuladoEn),
        sql`${comprasItems.productoId} is not null`,
      ),
    )
    .orderBy(desc(compras.fecha));

  const vistos = new Set<string>();
  const aMeter: {
    reposicionId: string;
    productoId: string;
    cantidad: number;
    unidadesPorBulto: number;
    posicion: number;
  }[] = [];

  for (const f of filas) {
    if (!f.productoId || vistos.has(f.productoId)) continue;
    vistos.add(f.productoId);
    aMeter.push({
      reposicionId,
      productoId: f.productoId,
      cantidad: f.cantidad,
      unidadesPorBulto: f.unidadesPorBulto,
      posicion: aMeter.length,
    });
  }

  if (!aMeter.length) return 0;
  // `onConflictDoNothing` sobre el índice único: si el producto ya está en el
  // pedido, se respeta lo que haya cargado una persona.
  await db.insert(reposicionesItems).values(aMeter).onConflictDoNothing();
  return aMeter.length;
}

export async function ponerRenglon(
  reposicionId: string,
  productoId: string,
  datos: {
    cantidad?: number;
    unidadesPorBulto?: number;
    importeBultoCentavos?: number | null;
  },
) {
  if (!UUID.test(reposicionId) || !UUID.test(productoId)) {
    throw new Error("No encontré ese renglón");
  }
  const db = await getDb();

  const valores = {
    cantidad: Math.max(1, Math.min(999, Math.round(datos.cantidad ?? 1))),
    unidadesPorBulto: Math.max(
      1,
      Math.min(9999, Math.round(datos.unidadesPorBulto ?? 1)),
    ),
    importeBultoCentavos:
      datos.importeBultoCentavos == null
        ? null
        : Math.max(0, Math.round(datos.importeBultoCentavos)),
  };

  await db
    .insert(reposicionesItems)
    .values({ reposicionId, productoId, ...valores })
    .onConflictDoUpdate({
      target: [
        reposicionesItems.reposicionId,
        reposicionesItems.productoId,
      ],
      set: valores,
    });
}

export async function sacarRenglon(id: string) {
  if (!UUID.test(id)) return;
  const db = await getDb();
  await db.delete(reposicionesItems).where(eq(reposicionesItems.id, id));
}

export async function cambiarEnBlanco(id: string, enBlanco: boolean) {
  if (!UUID.test(id)) return;
  const db = await getDb();
  await db.update(reposiciones).set({ enBlanco }).where(eq(reposiciones.id, id));
}

/** Se archiva, no se borra: igual que todo lo demás acá. */
export async function archivarPedido(id: string) {
  if (!UUID.test(id)) return;
  const db = await getDb();
  await db
    .update(reposiciones)
    .set({ archivadaEn: new Date() })
    .where(eq(reposiciones.id, id));
}
