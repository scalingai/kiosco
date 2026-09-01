/**
 * Le pone un techo de tiempo a una operación del servidor.
 *
 * Ojo con lo que NO hace: no cancela nada. La acción sigue corriendo del otro
 * lado y puede llegar a guardar. Por eso el mensaje que se muestra al vencer
 * nunca invita a reintentar a ciegas: repetir una carga que sí entró duplica la
 * deuda de una persona, que es peor que la espera.
 */
export type Resultado<T> = { venció: false; valor: T } | { venció: true };

export async function conLimiteDeTiempo<T>(
  promesa: Promise<T>,
  ms = 30_000,
): Promise<Resultado<T>> {
  let reloj: ReturnType<typeof setTimeout>;
  const limite = new Promise<Resultado<T>>((resolver) => {
    reloj = setTimeout(() => resolver({ venció: true }), ms);
  });

  return Promise.race([
    promesa.then((valor) => ({ venció: false as const, valor })),
    limite,
  ]).finally(() => clearTimeout(reloj));
}

export const AVISO_TARDANZA =
  "Está tardando demasiado. NO lo cargues de nuevo: puede haberse guardado igual. " +
  "Mirá la ficha del cliente antes de volver a intentar.";
