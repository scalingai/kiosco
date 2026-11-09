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
  anotarOrdenDeQr,
  confirmarCobroQr as confirmarCobroQr_,
} from "@/lib/caja";
import {
  anularMovimiento,
  buscarOCrearCliente,
  registrarMovimientos,
  type MovimientoAGuardar,
} from "@/lib/consultas";
import {
  actualizarProducto,
  archivarProducto,
  archivarProductos,
  crearProducto,
  marcarFalta,
  type FichaProducto,
} from "@/lib/stock";
import {
  buscarParecidos,
  identificarEan,
  type CandidatoEan,
  type Parecido,
} from "@/lib/buscar-ean";
import {
  abrirPedido,
  archivarPedido,
  cambiarEnBlanco,
  llenarConLoDeSiempre,
  ponerRenglon,
  sacarRenglon,
} from "@/lib/reposicion";
import type {
  CompraAGuardar,
  GastoAGuardar,
  MedioPago,
  VentaAGuardar,
} from "@/lib/negocio";
import { cancelarOrden, crearCaja, crearOrden } from "@/lib/mercadopago";
import {
  agregarSucursal,
  guardarCajaDeSucursal,
  obtenerSucursal,
  obtenerVentaPendiente,
  ordenPendienteDe,
} from "@/lib/sucursales";
import {
  cambiarEstadoDePedido,
  type EstadoPedido,
} from "@/lib/pedidos";

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
  medio: MedioPago,
): Promise<Resultado> {
  try {
    const fila = await marcarCompraPagada(id, fecha, medio);
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

/* ── Stock: el catálogo de reposición ─────────────────────────────────────── */

export async function marcarQueFalta(
  id: string,
  falta: boolean,
): Promise<Resultado> {
  try {
    const fila = await marcarFalta(id, falta);
    if (!fila) return { ok: false, error: "Ese producto ya no está" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function agregarProducto(
  nombre: string,
): Promise<Resultado<{ id: string }>> {
  try {
    const producto = await crearProducto(nombre);
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: producto.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/**
 * Qué producto es este código de barras, según los catálogos de los
 * supermercados. NO escribe nada: devuelve un candidato para confirmar.
 *
 * Vive como acción de servidor y no como fetch del navegador por dos razones:
 * las APIs de las tiendas no mandan CORS, y así el mostrador no le habla
 * directo a un dominio ajeno.
 */
export async function identificarCodigo(
  codigo: string,
): Promise<Resultado<{ candidato: CandidatoEan | null; parecidos: Parecido[] }>> {
  try {
    const candidato = await identificarEan(codigo);
    // Lo que el catálogo YA tiene y podría ser esto mismo sin el código
    // cargado. Sin este paso, el alta duplicaría el producto.
    const parecidos = candidato ? await buscarParecidos(candidato) : [];
    return { ok: true, datos: { candidato, parecidos } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/**
 * Da de alta un producto a partir de lo que dijo el catálogo, con su código ya
 * pegado. Es el paso que sigue al toque de "es este".
 *
 * El precio de venta NO se pone: queda en `null` y el renglón del carrito lo
 * pide. Un precio inventado acá sería peor que la demora — ver en CLAUDE.md
 * «un ítem sin precio no vale cero».
 */
export async function altaPorCodigo(
  candidato: CandidatoEan,
): Promise<Resultado<{ id: string }>> {
  try {
    const producto = await crearProducto(candidato.nombre);
    await actualizarProducto(producto.id, {
      marca: candidato.marca,
      codigoBarras: candidato.codigo,
      imagenUrl: candidato.imagenUrl,
    });
    revalidatePath("/", "layout");
    return { ok: true, datos: { id: producto.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/** Sacarlo de la lista sin borrar las compras que lo mencionan. */
export async function archivar(id: string): Promise<Resultado> {
  try {
    const fila = await archivarProducto(id);
    if (!fila) return { ok: false, error: "Ese producto ya estaba archivado" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/**
 * Lo que se edita a mano de un producto: nombre, marca y cuánto trae cada
 * unidad. El costo y el proveedor no se tocan acá — los escribe la compra.
 */
export async function editarProducto(
  id: string,
  ficha: FichaProducto,
): Promise<Resultado> {
  try {
    const fila = await actualizarProducto(id, ficha);
    if (!fila) return { ok: false, error: "No se pudo guardar ese producto" };
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/** Sacar de la lista varios productos de una, desde la selección múltiple. */
export async function archivarVarios(
  ids: string[],
): Promise<Resultado<{ archivados: number }>> {
  try {
    const archivados = await archivarProductos(ids);
    if (!archivados) return { ok: false, error: "No se archivó ninguno" };
    revalidatePath("/", "layout");
    return { ok: true, datos: { archivados } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/* ── Cobrar con el QR del mostrador ──────────────────────────────────────── */

/**
 * Anota la venta y le pone el monto al QR impreso.
 *
 * La venta se guarda PRIMERO y queda pendiente. Es a propósito: si Mercado
 * Pago no contesta, lo que no se puede perder es la venta — queda anotada y se
 * pasa a efectivo a mano. Al revés —crear la orden y después guardar— una
 * caída en el medio deja al cliente pagando algo que el kiosco no registró.
 *
 * Mientras esté pendiente NO cuenta en la caja del día.
 */
export async function cobrarConQr(
  entrada: VentaAGuardar & { sucursalId: string },
): Promise<Resultado<{ ventaId: string; vence: string | null }>> {
  try {
    const sucursal = await obtenerSucursal(entrada.sucursalId);
    if (!sucursal) return { ok: false, error: "No encontré esa sucursal" };
    if (!sucursal.mpExternalPosId) {
      return {
        ok: false,
        error: "Esa sucursal todavía no tiene el QR de Mercado Pago creado.",
      };
    }

    const venta = await registrarVenta({ ...entrada, pendiente: true });

    /*
     * Antes de poner el monto nuevo hay que sacar el anterior: la
     * documentación de Mercado Pago no dice qué muestra el QR si hay dos
     * órdenes abiertas a la vez, y no es algo para averiguar con el cliente
     * adelante.
     */
    const anterior = await ordenPendienteDe(sucursal.id, venta.id);
    if (anterior) await cancelarOrden(sucursal, anterior);

    let orden;
    try {
      orden = await crearOrden(sucursal, {
        totalCentavos: venta.montoCentavos,
        // El id de la venta es único y no dice nada de nadie: sirve de
        // referencia sin mandarle datos del cliente a Mercado Pago.
        referencia: venta.id,
      });
    } catch (error) {
      // La venta queda pendiente igual. Es lo correcto: existe, se ve, y se
      // cobra por otro medio sin volver a cargar el carrito.
      return {
        ok: false,
        error:
          mensaje(error) +
          " La venta quedó anotada como pendiente: cobrala por otro medio o reintentá.",
      };
    }

    await anotarOrdenDeQr(venta.id, orden.ordenId);
    revalidatePath("/", "layout");
    return { ok: true, datos: { ventaId: venta.id, vence: orden.vence } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/**
 * Da por cobrada la venta de esa orden. La llama el webhook de Mercado Pago.
 *
 * Vive acá y no en el route handler para que la escritura siga teniendo una
 * sola puerta, que es lo que pide el repo: el webhook valida quién llama y
 * después entra por donde entran todos.
 */
export async function confirmarCobroQr(ordenId: string): Promise<boolean> {
  const confirmada = await confirmarCobroQr_(ordenId);
  if (confirmada) revalidatePath("/", "layout");
  return confirmada;
}

/** Si el cliente nunca pagó: se saca el monto del QR y se anula la venta. */
export async function soltarCobroQr(ventaId: string): Promise<Resultado> {
  try {
    const venta = await obtenerVentaPendiente(ventaId);
    if (!venta) return { ok: false, error: "Esa venta ya no está pendiente" };

    if (venta.sucursalId && venta.mpOrderId) {
      const sucursal = await obtenerSucursal(venta.sucursalId);
      if (sucursal) await cancelarOrden(sucursal, venta.mpOrderId);
    }

    await anularVenta(ventaId);
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/* ── Sucursales ──────────────────────────────────────────────────────────── */

export async function crearSucursal(nombre: string): Promise<Resultado> {
  try {
    await agregarSucursal(nombre);
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/**
 * Crea del lado de Mercado Pago la sucursal y la caja, y guarda el QR.
 *
 * Se hace una sola vez por local: el QR que vuelve de acá es el papel que se
 * imprime y se pega en la pared.
 */
export async function crearQrDeSucursal(
  sucursalId: string,
  ubicacion: {
    calle: string;
    numero: string;
    ciudad: string;
    provincia: string;
    latitud: number;
    longitud: number;
  },
): Promise<Resultado> {
  try {
    const sucursal = await obtenerSucursal(sucursalId);
    if (!sucursal) return { ok: false, error: "No encontré esa sucursal" };

    const caja = await crearCaja(sucursal, ubicacion);
    await guardarCajaDeSucursal(sucursalId, caja);
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/** Mover un pedido de la tienda de estado. Lo aprieta el kiosquero. */
export async function moverPedido(
  id: string,
  estado: EstadoPedido,
): Promise<Resultado> {
  try {
    await cambiarEstadoDePedido(id, estado);
    revalidatePath("/", "layout");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

/* ── Pedidos de reposición ─────────────────────────────────────────────── */

export async function abrirPedidoDeReposicion(
  proveedorId: string,
  enBlanco: boolean,
): Promise<Resultado<{ id: string }>> {
  try {
    const fila = await abrirPedido(proveedorId, enBlanco);
    revalidatePath("/reponer");
    return { ok: true, datos: { id: fila.id } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function traerLoDeSiempre(
  reposicionId: string,
): Promise<Resultado<{ agregados: number }>> {
  try {
    const agregados = await llenarConLoDeSiempre(reposicionId);
    revalidatePath("/reponer");
    return { ok: true, datos: { agregados } };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function guardarRenglonDePedido(
  reposicionId: string,
  productoId: string,
  datos: {
    cantidad?: number;
    unidadesPorBulto?: number;
    importeBultoCentavos?: number | null;
  },
): Promise<Resultado> {
  try {
    await ponerRenglon(reposicionId, productoId, datos);
    revalidatePath("/reponer");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function sacarRenglonDePedido(id: string): Promise<Resultado> {
  try {
    await sacarRenglon(id);
    revalidatePath("/reponer");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function cambiarEnBlancoDelPedido(
  id: string,
  enBlanco: boolean,
): Promise<Resultado> {
  try {
    await cambiarEnBlanco(id, enBlanco);
    revalidatePath("/reponer");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}

export async function archivarPedidoDeReposicion(
  id: string,
): Promise<Resultado> {
  try {
    await archivarPedido(id);
    revalidatePath("/reponer");
    return { ok: true, datos: null };
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
}
