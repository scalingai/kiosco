"use server";

import { revalidatePath } from "next/cache";
import {
  anularCompra,
  anularGasto,
  anularVenta,
  buscarOCrearProveedor,
  marcarCompraImpaga,
  marcarCompraPagada,
  registrarCompra,
  registrarGasto,
  registrarVenta,
} from "@/lib/caja";
import {
  anularMovimiento,
  buscarOCrearCliente,
  registrarMovimientos,
  type MovimientoAGuardar,
} from "@/lib/consultas";
import type {
  CompraAGuardar,
  GastoAGuardar,
  VentaAGuardar,
} from "@/lib/negocio";

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

/* ── El libro del negocio: ventas, compras y gastos ───────────────────────── */

export async function guardarVenta(
  entrada: VentaAGuardar,
): Promise<Resultado<{ id: string }>> {
  try {
    const fila = await registrarVenta(entrada);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: fila.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function guardarGasto(
  entrada: GastoAGuardar,
): Promise<Resultado<{ id: string }>> {
  try {
    const fila = await registrarGasto(entrada);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: fila.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function guardarCompra(
  entrada: CompraAGuardar,
): Promise<Resultado<{ id: string }>> {
  try {
    const fila = await registrarCompra(entrada);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: fila.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/** Pagar una compra mueve la salida al día en que salió la plata. */
export async function pagarCompra(
  id: string,
  fecha: string,
): Promise<Resultado> {
  try {
    const fila = await marcarCompraPagada(id, fecha);
    if (!fila) return { ok: false, error: "Esa compra ya no está" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function despagarCompra(id: string): Promise<Resultado> {
  try {
    const fila = await marcarCompraImpaga(id);
    if (!fila) return { ok: false, error: "Esa compra ya no está" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/** Anular no borra: le pone fecha de baja y deja de sumar en el día. */
async function anularDelNegocio(
  quitar: (id: string) => Promise<unknown>,
  id: string,
): Promise<Resultado> {
  try {
    const fila = await quitar(id);
    if (!fila) return { ok: false, error: "Eso ya estaba anulado" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function anularVentaDelDia(id: string): Promise<Resultado> {
  return anularDelNegocio(anularVenta, id);
}

export async function anularGastoDelDia(id: string): Promise<Resultado> {
  return anularDelNegocio(anularGasto, id);
}

export async function anularCompraDelDia(id: string): Promise<Resultado> {
  return anularDelNegocio(anularCompra, id);
}

export async function crearProveedor(
  nombre: string,
): Promise<Resultado<{ id: string }>> {
  try {
    const proveedor = await buscarOCrearProveedor(nombre);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: proveedor.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}
