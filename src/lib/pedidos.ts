import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pedidos, pedidosItems, productos } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cuántos renglones se aceptan de una. Un pedido de kiosco no tiene cien. */
const MAXIMO_RENGLONES = 60;

export type EntregaPedido = "retiro" | "envio";
export type EstadoPedido =
  | "nuevo"
  | "preparando"
  | "listo"
  | "entregado"
  | "cancelado";

export type PedidoAGuardar = {
  nombre: string;
  telefono: string;
  entrega: EntregaPedido;
  direccion?: string | null;
  nota?: string | null;
  renglones: { productoId: string; cantidad: number }[];
};

export class PedidoInvalido extends Error {}

/** Recorta y limpia lo que escribió alguien de la calle. */
function texto(valor: string | null | undefined, maximo: number): string | null {
  const limpio = valor?.trim();
  if (!limpio) return null;
  return limpio.slice(0, maximo);
}

/**
 * Guarda un pedido de la tienda.
 *
 * ── Por qué los precios NO vienen del navegador ───────────────────────────
 * El pedido llega de una pantalla pública, sin PIN. Si el total o los precios
 * viajaran en la petición, cualquiera podría encargar diez cartones de
 * cigarrillos a un peso cambiando un número en el navegador.
 *
 * Lo único que se acepta de afuera es QUÉ y CUÁNTO. El precio se lee de la
 * base en este mismo momento, y el total es la suma de lo que dice la base.
 * Confiar en un número que mandó el cliente es, literalmente, dejar que ponga
 * el precio.
 */
export async function registrarPedido(entrada: PedidoAGuardar) {
  const nombre = texto(entrada.nombre, 80);
  const telefono = texto(entrada.telefono, 40);
  if (!nombre) throw new PedidoInvalido("Falta tu nombre.");
  if (!telefono) throw new PedidoInvalido("Falta un teléfono para avisarte.");

  if (entrada.entrega === "envio" && !texto(entrada.direccion, 200)) {
    throw new PedidoInvalido("Para el envío hace falta la dirección.");
  }

  const pedidas = entrada.renglones
    .filter((r) => UUID.test(r.productoId) && r.cantidad > 0)
    .slice(0, MAXIMO_RENGLONES)
    .map((r) => ({
      productoId: r.productoId,
      // Un pedido de kiosco no lleva mil unidades de nada; el tope evita que
      // un número enorme haga un total absurdo.
      cantidad: Math.min(99, Math.round(r.cantidad)),
    }));

  if (!pedidas.length) throw new PedidoInvalido("El pedido está vacío.");

  const db = await getDb();

  // Los precios, de la base. Sólo productos publicados: si alguien guardó el
  // carrito y entre medio se archivó un producto, ese renglón no entra.
  const catalogo = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      precio: productos.precioVentaCentavos,
    })
    .from(productos)
    .where(
      and(
        inArray(
          productos.id,
          pedidas.map((p) => p.productoId),
        ),
        isNull(productos.archivadoEn),
      ),
    );

  const porId = new Map(catalogo.map((p) => [p.id, p]));

  const renglones = pedidas.flatMap((p, posicion) => {
    const producto = porId.get(p.productoId);
    if (!producto || producto.precio == null) return [];
    return [
      {
        productoId: producto.id,
        descripcion: producto.nombre,
        cantidad: p.cantidad,
        precioUnitarioCentavos: producto.precio,
        posicion,
      },
    ];
  });

  if (!renglones.length) {
    throw new PedidoInvalido(
      "Ninguno de esos productos está disponible ahora.",
    );
  }

  const totalCentavos = renglones.reduce(
    (total, r) => total + r.precioUnitarioCentavos * r.cantidad,
    0,
  );

  return db.transaction(async (tx) => {
    const [pedido] = await tx
      .insert(pedidos)
      .values({
        nombre,
        telefono,
        entrega: entrada.entrega,
        direccion:
          entrada.entrega === "envio" ? texto(entrada.direccion, 200) : null,
        nota: texto(entrada.nota, 300),
        totalCentavos,
      })
      .returning();

    await tx
      .insert(pedidosItems)
      .values(renglones.map((r) => ({ ...r, pedidoId: pedido.id })));

    return { ...pedido, renglones };
  });
}

export type FilaPedido = {
  id: string;
  numero: number;
  nombre: string;
  telefono: string;
  entrega: EntregaPedido;
  direccion: string | null;
  nota: string | null;
  totalCentavos: number;
  estado: EstadoPedido;
  creadoEn: Date;
  renglones: {
    descripcion: string;
    cantidad: number;
    precioUnitarioCentavos: number;
  }[];
};

/** Los pedidos para la pantalla del kiosquero, el más nuevo primero. */
export async function listarPedidos(limite = 60): Promise<FilaPedido[]> {
  const db = await getDb();

  const filas = await db
    .select()
    .from(pedidos)
    .orderBy(desc(pedidos.creadoEn))
    .limit(limite);

  if (!filas.length) return [];

  const items = await db
    .select()
    .from(pedidosItems)
    .where(
      inArray(
        pedidosItems.pedidoId,
        filas.map((p) => p.id),
      ),
    );

  const porPedido = new Map<string, FilaPedido["renglones"]>();
  for (const item of items) {
    const lista = porPedido.get(item.pedidoId) ?? [];
    lista.push({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitarioCentavos: item.precioUnitarioCentavos,
    });
    porPedido.set(item.pedidoId, lista);
  }

  return filas.map((p) => ({
    id: p.id,
    numero: p.numero,
    nombre: p.nombre,
    telefono: p.telefono,
    entrega: p.entrega,
    direccion: p.direccion,
    nota: p.nota,
    totalCentavos: p.totalCentavos,
    estado: p.estado,
    creadoEn: p.creadoEn,
    renglones: porPedido.get(p.id) ?? [],
  }));
}

/** Cuántos pedidos están esperando que alguien los mire. */
export async function pedidosNuevos(): Promise<number> {
  const db = await getDb();
  const filas = await db
    .select({ id: pedidos.id })
    .from(pedidos)
    .where(eq(pedidos.estado, "nuevo"));
  return filas.length;
}

export async function cambiarEstadoDePedido(
  id: string,
  estado: EstadoPedido,
): Promise<void> {
  if (!UUID.test(id)) return;
  const db = await getDb();
  await db.update(pedidos).set({ estado }).where(eq(pedidos.id, id));
}
