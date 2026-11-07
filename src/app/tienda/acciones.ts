"use server";

import { revalidatePath } from "next/cache";
import {
  PedidoInvalido,
  registrarPedido,
  type EntregaPedido,
} from "@/lib/pedidos";

/**
 * Las escrituras de la TIENDA, que es pública.
 *
 * Viven separadas de `app/acciones.ts` a propósito: aquellas son del panel y
 * asumen que del otro lado está el kiosquero, detrás del PIN. Esta la puede
 * llamar cualquiera desde la calle, y mezclarlas haría muy fácil exponer sin
 * querer una acción del panel.
 *
 * Lo único que se puede hacer desde acá es dejar un pedido. No hay forma de
 * leer, cambiar ni borrar nada.
 */

export type RespuestaPedido =
  | { ok: true; numero: number }
  | { ok: false; error: string };

export async function dejarPedido(entrada: {
  nombre: string;
  telefono: string;
  entrega: EntregaPedido;
  direccion?: string | null;
  nota?: string | null;
  renglones: { productoId: string; cantidad: number }[];
}): Promise<RespuestaPedido> {
  try {
    const pedido = await registrarPedido(entrada);
    // La pantalla de pedidos del panel tiene que mostrarlo sin recargar.
    revalidatePath("/pedidos");
    return { ok: true, numero: pedido.numero };
  } catch (error) {
    if (error instanceof PedidoInvalido) {
      return { ok: false, error: error.message };
    }
    // Lo que salió mal de verdad va al log, no a la pantalla de un
    // desconocido: un mensaje de base de datos cuenta cómo está hecha la app.
    console.error("[tienda] no se pudo guardar el pedido:", error);
    return {
      ok: false,
      error: "No pudimos tomar el pedido. Probá de nuevo en un momento.",
    };
  }
}
