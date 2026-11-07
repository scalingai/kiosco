import "server-only";

import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sucursales, ventas, type Sucursal } from "@/db/schema";
import { normalizarNombre } from "@/lib/nombres";
import type { CajaCreada } from "@/lib/mercadopago";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los locales del kiosco. Cada uno cobra con SU cuenta de Mercado Pago, así que
 * acá vive la conexión y el QR impreso de cada mostrador.
 */
export type FilaSucursal = {
  id: string;
  nombre: string;
  /** si ya autorizó Mercado Pago */
  conectada: boolean;
  /** si además ya tiene el QR creado para imprimir */
  qrImagen: string | null;
  mpExternalPosId: string | null;
};

export async function listarSucursales(): Promise<FilaSucursal[]> {
  const db = await getDb();
  const filas = await db
    .select()
    .from(sucursales)
    .where(isNull(sucursales.archivadoEn))
    .orderBy(asc(sucursales.nombre));

  return filas.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    // El token nunca sale de acá: lo que la pantalla necesita saber es si está
    // o no conectada, no cuál es la credencial.
    conectada: Boolean(s.mpAccessToken),
    qrImagen: s.mpQrImagen,
    mpExternalPosId: s.mpExternalPosId,
  }));
}

export async function obtenerSucursal(id: string): Promise<Sucursal | null> {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .select()
    .from(sucursales)
    .where(eq(sucursales.id, id))
    .limit(1);
  return fila ?? null;
}

export async function agregarSucursal(nombre: string): Promise<Sucursal> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("La sucursal necesita un nombre");

  const db = await getDb();
  const normalizado = normalizarNombre(limpio);

  const [creada] = await db
    .insert(sucursales)
    .values({ nombre: limpio, nombreNormalizado: normalizado })
    .onConflictDoNothing({ target: sucursales.nombreNormalizado })
    .returning();
  if (creada) return creada;

  const [existente] = await db
    .select()
    .from(sucursales)
    .where(eq(sucursales.nombreNormalizado, normalizado))
    .limit(1);
  return existente;
}

export async function guardarCajaDeSucursal(
  id: string,
  caja: CajaCreada,
): Promise<void> {
  if (!UUID.test(id)) return;
  const db = await getDb();
  await db
    .update(sucursales)
    .set({
      mpStoreId: caja.storeId,
      mpPosId: caja.posId,
      mpExternalPosId: caja.externalPosId,
      mpQrImagen: caja.qrImagen,
    })
    .where(eq(sucursales.id, id));
}

/**
 * La orden que quedó colgada en el QR de esa sucursal, si hay alguna.
 *
 * Sirve para sacarla antes de poner un monto nuevo: con dos órdenes abiertas a
 * la vez, la documentación de Mercado Pago no dice cuál ve el cliente al
 * escanear, y eso no se averigua con la plata de alguien.
 */
export async function ordenPendienteDe(
  sucursalId: string,
  exceptoVentaId: string,
): Promise<string | null> {
  const db = await getDb();
  const [fila] = await db
    .select({ mpOrderId: ventas.mpOrderId })
    .from(ventas)
    .where(
      and(
        eq(ventas.sucursalId, sucursalId),
        isNull(ventas.anuladoEn),
        // Sólo las que de verdad están esperando: una venta ya cobrada no
        // tiene nada colgado del QR.
        isNotNull(ventas.pendienteEn),
        isNotNull(ventas.mpOrderId),
        ne(ventas.id, exceptoVentaId),
      ),
    )
    .orderBy(asc(ventas.creadoEn))
    .limit(1);
  return fila?.mpOrderId ?? null;
}

export async function obtenerVentaPendiente(ventaId: string) {
  if (!UUID.test(ventaId)) return null;
  const db = await getDb();
  const [fila] = await db
    .select({
      id: ventas.id,
      sucursalId: ventas.sucursalId,
      mpOrderId: ventas.mpOrderId,
    })
    .from(ventas)
    .where(eq(ventas.id, ventaId))
    .limit(1);
  return fila ?? null;
}
