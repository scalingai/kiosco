import "server-only";

import crypto from "node:crypto";

/**
 * El `state` del OAuth de Mercado Pago.
 *
 * Es lo único que ata la vuelta de Mercado Pago al pedido que salió de acá. Sin
 * esto, cualquiera puede armar un link al callback con SU código de
 * autorización y colgar su cuenta de nuestra sucursal: es el CSRF clásico de
 * OAuth.
 *
 * ── Por qué es un número al azar y no algo firmado ─────────────────────────
 *
 * La primera versión mandaba `sucursalId:nonce:fecha` FIRMADO con HMAC, usando
 * el PIN de la casa como clave. Estaba mal de una forma que no se ve a simple
 * vista:
 *
 *  - El `state` viaja en la URL hacia Mercado Pago. Queda en el historial del
 *    navegador, en el `Referer` y en los registros de ellos.
 *  - Ese `state` llevaba el texto plano Y su firma. El PIN tiene cuatro o seis
 *    dígitos, así que con un solo `state` se lo saca probando diez mil
 *    combinaciones: milisegundos.
 *  - Y el PIN no es una clave cualquiera: es la MISMA con la que se firma la
 *    cookie de sesión (`sesion.ts`). Sacarlo es entrar a la app.
 *
 * O sea que una URL que se filtra terminaba siendo acceso completo. Firmar algo
 * con una clave de baja entropía y publicarlo es regalar la clave.
 *
 * Acá no hay nada que firmar: el `state` es un número al azar y lo único que se
 * comprueba es que sea el MISMO que dejamos en la cookie. La cookie es
 * `httpOnly` y la pusimos nosotros, así que no se puede fabricar desde afuera.
 * El id de la sucursal viaja en esa cookie y NO en la URL: además de no poder
 * tocarse, deja de contarle a Mercado Pago cómo numeramos los locales.
 */

/** Diez minutos: más de lo que tarda autorizar, menos de lo que tarda olvidarse. */
export const VIDA_SEGUNDOS = 10 * 60;

export const COOKIE_ESTADO = "osito_mp_estado";

/**
 * Lo que se guarda en la cookie: el número al azar y a qué sucursal pertenece.
 * Van juntos para que no puedan desaparearse.
 */
export function armarEstado(sucursalId: string): {
  estado: string;
  cookie: string;
} {
  const estado = crypto.randomBytes(32).toString("base64url");
  return { estado, cookie: `${estado}:${sucursalId}` };
}

/**
 * La sucursal que pidió conectarse, o `null` si la vuelta no es de confianza.
 *
 * Nunca tira: un `state` que no cierra es algo que puede llegar de afuera, no
 * un error nuestro.
 */
export function leerEstado(
  estadoDeLaUrl: string | null | undefined,
  cookie: string | null | undefined,
): string | null {
  if (!estadoDeLaUrl || !cookie) return null;

  const corte = cookie.indexOf(":");
  if (corte < 1) return null;

  const esperado = cookie.slice(0, corte);
  const sucursalId = cookie.slice(corte + 1);
  if (!sucursalId) return null;

  // En tiempo constante, por costumbre: comparar con `===` deja medir cuánto
  // se acertó. Acá el valor es aleatorio y de 32 bytes, así que adivinarlo no
  // es realista igual, pero no cuesta nada hacerlo bien.
  const a = Buffer.from(estadoDeLaUrl);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return sucursalId;
}

/** A dónde vuelve Mercado Pago. Tiene que ser EXACTA a la cargada en la app. */
export function urlDeVuelta(): string {
  const base = (
    process.env.APP_URL || "https://kiosco.naviacloud.com"
  ).replace(/\/+$/, "");
  return `${base}/api/mp/volver`;
}
