import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  clientes,
  movimientos,
  productos,
  ventas,
  ventasItems,
  ventasPagos,
} from "@/db/schema";
import type { MedioPago } from "@/lib/negocio";
import type { Rango } from "@/lib/periodo";

/**
 * Las consultas de la sección Ventas (ventas, fiado, historial).
 *
 * Viven acá y no en `caja.ts` porque las tres solapas comparten el mismo
 * período y las mismas reglas, y juntas se leen mejor que repartidas.
 *
 * Todas filtran por el rango con fechas locales `YYYY-MM-DD`, extremos
 * incluidos —la misma forma en que se guardan en la base—, así que no hay
 * zonas horarias que pensar.
 */

/**
 * Tope de filas que dibuja una planilla. "Todo" puede traer miles de cargas y
 * una tabla de ese tamaño no se lee: los KPIs se calculan aparte, en SQL, sobre
 * el período entero, así que el tope sólo recorta lo que se ve.
 */
export const TOPE_FILAS = 1000;

export type PorMedio = Partial<Record<MedioPago, number>>;

export type FilaVenta = {
  id: string;
  cuando: Date;
  cliente: { id: string; nombre: string } | null;
  /** los ítems resumidos, ej "2 × Coca 2,25 + 3 más" */
  detalle: string | null;
  totalCentavos: number;
  /** lo que valían los ítems de más respecto de lo cobrado; 0 si no hubo */
  descuentoCentavos: number;
  porMedio: PorMedio;
  pendiente: boolean;
  anulada: boolean;
};

export type ResumenVentas = {
  /** ventas que cuentan: ni anuladas ni esperando el QR */
  cobradas: number;
  cobradoCentavos: number;
  pendientes: number;
  anuladas: number;
};

function condicionVentas(rango: Rango) {
  const condiciones = [];
  if (rango.desde) condiciones.push(gte(ventas.fecha, rango.desde));
  if (rango.hasta) condiciones.push(lte(ventas.fecha, rango.hasta));
  return condiciones.length ? and(...condiciones) : undefined;
}

function condicionMovimientos(rango: Rango) {
  const condiciones = [];
  if (rango.desde) condiciones.push(gte(movimientos.fecha, rango.desde));
  if (rango.hasta) condiciones.push(lte(movimientos.fecha, rango.hasta));
  return condiciones.length ? and(...condiciones) : undefined;
}

export async function resumenDeVentas(rango: Rango): Promise<ResumenVentas> {
  const db = await getDb();
  const [fila] = await db
    .select({
      cobradas: sql<string>`count(*) filter (where ${ventas.anuladoEn} is null and ${ventas.pendienteEn} is null)`,
      cobrado: sql<string>`coalesce(sum(${ventas.montoCentavos}) filter (where ${ventas.anuladoEn} is null and ${ventas.pendienteEn} is null), 0)`,
      pendientes: sql<string>`count(*) filter (where ${ventas.anuladoEn} is null and ${ventas.pendienteEn} is not null)`,
      anuladas: sql<string>`count(*) filter (where ${ventas.anuladoEn} is not null)`,
    })
    .from(ventas)
    .where(condicionVentas(rango));

  return {
    cobradas: Number(fila?.cobradas ?? 0),
    cobradoCentavos: Number(fila?.cobrado ?? 0),
    pendientes: Number(fila?.pendientes ?? 0),
    anuladas: Number(fila?.anuladas ?? 0),
  };
}

/** "2 × Coca 2,25 + 3 más": el primer ítem y cuántos más hubo. */
function resumirItems(
  items: { descripcion: string; cantidad: number }[],
): string | null {
  if (items.length === 0) return null;
  const [primero, ...resto] = items;
  const cabeza =
    primero.cantidad > 1
      ? `${primero.cantidad} × ${primero.descripcion}`
      : primero.descripcion;
  return resto.length ? `${cabeza} + ${resto.length} más` : cabeza;
}

export async function listarVentas(rango: Rango): Promise<FilaVenta[]> {
  const db = await getDb();

  const base = await db
    .select({
      id: ventas.id,
      cuando: ventas.creadoEn,
      monto: ventas.montoCentavos,
      medio: ventas.medio,
      nota: ventas.nota,
      pendienteEn: ventas.pendienteEn,
      anuladoEn: ventas.anuladoEn,
      clienteId: clientes.id,
      clienteNombre: clientes.nombre,
    })
    .from(ventas)
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .where(condicionVentas(rango))
    .orderBy(desc(ventas.creadoEn))
    .limit(TOPE_FILAS);

  if (base.length === 0) return [];
  const ids = base.map((v) => v.id);

  const [pagos, items] = await Promise.all([
    db
      .select({
        ventaId: ventasPagos.ventaId,
        medio: ventasPagos.medio,
        importe: ventasPagos.importeCentavos,
      })
      .from(ventasPagos)
      .where(inArray(ventasPagos.ventaId, ids)),
    db
      .select({
        ventaId: ventasItems.ventaId,
        descripcion: ventasItems.descripcion,
        producto: productos.nombre,
        cantidad: ventasItems.cantidad,
        precio: ventasItems.precioUnitarioCentavos,
      })
      .from(ventasItems)
      .leftJoin(productos, eq(productos.id, ventasItems.productoId))
      .where(inArray(ventasItems.ventaId, ids))
      .orderBy(asc(ventasItems.posicion)),
  ]);

  const pagosDe = new Map<string, PorMedio>();
  for (const p of pagos) {
    const actual = pagosDe.get(p.ventaId) ?? {};
    actual[p.medio] = (actual[p.medio] ?? 0) + Number(p.importe);
    pagosDe.set(p.ventaId, actual);
  }

  const itemsDe = new Map<
    string,
    { descripcion: string; cantidad: number; precio: number }[]
  >();
  for (const i of items) {
    const lista = itemsDe.get(i.ventaId) ?? [];
    lista.push({
      descripcion: i.descripcion?.trim() || i.producto || "Sin nombre",
      cantidad: i.cantidad,
      precio: Number(i.precio),
    });
    itemsDe.set(i.ventaId, lista);
  }

  return base.map((v) => {
    const suyos = itemsDe.get(v.id) ?? [];
    const valorDeItems = suyos.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const total = Number(v.monto);
    return {
      id: v.id,
      cuando: v.cuando,
      cliente: v.clienteId
        ? { id: v.clienteId, nombre: v.clienteNombre ?? "—" }
        : null,
      // Una venta cargada como "vendí $40.000 en la mañana" no tiene ítems: lo
      // único que la describe es la nota.
      detalle: resumirItems(suyos) ?? (v.nota?.trim() || null),
      totalCentavos: total,
      descuentoCentavos:
        suyos.length > 0 && valorDeItems > total ? valorDeItems - total : 0,
      // Las ventas viejas no tienen filas en `ventas_pagos`: tienen un solo
      // medio, el de la propia venta, y ese medio se llevó todo el total.
      porMedio: pagosDe.get(v.id) ?? { [v.medio]: total },
      pendiente: v.pendienteEn !== null,
      anulada: v.anuladoEn !== null,
    };
  });
}

export type ResumenFiado = {
  /** lo fiado en el período, sin las anuladas */
  fiadoCentavos: number;
  /** lo que pagaron en el período, sin las anuladas */
  pagadoCentavos: number;
  movimientos: number;
};

export async function resumenDeMovimientos(rango: Rango): Promise<ResumenFiado> {
  const db = await getDb();
  const [fila] = await db
    .select({
      fiado: sql<string>`coalesce(sum(${movimientos.montoCentavos}) filter (where ${movimientos.tipo} = 'fiado' and ${movimientos.anuladoEn} is null), 0)`,
      pagado: sql<string>`coalesce(sum(${movimientos.montoCentavos}) filter (where ${movimientos.tipo} = 'pago' and ${movimientos.anuladoEn} is null), 0)`,
      cuantos: sql<string>`count(*)`,
    })
    .from(movimientos)
    .where(condicionMovimientos(rango));

  return {
    fiadoCentavos: Number(fila?.fiado ?? 0),
    pagadoCentavos: Number(fila?.pagado ?? 0),
    movimientos: Number(fila?.cuantos ?? 0),
  };
}

export type FilaMovimiento = {
  id: string;
  cuando: Date;
  fecha: string;
  clienteId: string;
  cliente: string;
  tipo: "fiado" | "pago";
  montoCentavos: number;
  /** sólo significa algo en un pago: el fiado no mueve plata */
  medio: MedioPago;
  nota: string | null;
  anulado: boolean;
};

export async function listarMovimientos(rango: Rango): Promise<FilaMovimiento[]> {
  const db = await getDb();
  const filas = await db
    .select({
      id: movimientos.id,
      cuando: movimientos.creadoEn,
      fecha: movimientos.fecha,
      clienteId: clientes.id,
      cliente: clientes.nombre,
      tipo: movimientos.tipo,
      monto: movimientos.montoCentavos,
      medio: movimientos.medio,
      nota: movimientos.nota,
      anuladoEn: movimientos.anuladoEn,
    })
    .from(movimientos)
    .innerJoin(clientes, eq(clientes.id, movimientos.clienteId))
    .where(condicionMovimientos(rango))
    .orderBy(desc(movimientos.creadoEn))
    .limit(TOPE_FILAS);

  return filas.map((f) => ({
    id: f.id,
    cuando: f.cuando,
    fecha: f.fecha,
    clienteId: f.clienteId,
    cliente: f.cliente,
    tipo: f.tipo,
    montoCentavos: Number(f.monto),
    medio: f.medio,
    nota: f.nota?.trim() || null,
    anulado: f.anuladoEn !== null,
  }));
}

/**
 * Cuántos clientes tienen deuda abierta. Es el número de la solapa Fiado, y va
 * en las tres páginas, así que se cuenta en la base y no trayendo la lista.
 * El saldo se calcula igual que en `listarClientes`: fiado suma, pago resta,
 * los anulados no cuentan.
 */
export async function contarDeudores(): Promise<number> {
  const db = await getDb();
  const filas = await db
    .select({ id: clientes.id })
    .from(clientes)
    .innerJoin(movimientos, eq(movimientos.clienteId, clientes.id))
    .where(and(isNull(clientes.archivadoEn), isNull(movimientos.anuladoEn)))
    .groupBy(clientes.id)
    .having(
      sql`sum(case when ${movimientos.tipo} = 'fiado' then ${movimientos.montoCentavos} else -${movimientos.montoCentavos} end) > 0`,
    );
  return filas.length;
}
