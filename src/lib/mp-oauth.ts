import "server-only";

import crypto from "node:crypto";

/**
 * El `state` del OAuth de Mercado Pago.
 *
 * Es lo único que ata la vuelta de Mercado Pago al pedido que salió de acá. Sin
 * esto, cualquiera puede armar un link al callback con SU código de
 * autorización y conectar su cuenta a nuestra sucursal, o conectar la nuestra a
 * donde quiera: es el CSRF clásico de OAuth.
 *
 * Lleva tres defensas, y hacen falta las tres:
 *  - va FIRMADO, así no se puede fabricar uno con otra sucursal adentro;
 *  - se compara contra una cookie, así no sirve uno robado de otra sesión;
 *  - vence a los diez minutos, que es más de lo que tarda autorizar.
 */

const VIDA_MS = 10 * 60 * 1000;

export const COOKIE_ESTADO = "osito_mp_estado";

function clave(): string {
  // El PIN de la casa ya es el secreto del servidor; si no hay, no se firma
  // con una constante: eso sería una firma que cualquiera puede reproducir.
  const pin = process.env.PIN_ACCESO?.trim();
  if (!pin) {
    throw new Error("Sin PIN_ACCESO no se puede firmar el state de Mercado Pago");
  }
  return pin;
}

function firmar(carga: string): string {
  return crypto.createHmac("sha256", clave()).update(carga).digest("hex");
}

export function armarEstado(sucursalId: string): string {
  const nonce = crypto.randomBytes(12).toString("hex");
  const cuando = String(Date.now());
  const carga = `${sucursalId}:${nonce}:${cuando}`;
  return Buffer.from(`${carga}:${firmar(carga)}`).toString("base64url");
}

/**
 * Devuelve la sucursal que pidió conectarse, o `null` si el state no es de
 * confianza. Nunca tira: un state inválido es algo que puede llegar de afuera,
 * no un error nuestro.
 */
export function leerEstado(estado: string): string | null {
  try {
    const partes = Buffer.from(estado, "base64url").toString().split(":");
    if (partes.length !== 4) return null;

    const [sucursalId, nonce, cuando, firma] = partes;
    const esperada = firmar(`${sucursalId}:${nonce}:${cuando}`);

    // En tiempo constante: comparar firmas con === deja medir cuántos
    // caracteres acertó quien prueba.
    const iguales =
      firma.length === esperada.length &&
      crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!iguales) return null;

    if (Date.now() - Number(cuando) > VIDA_MS) return null;
    return sucursalId;
  } catch {
    return null;
  }
}

/** A dónde vuelve Mercado Pago. Tiene que ser EXACTA a la cargada en la app. */
export function urlDeVuelta(): string {
  const base = (
    process.env.APP_URL || "https://kiosco.naviacloud.com"
  ).replace(/\/+$/, "");
  return `${base}/api/mp/volver`;
}
