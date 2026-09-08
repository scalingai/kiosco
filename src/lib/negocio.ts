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
  /**
   * A cuánto se decide venderlo, y con qué multiplicador se llegó a ese
   * número. Van con la compra porque es EL momento en que se decide: llegó la
   * mercadería, cambió el costo, hay que ponerle precio. Mandar a la persona a
   * otra pantalla a hacerlo después es garantizar que no lo haga.
   *
   * Los dos en null significan "no lo toqué": la compra no le pisa el precio
   * al producto.
   */
  precioVentaCentavos: number | null;
  multiplicadorMilesimas: number | null;
};

export type PagoDeCompra = { medio: MedioPago; importeCentavos: number };

/**
 * Reparte el total entre los medios que tengan importe.
 *
 * Devuelve `null` cuando alcanza con un solo medio: en ese caso no hace falta
 * escribir filas de pago y la compra se guarda como siempre. Tira si la suma
 * no da el total, porque una compra pagada a medias por cada lado deja la caja
 * diciendo que salió plata de donde no salió.
 */
export function repartirPago(
  pagos: PagoDeCompra[],
  totalCentavos: number,
): PagoDeCompra[] | null {
  const conPlata = pagos.filter((p) => p.importeCentavos > 0);
  if (conPlata.length <= 1) return null;

  const suma = conPlata.reduce((t, p) => t + p.importeCentavos, 0);
  if (suma !== totalCentavos) {
    throw new Error(
      `Los medios suman ${suma / 100} y la compra es ${totalCentavos / 100}. ` +
        "Tienen que dar lo mismo.",
    );
  }
  return conPlata;
}

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
  /**
   * Cuando se pagó con más de un medio: cuánto por cada uno.
   *
   * Al proveedor se le paga como se puede —la mitad en efectivo y el resto por
   * transferencia es lo normal—, y con un solo medio había que elegir uno y
   * mentir. Vacío o ausente significa que se pagó todo con `medio`.
   */
  pagos?: PagoDeCompra[];
  comprobante?: string | null;
  nota?: string | null;
  /** con factura: el costo real es el importe por 1,21 */
  enBlanco: boolean;
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

/**
 * Lo mismo que `formatearContenido` pero abreviado: "6 un.", "1 kg", "500 ml".
 * En una planilla, "unidades" escrito entero parte la celda en dos renglones y
 * se come el ancho que necesitan los números.
 */
export function formatearContenidoCorto(
  total: number,
  unidad: Unidad,
): string {
  if (unidad === "un") return `${total} un.`;
  const grande = unidad === "gr" ? "kg" : "L";
  const chico = unidad === "gr" ? "g" : "ml";
  if (total < 1000) return `${total} ${chico}`;
  const enGrande = total / 1000;
  const texto = Number.isInteger(enGrande)
    ? String(enGrande)
    : enGrande
        .toFixed(2)
        .replace(/0+$/, "")
        .replace(/[.,]$/, "")
        .replace(".", ",");
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

/* ── Del costo al precio de venta ─────────────────────────────────────────── */

/** IVA general. El kiosco compra a mayoristas que facturan con esta alícuota. */
export const IVA = 1.21;

/**
 * Cuánto se le pone encima al costo para llegar al precio de venta. Es un punto
 * de partida, no una regla: cada rubro se vende distinto y el precio final lo
 * decide quien atiende. Por eso se puede guardar el precio real del producto y
 * la app calcula el margen que salió de verdad.
 */
export const MARGEN_SUGERIDO = 1.4;

/**
 * Lo que de verdad sale una unidad.
 *
 * Comprando en blanco el mayorista factura y encima va el IVA, así que el
 * importe de la factura NO es el costo: el costo es ese número por 1,21. En
 * negro, el importe ya es el costo. Confundirlos es vender con 21% menos de
 * margen del que uno cree.
 */
export function costoConIva(centavos: number, enBlanco: boolean): number {
  return enBlanco ? Math.round(centavos * IVA) : centavos;
}

/**
 * El multiplicador se guarda en milésimas: 1400 es 1,4.
 *
 * Entero a propósito, igual que la plata. Un `numeric` leído como float de JS
 * convierte 1,4 en 1,4000000000000001 y después el precio sugerido baila un
 * centavo según el día. Milésimas dan de sobra: nadie afina el margen más allá
 * de la tercera cifra.
 */
export const MILESIMAS = 1000;

/** El 1,4 de arriba, en milésimas, para guardar y comparar. */
export const MARGEN_SUGERIDO_MILESIMAS = Math.round(
  MARGEN_SUGERIDO * MILESIMAS,
);

/**
 * A cuánto se redondea el precio sugerido: siempre a los $100.
 *
 * En el kiosco los precios son redondos. Nadie cobra $4.357 ni tiene monedas
 * para el vuelto, y un precio que no se puede cantar de memoria hace más lento
 * al que atiende.
 */
const PASO = 10_000; // $100 en centavos

/**
 * Deja el precio en un número que se pueda cobrar: el múltiplo de $100 más
 * cercano. $480 y $510 son los dos $500; $4.357 es $4.400.
 *
 * Va al MÁS CERCANO y no para arriba —regla de Agus, 2026-09-08—. Forzar para
 * arriba defendía el margen al centavo pero empujaba $510 a $600, que es 18%
 * más caro por nada: en la góndola el precio lo termina fijando lo que cobra
 * el de la otra cuadra, no la calculadora.
 *
 * Nunca devuelve cero: algo que vale $30 se sugiere a $100, no a nada.
 */
export function redondearPrecio(centavos: number): number {
  if (centavos <= 0) return 0;
  return Math.max(PASO, Math.round(centavos / PASO) * PASO);
}

/**
 * El precio que sugiere la app: el costo real por el multiplicador, redondeado
 * a algo cobrable.
 *
 * `multiplicadorMilesimas` es lo que tenga cargado ESE producto. Cuando viene
 * en null se usa el 1,4 general: es una sugerencia inicial, no una regla, y la
 * gracia es poder correrla producto por producto sin tocar el resto.
 */
export function precioSugerido(
  costoCentavos: number,
  multiplicadorMilesimas: number | null = null,
): number {
  const milesimas = multiplicadorMilesimas ?? MARGEN_SUGERIDO_MILESIMAS;
  return redondearPrecio(Math.round((costoCentavos * milesimas) / MILESIMAS));
}

export type Margen = {
  /** por cuánto se multiplica el costo para llegar al precio: 1,4 */
  multiplicador: number;
  /** qué parte del precio de venta te queda, en por ciento */
  porcentaje: number;
  /** cuántos pesos deja cada unidad vendida */
  gananciaCentavos: number;
};

/**
 * El margen que sale de verdad, con el precio al que se vende hoy.
 *
 * Van los dos números porque son dos preguntas distintas y se confunden todo el
 * tiempo: el multiplicador es cuánto le pusiste encima al costo, el porcentaje
 * es qué parte de lo que cobrás te queda. Multiplicar por 1,4 no es ganar 40%:
 * es ganar 28,6% de lo que cobrás.
 */
export function calcularMargen(
  costoCentavos: number,
  precioVentaCentavos: number,
): Margen | null {
  if (costoCentavos <= 0 || precioVentaCentavos <= 0) return null;
  return {
    multiplicador: precioVentaCentavos / costoCentavos,
    porcentaje:
      ((precioVentaCentavos - costoCentavos) / precioVentaCentavos) * 100,
    gananciaCentavos: precioVentaCentavos - costoCentavos,
  };
}

/** "×1,40" — cómo se escribe un multiplicador. */
export function formatearMultiplicador(valor: number): string {
  return "×" + valor.toFixed(2).replace(".", ",");
}

/**
 * Cómo está escrito el precio en la factura del proveedor.
 *
 * El mayorista casi siempre lista el precio DEL BULTO —"cajón de gaseosa
 * $18.400"— y no el total de la partida. Tenerlo al revés obligaba a
 * multiplicar de cabeza antes de anotar, que es justo la cuenta que la app
 * tendría que estar haciendo.
 *
 * Cuando el producto viene suelto (un bulto trae 1) "por bulto" es lo mismo
 * que "por unidad", y la pantalla lo dice así.
 */
export type ModoPrecio = "bulto" | "total";

/** Lo que se edita en pantalla: todo texto hasta que se confirma. */
export type RenglonBorrador = {
  descripcion: string;
  cantidad: string;
  unidadesPorBulto: string;
  /** cómo hay que leer `importe` */
  modo: ModoPrecio;
  importe: string;
  /** por cuánto multiplicar el costo; vacío usa el del producto o el general */
  multiplicador: string;
  /** a cuánto venderlo; vacío deja el precio que ya tenía */
  precioVenta: string;
};

export function renglonVacio(): RenglonBorrador {
  return {
    descripcion: "",
    cantidad: "1",
    unidadesPorBulto: "1",
    // Por bulto es como viene la factura; el total es la excepción.
    modo: "bulto",
    importe: "",
    multiplicador: "",
    precioVenta: "",
  };
}

/**
 * De lo escrito al total del renglón, que es lo único que se guarda.
 *
 * Guardar el total y no el precio unitario es lo que hace que la suma de los
 * renglones siga dando lo que dice la factura. Con el precio del bulto
 * guardado, el total sería una multiplicación más a rehacer en cada pantalla.
 */
export function totalDelRenglon(
  importeCentavos: number | null,
  cantidad: number,
  modo: ModoPrecio,
): number | null {
  if (importeCentavos == null) return null;
  return modo === "bulto" ? importeCentavos * Math.max(1, cantidad) : importeCentavos;
}

/** Un renglón cuenta si tiene nombre O importe. Sólo se descarta el vacío. */
export function renglonesCargados(lista: RenglonBorrador[]): RenglonBorrador[] {
  return lista.filter((r) => r.descripcion.trim() || r.importe.trim());
}

export class RenglonInvalido extends Error {}

/** El multiplicador escrito en el renglón, en milésimas. */
function leerMultiplicador(renglon: RenglonBorrador): number | null {
  if (!renglon.multiplicador.trim()) return null;
  const numero = Number(renglon.multiplicador.trim().replace(",", "."));
  if (!Number.isFinite(numero) || numero < 1 || numero > 10) {
    throw new RenglonInvalido(
      `El multiplicador de ${nombrar(renglon)} tiene que estar entre 1 y 10.`,
    );
  }
  return Math.round(numero * MILESIMAS);
}

/** El precio de venta escrito en el renglón, en centavos. */
function leerPrecioVenta(renglon: RenglonBorrador): number | null {
  if (!renglon.precioVenta.trim()) return null;
  const centavos = parsearMonto(renglon.precioVenta);
  if (centavos == null || centavos <= 0) {
    throw new RenglonInvalido(
      `Revisá el precio de venta de ${nombrar(renglon)}.`,
    );
  }
  return centavos;
}

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

    let escrito: number | null = null;
    if (renglon.importe.trim()) {
      const centavos = parsearMonto(renglon.importe);
      if (centavos == null || centavos <= 0) {
        throw new RenglonInvalido(`Revisá el importe de ${nombrar(renglon)}.`);
      }
      escrito = centavos;
    }

    return {
      descripcion: renglon.descripcion.trim() || null,
      cantidad,
      unidadesPorBulto,
      /*
       * Siempre "un". Al proveedor se le compran UNIDADES —tres cajones de
       * seis botellas son dieciocho botellas— y los ml o gramos son del
       * producto, no de la compra: eso vive en `productos.contenido`. Tenerlo
       * en los dos lados hacía elegir dos veces la misma cosa y permitía que
       * no coincidieran. La columna queda porque las compras viejas la usaron.
       */
      unidad: "un",
      importeCentavos: totalDelRenglon(escrito, cantidad, renglon.modo),
      precioVentaCentavos: leerPrecioVenta(renglon),
      multiplicadorMilesimas: leerMultiplicador(renglon),
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
