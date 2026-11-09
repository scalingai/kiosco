/**
 * Códigos de barras: validarlos y reconocerlos.
 *
 * Viven en su propio archivo y no en `stock.ts` por una razón concreta: el
 * mostrador —que corre en el navegador— necesita `pareceCodigoDeBarras` para
 * no confundir un escaneo con un precio. Importarla de `stock.ts` arrastraba
 * `src/db/client.ts` y con él el driver de Postgres al bundle del cliente, y
 * el build se caía con `module not found`. Acá no hay ninguna dependencia:
 * son dos funciones puras sobre un string.
 */

/**
 * Valida un código de barras por su dígito verificador.
 *
 * Los EAN-13 y EAN-8 llevan el último dígito calculado a partir de los otros,
 * justamente para detectar un dígito mal leído o mal tipeado. Chequearlo es lo
 * que evita el peor caso: un código que "parece" bien, se guarda, y el día que
 * se escanee trae otro producto.
 *
 * Los EAN argentinos arrancan en 779, pero eso NO se exige: en la góndola hay
 * importados y productos con código de otro país.
 */
export function codigoValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;
  if (codigo.length !== 8 && codigo.length !== 13) return false;

  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop()!;
  // De derecha a izquierda, uno de cada dos pesa 3 y el otro 1.
  const suma = digitos
    .reverse()
    .reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador;
}

/**
 * ¿Esto lo escribió un lector de códigos y no una persona?
 *
 * La diferencia importa porque el mostrador tiene DOS lecturas para el mismo
 * campo: buscar un producto o cobrar un monto suelto. Un código de barras es
 * una ristra larga de dígitos sin separadores; un precio que alguien tipea
 * tiene como mucho 6 ó 7 dígitos y muchas veces una coma o un punto.
 *
 * Esto NO usa `codigoValido()` a propósito: el dígito verificador sirve para
 * decidir si un código se GUARDA, no para decidir si lo que entró es un
 * escaneo. Un código mal leído sigue siendo un escaneo, y tratarlo como precio
 * es exactamente el accidente que esta función existe para evitar: escanear un
 * producto sin código cargado y terminar con un renglón de miles de millones
 * de pesos en el carrito.
 */
export function pareceCodigoDeBarras(texto: string): boolean {
  return /^\d{8,14}$/.test(texto.trim());
}
