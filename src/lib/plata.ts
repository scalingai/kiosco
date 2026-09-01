/**
 * Toda la plata viaja en centavos enteros. Estas son las únicas dos fronteras
 * donde se convierte: entrada del usuario y salida a pantalla.
 */

export function pesosACentavos(pesos: number): number {
  if (!Number.isFinite(pesos)) throw new Error("Monto inválido");
  return Math.round(pesos * 100);
}

export function centavosAPesos(centavos: number): number {
  return centavos / 100;
}

/**
 * Interpreta lo que se escribe a mano en el formulario. Acepta las dos formas
 * que la gente usa acá: "12.500", "12500", "12.500,50", "$ 12500,5".
 */
export function parsearMonto(entrada: string): number | null {
  const limpio = entrada.replace(/[^\d.,-]/g, "").trim();
  if (!limpio) return null;

  const tieneComa = limpio.includes(",");
  const tienePunto = limpio.includes(".");

  let normalizado: string;
  if (tieneComa && tienePunto) {
    // "12.500,50" → el punto es separador de miles, la coma es decimal
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (tieneComa) {
    normalizado = limpio.replace(",", ".");
  } else if (tienePunto) {
    // "12.500" es doce mil quinientos, no doce con medio. Sólo tratamos el
    // punto como decimal si deja uno o dos dígitos atrás y hay un solo punto.
    const partes = limpio.split(".");
    const decimalPlausible = partes.length === 2 && partes[1].length <= 2;
    normalizado = decimalPlausible ? limpio : limpio.replace(/\./g, "");
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;
  return pesosACentavos(valor);
}

function formateador(decimales: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

const REDONDO = formateador(0);
const CON_CENTAVOS = formateador(2);

/** Los montos redondos van sin decimales; sólo aparecen si de verdad hay centavos. */
export function formatearCentavos(centavos: number): string {
  const pesos = centavosAPesos(centavos);
  return centavos % 100 === 0 ? REDONDO.format(pesos) : CON_CENTAVOS.format(pesos);
}
