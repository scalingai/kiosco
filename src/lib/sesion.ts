/**
 * Portón de entrada: un PIN que vive en la variable de entorno `PIN_ACCESO`.
 *
 * El PIN nunca sale del servidor. Lo que viaja al navegador es una cookie
 * firmada con HMAC usando el propio PIN como clave, así que no se puede
 * fabricar sin conocerlo — y si cambiás el PIN, todas las sesiones se caen solas.
 *
 * Usa Web Crypto (no `node:crypto`) porque esto también corre en el middleware,
 * que va sobre el runtime Edge.
 */

export const COOKIE_SESION = "osito_sesion";

/** Un mes: en el mostrador nadie quiere tipear el PIN todos los días. */
export const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

export function pinConfigurado(): string | null {
  const pin = process.env.PIN_ACCESO?.trim();
  return pin ? pin : null;
}

async function firmar(datos: string, clave: string): Promise<string> {
  const codificador = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    codificador.encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, codificador.encode(datos));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación de tiempo constante: comparar con === filtra el secreto. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

export function pinCorrecto(intento: string, pin: string): boolean {
  return igualesEnTiempoConstante(intento.trim(), pin);
}

export async function crearToken(pin: string): Promise<string> {
  const vence = String(Date.now() + DURACION_MS);
  return `${vence}.${await firmar(vence, pin)}`;
}

export async function tokenValido(
  token: string | undefined,
  pin: string,
): Promise<boolean> {
  if (!token) return false;
  const [vence, firma] = token.split(".");
  if (!vence || !firma || !/^\d+$/.test(vence)) return false;
  if (Number(vence) < Date.now()) return false;
  return igualesEnTiempoConstante(firma, await firmar(vence, pin));
}

/**
 * A dónde mandar después de entrar. Sólo rutas internas: sin esto, un link con
 * `?volver=https://otra-cosa` convierte el login en un redirector abierto.
 */
export function destinoSeguro(volver: string | null | undefined): string {
  if (!volver) return "/";
  if (!volver.startsWith("/") || volver.startsWith("//")) return "/";
  return volver;
}
