/**
 * Tipos y conversiones que comparten el servidor y las pantallas. Nada de acá
 * toca la base, así que lo puede importar un componente de cliente.
 */
import { parsearMonto } from "@/lib/plata";

export type ItemAGuardar = {
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number | null;
};

export type MovimientoAGuardar = {
  clienteId?: string;
  nombreCliente?: string;
  tipo: "fiado" | "pago";
  /** Total dicho por una persona. Si viene null, se calcula sumando los ítems. */
  montoCentavos: number | null;
  items?: ItemAGuardar[];
  nota?: string | null;
  fecha: string;
  origen: "audio" | "manual";
  transcripcion?: string | null;
};

/** Suma de los ítems que sí tienen precio. Los que no, valen cero acá. */
export function sumarItems(lista: ItemAGuardar[]): number {
  return lista.reduce((total, item) => {
    if (item.precioUnitarioCentavos == null) return total;
    return total + item.precioUnitarioCentavos * item.cantidad;
  }, 0);
}

/** Lo que se edita en pantalla: todo texto hasta que se confirma. */
export type ItemBorrador = {
  descripcion: string;
  cantidad: string;
  precio: string;
};

export function itemVacio(): ItemBorrador {
  return { descripcion: "", cantidad: "1", precio: "" };
}

export function itemsConTexto(lista: ItemBorrador[]): ItemBorrador[] {
  return lista.filter((i) => i.descripcion.trim());
}

export class MontoInvalido extends Error {}

/**
 * Convierte lo tipeado a ítems listos para guardar. Tira si un precio está
 * escrito pero no se entiende: mejor frenar que anotar un número al azar.
 */
export function aItemsAGuardar(lista: ItemBorrador[]): ItemAGuardar[] {
  return itemsConTexto(lista).map((item) => {
    const cantidad = Number(item.cantidad);
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      throw new MontoInvalido(`Revisá la cantidad de "${item.descripcion}".`);
    }

    let precioUnitarioCentavos: number | null = null;
    if (item.precio.trim()) {
      const centavos = parsearMonto(item.precio);
      if (centavos == null || centavos <= 0) {
        throw new MontoInvalido(`Revisá el precio de "${item.descripcion}".`);
      }
      precioUnitarioCentavos = centavos;
    }

    return {
      descripcion: item.descripcion.trim(),
      cantidad: Math.round(cantidad),
      precioUnitarioCentavos,
    };
  });
}

/** Cuántas líneas quedaron sin precio: son las que no suman a la deuda. */
export function contarSinPrecio(lista: ItemBorrador[]): number {
  return itemsConTexto(lista).filter((i) => !i.precio.trim()).length;
}
