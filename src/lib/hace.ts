/**
 * "hace 12 min", "hace 3 h", "hace 2 d": cuánto lleva esperando algo.
 *
 * Es una función suelta y no vive adentro de una página a propósito: leer el
 * reloj dentro de un componente lo vuelve impuro, y acá el reloj ES el dato.
 */
export function haceCuanto(desde: Date, ahora: number = Date.now()): string {
  const minutos = Math.max(0, Math.floor((ahora - desde.getTime()) / 60_000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

/** "14:32" si es de hoy, "19/11 14:32" si es de otro día. */
export function cuandoCorto(fecha: Date, hoyIso: string): string {
  const hora = fecha.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (fecha.toLocaleDateString("sv-SE") === hoyIso) return hora;
  const dia = fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${dia} ${hora}`;
}
