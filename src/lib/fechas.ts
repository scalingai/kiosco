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

const FORMATO_MES = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
});

/** "2026-09" → "septiembre de 2026" */
export function nombreDeMes(mes: string): string {
  return FORMATO_MES.format(new Date(`${mes}-01T12:00:00Z`));
}

/** Corre un mes N lugares: "2026-09" + 1 = "2026-10". */
export function correrMes(mes: string, cuantos: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 1 + cuantos, 1));
  const dosDigitos = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${dosDigitos}`;
}
