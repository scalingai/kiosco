/**
 * Tipos y cuentas del libro del negocio (ventas, compras, gastos). Como
 * `movimiento.ts` para el fiado: nada de acá toca la base, así que lo puede
 * importar un componente de cliente.
 */
import { parsearMonto } from "@/lib/plata";

export const MEDIOS = ["efectivo", "mercadopago", "banco"] as const;

export type MedioPago = (typeof MEDIOS)[number];

/** Cómo se nombra cada medio en pantalla. */
export const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  banco: "Banco",
};

/** Cortito, para meter al lado de un monto sin ocupar media fila. */
export const MEDIO_CORTO: Record<MedioPago, string> = {
  efectivo: "efvo",
  mercadopago: "MP",
  banco: "banco",
};

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
  medio: MedioPago;
};

export type GastoAGuardar = {
  categoria: CategoriaGasto;
  montoCentavos: number;
  descripcion?: string | null;
  fecha: string;
  medio: MedioPago;
};

export const UNIDADES = ["un", "gr", "ml"] as const;

export type Unidad = (typeof UNIDADES)[number];

/** Cómo se nombra la unidad en un desplegable. */
export const ETIQUETA_UNIDAD: Record<Unidad, string> = {
  un: "unidades",
  gr: "gramos",
  ml: "mililitros",
};

/**
 * Un renglón de la factura del proveedor. Se guarda lo que dice el papel:
 * cuántos bultos, cuánto trae cada uno y en qué se mide, y cuánta plata. El
 * costo por unidad no se guarda porque es una división que casi nunca da
 * redonda.
 */
export type RenglonAGuardar = {
  descripcion: string | null;
  /** cuántos bultos (packs, cajas, bolsas) entraron */
  cantidad: number;
  /** cuánto trae cada bulto, medido en `unidad` */
  unidadesPorBulto: number;
  unidad: Unidad;
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
  /** Con qué se pagó. Va junto con `pagadoEn`: sin pago no hay medio. */
  medio: MedioPago | null;
  comprobante?: string | null;
  nota?: string | null;
};

/** Suma de los renglones que ya tienen importe. Los que no, no suman. */
export function sumarRenglones(lista: RenglonAGuardar[]): number {
  return lista.reduce((total, r) => total + (r.importeCentavos ?? 0), 0);
}

/** Cuánto entró en total por ese renglón, en su unidad de medida. */
export function contenidoTotal(cantidad: number, unidadesPorBulto: number) {
  return Math.max(1, cantidad) * Math.max(1, unidadesPorBulto);
}

/** "48 unidades", "3 kg", "1,5 L" — cómo se dice lo que entró. */
export function formatearContenido(total: number, unidad: Unidad): string {
  if (unidad === "un") {
    return total === 1 ? "1 unidad" : `${total} unidades`;
  }
  const grande = unidad === "gr" ? "kg" : "L";
  const chico = unidad === "gr" ? "g" : "ml";
  if (total < 1000) return `${total} ${chico}`;
  const enGrande = total / 1000;
  // Sin decimales cuando son justos: "3 kg" y no "3,0 kg".
  const texto = Number.isInteger(enGrande)
    ? String(enGrande)
    : enGrande.toFixed(2).replace(/0+$/, "").replace(/[.,]$/, "").replace(".", ",");
  return `${texto} ${grande}`;
}

export type CostoDeReferencia = {
  centavos: number;
  /** cómo se lee ese número: "cada una", "el kilo", "el litro" */
  porCada: string;
};

/**
 * El número con el que se decide a cuánto vender, y el único que sirve para
 * comparar dos proveedores.
 *
 * Es SIEMPRE derivado y puede tener resto: la división se redondea sólo para
 * mostrarla, y por eso lo que se guarda sigue siendo el importe del renglón.
 *
 * Para gramos y mililitros se devuelve el precio por kilo y por litro, no por
 * gramo: el precio de un gramo son centavos que no se pueden leer, y en el
 * mayorista los precios se comparan por kilo.
 */
export function costoDeReferencia(renglon: {
  cantidad: number;
  unidadesPorBulto: number;
  unidad: Unidad;
  importeCentavos: number | null;
}): CostoDeReferencia | null {
  if (renglon.importeCentavos == null) return null;
  const total = contenidoTotal(renglon.cantidad, renglon.unidadesPorBulto);
  if (total <= 0) return null;

  if (renglon.unidad === "un") {
    return {
      centavos: Math.round(renglon.importeCentavos / total),
      porCada: "cada una",
    };
  }

  return {
    centavos: Math.round((renglon.importeCentavos * 1000) / total),
    porCada: renglon.unidad === "gr" ? "el kilo" : "el litro",
  };
}

/** Lo que se edita en pantalla: todo texto hasta que se confirma. */
export type RenglonBorrador = {
  descripcion: string;
  cantidad: string;
  unidadesPorBulto: string;
  unidad: Unidad;
  importe: string;
};

export function renglonVacio(): RenglonBorrador {
  return {
    descripcion: "",
    cantidad: "1",
    unidadesPorBulto: "1",
    unidad: "un",
    importe: "",
  };
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
        `Revisá cuánto trae cada bulto de ${nombrar(renglon)}.`,
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
      unidad: renglon.unidad,
      importeCentavos,
    };
  });
}

/** Cuántos renglones quedaron sin importe: son los que no suman al total. */
export function contarSinImporte(lista: RenglonBorrador[]): number {
  return renglonesCargados(lista).filter((r) => !r.importe.trim()).length;
}

export type PorMedio = Record<MedioPago, number>;

export function medioVacio(): PorMedio {
  return { efectivo: 0, mercadopago: 0, banco: 0 };
}

/**
 * Reparte una plata entre los tres medios. Se usa para el día: "quedó
 * $300.000" no sirve si no se sabe cuánto de eso está en el cajón y cuánto en
 * Mercado Pago, que es justo lo que se necesita para saber con qué se le puede
 * pagar al proveedor que viene mañana.
 */
export function sumarPorMedio<T>(
  filas: T[],
  medio: (fila: T) => MedioPago,
  monto: (fila: T) => number,
): PorMedio {
  const total = medioVacio();
  for (const fila of filas) total[medio(fila)] += monto(fila);
  return total;
}

/** Resta dos repartos: entradas menos salidas, medio por medio. */
export function restarPorMedio(entro: PorMedio, salio: PorMedio): PorMedio {
  return {
    efectivo: entro.efectivo - salio.efectivo,
    mercadopago: entro.mercadopago - salio.mercadopago,
    banco: entro.banco - salio.banco,
  };
}
