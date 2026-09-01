/** ISO corto (YYYY-MM-DD) en la zona horaria de quien está mirando la pantalla. */
export function hoyLocal(): string {
  return new Date().toLocaleDateString("sv-SE");
}

const FORMATO_CORTO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
});

const FORMATO_LARGO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function aFecha(iso: string): Date {
  // El mediodía UTC evita que el huso horario corra la fecha un día.
  return new Date(`${iso}T12:00:00Z`);
}

export function fechaCorta(iso: string): string {
  return FORMATO_CORTO.format(aFecha(iso));
}

export function fechaLarga(iso: string): string {
  return FORMATO_LARGO.format(aFecha(iso));
}

export function diasDesde(iso: string): number {
  const dia = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - aFecha(iso).getTime()) / dia);
}
