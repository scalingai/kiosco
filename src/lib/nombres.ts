/**
 * Whisper escribe "Fernández" cuando dijiste "Hernández". Antes de crear un
 * cliente nuevo por una letra de diferencia, buscamos al que ya existe.
 */

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      siguiente[j] = Math.min(
        fila[j] + 1,
        siguiente[j - 1] + 1,
        fila[j - 1] + costo,
      );
    }
    fila = siguiente;
  }
  return fila[b.length];
}

export type Candidato = { id: string; nombre: string };

export type Coincidencia = {
  cliente: Candidato;
  /** 1 es idéntico; abajo de 0.72 no lo proponemos */
  puntaje: number;
};

/**
 * Devuelve el cliente más parecido, o null si ninguno se acerca lo suficiente.
 * Nunca decide sola: lo que devuelve es una propuesta que confirma la persona.
 */
export function buscarCoincidencia(
  nombreDicho: string,
  candidatos: Candidato[],
): Coincidencia | null {
  const objetivo = normalizarNombre(nombreDicho);
  if (!objetivo) return null;

  let mejor: Coincidencia | null = null;

  for (const cliente of candidatos) {
    const actual = normalizarNombre(cliente.nombre);
    if (!actual) continue;

    let puntaje: number;
    if (actual === objetivo) {
      puntaje = 1;
    } else if (
      // "juan" contra "juan perez": el kiosquero dice el nombre de pila
      actual.split(" ").includes(objetivo) ||
      objetivo.split(" ").includes(actual)
    ) {
      puntaje = 0.9;
    } else {
      const largo = Math.max(actual.length, objetivo.length);
      puntaje = 1 - distancia(actual, objetivo) / largo;
    }

    if (!mejor || puntaje > mejor.puntaje) mejor = { cliente, puntaje };
  }

  return mejor && mejor.puntaje >= 0.72 ? mejor : null;
}
