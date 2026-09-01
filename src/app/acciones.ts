"use server";

import { revalidatePath } from "next/cache";
import {
  anularMovimiento,
  buscarOCrearCliente,
  registrarMovimientos,
  type MovimientoAGuardar,
} from "@/lib/consultas";

export type Resultado<T = null> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : "Algo salió mal";
}

export async function guardarMovimientos(
  items: MovimientoAGuardar[],
): Promise<Resultado<{ guardados: number }>> {
  try {
    if (!items.length) return { ok: false, error: "No hay nada para guardar" };
    const filas = await registrarMovimientos(items);
    revalidatePath("/", "layout");
    return { ok: true, datos: { guardados: filas.length } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function anular(id: string): Promise<Resultado> {
  try {
    const fila = await anularMovimiento(id);
    if (!fila) return { ok: false, error: "Ese movimiento ya estaba anulado" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function crearCliente(
  nombre: string,
): Promise<Resultado<{ id: string }>> {
  try {
    const cliente = await buscarOCrearCliente(nombre);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: cliente.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}
