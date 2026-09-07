/**
 * Tipos y cuentas del libro del negocio (ventas, compras, gastos). Como
 * `movimiento.ts` para el fiado: nada de acá toca la base, así que lo puede
 * importar un componente de cliente.
 */
import { parsearMonto } from "@/lib/plata";

export const CATEGORIAS_GASTO = [
  "alquiler",
  "servicios",
  "sueldos",
  "impuestos",
  "fletes",
  "mantenimiento",
  "retiro",
  "otros",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

/** Cómo se llama cada categoría en pantalla. */
export const ETIQUETA_GASTO: Record<CategoriaGasto, string> = {
  alquiler: "Alquiler",
  servicios: "Luz, gas, internet",
  sueldos: "Sueldos",
  impuestos: "Impuestos",
  fletes: "Fletes",
  mantenimiento: "Arreglos",
  retiro: "Retiro personal",
  otros: "Otros",
};

/**
 * El retiro no es un gasto del kiosco: es plata que sale para vos. Se anota
 * igual porque si no, la caja no cierra, pero se muestra aparte para que no
 * ensucie el costo real de tener el negocio abierto.
 */
export function esRetiro(categoria: CategoriaGasto): boolean {
  return categoria === "retiro";
}

export type VentaAGuardar = {
  montoCentavos: number;
  nota?: string | null;
  fecha: string;
};

export type GastoAGuardar = {
  categoria: CategoriaGasto;
  montoCentavos: number;
  descripcion?: string | null;
  fecha: string;
};

/**
 * Un renglón de la factura del proveedor. Se guarda lo que dice el papel:
 * cuántos bultos, qué trae cada uno y cuánta plata. El costo por unidad no se
 * guarda porque es una división que casi nunca da redonda.
 */
export type RenglonAGuardar = {
  descripcion: string | null;
  /** cuántos bultos (packs, cajas) entraron */
  cantidad: number;
  /** cuántas unidades de venta trae cada bulto */
  unidadesPorBulto: number;
  /** lo que se pagó por todo el renglón */
  importeCentavos: number | null;
};

export type CompraAGuardar = {
  proveedorId?: string;
  nombreProveedor?: string;
  /** Total de la factura. Si viene null, se calcula sumando los renglones. */
  montoCentavos: number | null;
  items?: RenglonAGuardar[];
  fecha: string;
  /** Fecha en que se pagó. `null` deja la compra a cuenta del proveedor. */
  pagadoEn: string | null;
  comprobante?: string | null;
  nota?: string | null;
};

/** Suma de los renglones que ya tienen importe. Los que no, no suman. */
export function sumarRenglones(lista: RenglonAGuardar[]): number {
  return lista.reduce((total, r) => total + (r.importeCentavos ?? 0), 0);
}

/** Cuántas unidades de venta entraron por ese renglón. */
export function unidadesTotales(cantidad: number, unidadesPorBulto: number) {
  return Math.max(1, cantidad) * Math.max(1, unidadesPorBulto);
}

/**
 * Lo que te costó cada unidad de las que vas a vender. Es SIEMPRE derivado y
 * puede tener resto: la división se redondea sólo para mostrarla, y por eso el
 * número que se guarda sigue siendo el importe del renglón.
 */
export function costoPorUnidad(renglon: {
  cantidad: number;
  unidadesPorBulto: number;
  importeCentavos: number | null;
}): number | null {
  if (renglon.importeCentavos == null) return null;
  const unidades = unidadesTotales(renglon.cantidad, renglon.unidadesPorBulto);
  if (unidades <= 0) return null;
  return Math.round(renglon.importeCentavos / unidades);
}

/** Lo que se edita en pantalla: todo texto hasta que se confirma. */
export type RenglonBorrador = {
  descripcion: string;
  cantidad: string;
  unidadesPorBulto: string;
  importe: string;
};

export function renglonVacio(): RenglonBorrador {
  return { descripcion: "", cantidad: "1", unidadesPorBulto: "1", importe: "" };
}

/** Un renglón cuenta si tiene nombre O importe. Sólo se descarta el vacío. */
export function renglonesCargados(lista: RenglonBorrador[]): RenglonBorrador[] {
  return lista.filter((r) => r.descripcion.trim() || r.importe.trim());
}

export class RenglonInvalido extends Error {}

function nombrar(renglon: RenglonBorrador): string {
  return renglon.descripcion.trim() || "el renglón sin nombre";
}

function entero(valor: string, minimo: number): number | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < minimo) return null;
  return Math.round(numero);
}

/**
 * Convierte lo tipeado a renglones listos para guardar. Tira si un número está
 * escrito y no se entiende: mejor frenar que anotar un importe al azar.
 */
export function aRenglonesAGuardar(
  lista: RenglonBorrador[],
): RenglonAGuardar[] {
  return renglonesCargados(lista).map((renglon) => {
    const cantidad = entero(renglon.cantidad, 1);
    if (cantidad == null) {
      throw new RenglonInvalido(`Revisá la cantidad de ${nombrar(renglon)}.`);
    }

    const unidadesPorBulto = entero(renglon.unidadesPorBulto || "1", 1);
    if (unidadesPorBulto == null) {
      throw new RenglonInvalido(
        `Revisá cuántas unidades trae ${nombrar(renglon)}.`,
      );
    }

    let importeCentavos: number | null = null;
    if (renglon.importe.trim()) {
      const centavos = parsearMonto(renglon.importe);
      if (centavos == null || centavos <= 0) {
        throw new RenglonInvalido(`Revisá el importe de ${nombrar(renglon)}.`);
      }
      importeCentavos = centavos;
    }

    return {
      descripcion: renglon.descripcion.trim() || null,
      cantidad,
      unidadesPorBulto,
      importeCentavos,
    };
  });
}

/** Cuántos renglones quedaron sin importe: son los que no suman al total. */
export function contarSinImporte(lista: RenglonBorrador[]): number {
  return renglonesCargados(lista).filter((r) => !r.importe.trim()).length;
}
