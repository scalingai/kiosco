"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import {
  COOKIE_SESION,
  crearToken,
  DURACION_MS,
  pinConfigurado,
  pinCorrecto,
} from "@/lib/sesion";

/**
 * Freno a la fuerza bruta. Un PIN de cuatro dígitos son diez mil combinaciones:
 * sin esto, un script las prueba todas en un rato.
 *
 * Vive en memoria del proceso, así que se reinicia con la app y no se comparte
 * entre instancias. Para un kiosco con un contenedor alcanza; si algún día hay
 * más de una réplica, esto tiene que ir a la base o a Redis.
 */
const intentos = new Map<string, { fallos: number; hasta: number }>();
const MAX_FALLOS = 5;
const ESPERA_MS = 60_000;

function limpiarViejos(ahora: number) {
  for (const [ip, registro] of intentos) {
    if (registro.hasta < ahora - ESPERA_MS * 10) intentos.delete(ip);
  }
}

async function quienEs(): Promise<string> {
  const cabeceras = await headers();
  return (
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip") ||
    "desconocido"
  );
}

export type ResultadoIngreso = { ok: true } | { ok: false; error: string };

export async function ingresar(pin: string): Promise<ResultadoIngreso> {
  const esperado = pinConfigurado();
  if (!esperado) {
    return { ok: false, error: "No hay PIN configurado en el servidor." };
  }

  const ahora = Date.now();
  const ip = await quienEs();
  limpiarViejos(ahora);

  const registro = intentos.get(ip);
  if (registro && registro.fallos >= MAX_FALLOS && registro.hasta > ahora) {
    const faltan = Math.ceil((registro.hasta - ahora) / 1000);
    return { ok: false, error: `Demasiados intentos. Probá en ${faltan}s.` };
  }

  if (!pin.trim()) {
    return { ok: false, error: "Escribí el PIN." };
  }

  if (!pinCorrecto(pin, esperado)) {
    const fallos = (registro?.fallos ?? 0) + 1;
    intentos.set(ip, { fallos, hasta: ahora + ESPERA_MS });
    return { ok: false, error: "PIN incorrecto." };
  }

  intentos.delete(ip);

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, await crearToken(esperado), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DURACION_MS / 1000),
  });

  return { ok: true };
}

export async function salir() {
  const almacen = await cookies();
  almacen.delete(COOKIE_SESION);
}
