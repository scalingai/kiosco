import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sucursales, type Sucursal } from "@/db/schema";

/**
 * Cobrar con el QR impreso del mostrador.
 *
 * El modelo es el "QR estático" de la Orders API de Mercado Pago: hay UN papel
 * pegado en la pared por sucursal, y cada venta crea una orden asociada a esa
 * caja. El cliente escanea el mismo QR de siempre y en su celular le aparece el
 * monto de ESTA venta.
 *
 * No es el modelo dinámico (un QR nuevo en pantalla por venta): ese obliga a
 * tener una pantalla dada vuelta hacia el cliente, y acá el kiosquero atiende
 * con el teléfono en la mano. Tampoco es el QR "sin monto", donde el cliente
 * tipea cuánto paga — eso no se puede conciliar con la venta.
 *
 * La API vieja (`/instore/orders/qr/...`) quedó como legacy; esto usa
 * `/v1/orders`, que es la vigente.
 */

const MP = "https://api.mercadopago.com";

/** Margen para renovar antes de que venza. Un día, igual que en AppGenda. */
const MARGEN_RENOVACION_MS = 24 * 60 * 60 * 1000;

export class MercadoPagoError extends Error {}

/**
 * El token de esa sucursal, renovado si está por vencer.
 *
 * Devuelve `null` cuando la sucursal no está conectada, que no es un error:
 * es el estado normal hasta que alguien aprieta "conectar". Quien llame tiene
 * que poder seguir cobrando en efectivo.
 */
export async function tokenDeSucursal(
  sucursalId: string,
): Promise<string | null> {
  const db = await getDb();
  const [fila] = await db
    .select()
    .from(sucursales)
    .where(eq(sucursales.id, sucursalId))
    .limit(1);

  if (!fila?.mpAccessToken) return null;
  if (!fila.mpRefreshToken) return fila.mpAccessToken;

  const vence = fila.mpTokenVenceEn?.getTime() ?? 0;
  if (vence - Date.now() > MARGEN_RENOVACION_MS) return fila.mpAccessToken;

  return renovarToken(fila.id, fila.mpRefreshToken);
}

/**
 * Pide un token nuevo con el refresh.
 *
 * Si Mercado Pago contesta 400 o 401, el permiso se revocó del otro lado —el
 * dueño desconectó la app desde su cuenta— y el refresh no va a volver a
 * andar. En ese caso se BORRAN las credenciales: dejarlas puestas haría que
 * cada venta intente renovar y falle, y la pantalla seguiría diciendo
 * "conectado" cuando no lo está.
 */
async function renovarToken(
  sucursalId: string,
  refresh: string,
): Promise<string | null> {
  const appId = process.env.MP_APP_ID;
  const secreto = process.env.MP_CLIENT_SECRET;
  if (!appId || !secreto) {
    console.error("[mp] faltan MP_APP_ID o MP_CLIENT_SECRET");
    return null;
  }

  const db = await getDb();

  try {
    const respuesta = await fetch(`${MP}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: secreto,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error("[mp] no se pudo renovar:", respuesta.status, detalle);

      if (respuesta.status === 400 || respuesta.status === 401) {
        await db
          .update(sucursales)
          .set({
            mpAccessToken: null,
            mpRefreshToken: null,
            mpTokenVenceEn: null,
          })
          .where(eq(sucursales.id, sucursalId));
      }
      return null;
    }

    const datos = await respuesta.json();
    await db
      .update(sucursales)
      .set({
        mpAccessToken: datos.access_token,
        mpRefreshToken: datos.refresh_token ?? refresh,
        mpTokenVenceEn: new Date(Date.now() + datos.expires_in * 1000),
      })
      .where(eq(sucursales.id, sucursalId));

    return datos.access_token as string;
  } catch (error) {
    console.error("[mp] falló la renovación:", error);
    return null;
  }
}

/** Una llamada a la API, con el error de Mercado Pago a la vista en el log. */
async function pedir(
  token: string,
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; idempotencia?: string } = {},
): Promise<Record<string, unknown>> {
  const cabeceras: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  // Obligatoria al crear, cancelar y reembolsar: es lo que evita cobrar dos
  // veces si la petición se reintenta.
  if (opciones.idempotencia) {
    cabeceras["X-Idempotency-Key"] = opciones.idempotencia;
  }

  const respuesta = await fetch(`${MP}${ruta}`, {
    method: opciones.metodo ?? "POST",
    headers: cabeceras,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    // Un mostrador no puede quedarse esperando: si Mercado Pago no contesta,
    // hay que poder cobrar en efectivo y seguir atendiendo.
    signal: AbortSignal.timeout(12_000),
  });

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : {};

  if (!respuesta.ok) {
    console.error(`[mp] ${opciones.metodo ?? "POST"} ${ruta}`, respuesta.status, texto);
    throw new MercadoPagoError(
      typeof datos.message === "string"
        ? datos.message
        : `Mercado Pago contestó ${respuesta.status}`,
    );
  }
  return datos;
}

/**
 * Los montos viajan como texto con dos decimales ("50.00"), no como número.
 * Acá la plata vive en centavos enteros, así que la conversión pasa por un solo
 * lugar: redondear mal un peso en una API de cobros es cobrar mal.
 */
function aMonto(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export type CajaCreada = {
  storeId: string;
  posId: string;
  externalPosId: string;
  /** la imagen del QR para imprimir y pegar en el mostrador */
  qrImagen: string | null;
};

/**
 * Crea del lado de Mercado Pago la sucursal y la caja, y devuelve el QR.
 *
 * Se hace UNA vez por sucursal. El QR que sale de acá es el papel que se pega
 * en la pared: mientras la caja exista, ese mismo papel sirve para todas las
 * ventas.
 */
export async function crearCaja(
  sucursal: Sucursal,
  ubicacion: {
    calle: string;
    numero: string;
    ciudad: string;
    provincia: string;
    latitud: number;
    longitud: number;
  },
): Promise<CajaCreada> {
  const token = await tokenDeSucursal(sucursal.id);
  if (!token) throw new MercadoPagoError("Esa sucursal no está conectada.");
  if (!sucursal.mpUserId) {
    throw new MercadoPagoError("Falta el usuario de Mercado Pago.");
  }

  // Los ids externos los elegimos nosotros y son la llave con la que Mercado
  // Pago encuentra la caja. Salen del id de la sucursal para que no haya dos
  // iguales ni haga falta inventarlos a mano.
  const externalStoreId = `osito-${sucursal.id.slice(0, 8)}`;
  const externalPosId = `${externalStoreId}-caja1`;

  /*
   * La dirección NO es decorativa: Mercado Pago la usa para los impuestos de
   * la venta, así que las coordenadas tienen que ser las del local de verdad.
   */
  const tienda = await pedir(token, `/users/${sucursal.mpUserId}/stores`, {
    cuerpo: {
      name: sucursal.nombre,
      external_id: externalStoreId,
      location: {
        street_name: ubicacion.calle,
        street_number: ubicacion.numero,
        city_name: ubicacion.ciudad,
        state_name: ubicacion.provincia,
        latitude: ubicacion.latitud,
        longitude: ubicacion.longitud,
      },
    },
  });

  const caja = await pedir(token, "/v2/pos", {
    idempotencia: externalPosId,
    cuerpo: {
      name: `${sucursal.nombre} — mostrador`,
      store_id: String(tienda.id),
      external_id: externalPosId,
      // "pdv" es el modo atendido: hay alguien del otro lado del mostrador.
      config: { qr: { operating_mode: "pdv" } },
    },
  });

  const qr = caja.qr_response as { image?: string } | undefined;

  return {
    storeId: String(tienda.id),
    posId: String(caja.id),
    externalPosId,
    qrImagen: qr?.image ?? null,
  };
}

export type OrdenCreada = { ordenId: string; vence: string | null };

/**
 * Pone un monto en el QR de esa caja.
 *
 * A partir de acá y hasta que venza, quien escanee el papel ve ESTE importe.
 * Por eso quien llame tiene que cancelar la orden anterior antes de crear otra:
 * la documentación no dice qué pasa con dos órdenes abiertas a la vez en la
 * misma caja, y no es algo para averiguar con la plata de un cliente.
 */
export async function crearOrden(
  sucursal: Sucursal,
  entrada: {
    totalCentavos: number;
    referencia: string;
    /** cuántos minutos espera antes de vencer sola */
    minutos?: number;
  },
): Promise<OrdenCreada> {
  const token = await tokenDeSucursal(sucursal.id);
  if (!token) throw new MercadoPagoError("Esa sucursal no está conectada.");
  if (!sucursal.mpExternalPosId) {
    throw new MercadoPagoError("Esa sucursal todavía no tiene el QR creado.");
  }

  const monto = aMonto(entrada.totalCentavos);
  const vence = new Date(
    Date.now() + (entrada.minutos ?? 10) * 60 * 1000,
  ).toISOString();

  const orden = await pedir(token, "/v1/orders", {
    // La referencia es única por venta, así que sirve de llave de
    // idempotencia: si la petición se reintenta, no se crean dos órdenes.
    idempotencia: entrada.referencia,
    cuerpo: {
      type: "qr",
      external_reference: entrada.referencia,
      total_amount: monto,
      expiration_time: vence,
      config: { qr: { external_pos_id: sucursal.mpExternalPosId, mode: "static" } },
      transactions: { payments: [{ amount: monto }] },
    },
  });

  return { ordenId: String(orden.id), vence };
}

/** Saca el monto del QR. Sólo anda si todavía no la pagaron. */
export async function cancelarOrden(
  sucursal: Sucursal,
  ordenId: string,
): Promise<void> {
  const token = await tokenDeSucursal(sucursal.id);
  if (!token) return;
  try {
    await pedir(token, `/v1/orders/${ordenId}/cancel`, {
      idempotencia: `cancelar-${ordenId}`,
    });
  } catch (error) {
    // Cancelar una orden ya pagada da error, y está bien que lo dé: significa
    // que el cliente pagó entre medio. No es motivo para romper lo que sigue.
    console.warn("[mp] no se pudo cancelar", ordenId, error);
  }
}

/** Cómo quedó una orden, preguntándoselo a Mercado Pago. */
export async function consultarOrden(
  sucursal: Sucursal,
  ordenId: string,
): Promise<{ estado: string; detalle: string | null } | null> {
  const token = await tokenDeSucursal(sucursal.id);
  if (!token) return null;
  try {
    const orden = await pedir(token, `/v1/orders/${ordenId}`, { metodo: "GET" });
    return {
      estado: String(orden.status ?? ""),
      detalle: orden.status_detail ? String(orden.status_detail) : null,
    };
  } catch {
    return null;
  }
}

/** Una orden pagada y acreditada de verdad. */
export function estaPagada(estado: string, detalle: string | null): boolean {
  return estado === "processed" && detalle === "accredited";
}
