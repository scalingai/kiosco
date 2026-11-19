/**
 * El período que está mirando la pantalla: hoy, esta semana, este mes, o todo.
 *
 * Vive acá y no en cada página porque las cuatro planillas —ventas, stock,
 * finanzas, pedidos— hacen exactamente la misma pregunta y la tienen que
 * contestar igual. Cuando cada una resolvía su propio rango, "el mes" de una
 * empezaba el día 1 y el de la otra hacía 30 días para atrás, y los totales de
 * dos pantallas que decían lo mismo no daban lo mismo.
 *
 * El rango es SIEMPRE en fechas locales `YYYY-MM-DD` y los dos extremos
 * incluidos, porque así se guardan las fechas en la base (`date`, no
 * `timestamp`): comparar con `>= desde and <= hasta` no tiene que pensar en
 * zonas horarias ni en el borde de la medianoche, que es de donde salieron los
 * bugs de fecha que ya conocemos.
 */

export const PERIODOS = ["dia", "semana", "mes", "todo"] as const;

export type Periodo = (typeof PERIODOS)[number];

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  todo: "Todo",
};

export type Rango = {
  periodo: Periodo;
  /** el ancla: el día que se está mirando, en formato `YYYY-MM-DD` */
  fecha: string;
  /** primer día incluido; `null` sólo cuando el período es "todo" */
  desde: string | null;
  /** último día incluido; `null` sólo cuando el período es "todo" */
  hasta: string | null;
  /** cómo se dice en pantalla: "Hoy", "Del 10 al 16 de nov", "Noviembre" */
  titulo: string;
  /** `true` cuando el rango incluye el día de hoy */
  esActual: boolean;
};

const DIA_MS = 86_400_000;

/** `2026-11-19` → `Date` al mediodía UTC. */
function aFecha(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  // Mediodía y no medianoche: así sumar o restar días nunca cae en el borde
  // donde el cambio de huso mueve la fecha un día para atrás.
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function aIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function correr(iso: string, dias: number): string {
  return aIso(new Date(aFecha(iso).getTime() + dias * DIA_MS));
}

export function hoy(): string {
  // La misma cuenta que `hoyLocal()` en fechas.ts, repetida acá para que este
  // módulo no dependa de nada: lo importan tanto el servidor como el navegador.
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Lunes de la semana en la que cae `iso`. La semana acá arranca el lunes. */
function lunesDe(iso: string): string {
  const f = aFecha(iso);
  // getUTCDay(): domingo = 0. Queremos que el domingo cierre la semana, no que
  // la abra: un kiosco cuenta "la semana" de lunes a domingo.
  const corrimiento = (f.getUTCDay() + 6) % 7;
  return correr(iso, -corrimiento);
}

const MES_LARGO = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DIA_CORTO = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DIA_LARGO = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Deja un texto cualquiera como período válido. */
export function leerPeriodo(valor: string | undefined | null): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : "dia";
}

/** Deja un texto cualquiera como fecha `YYYY-MM-DD`, o devuelve hoy. */
export function leerFecha(valor: string | undefined | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoy();
}

/**
 * El rango que corresponde a mirar `fecha` con el corte `periodo`.
 *
 * Es una función pura: le entra lo que dice la URL y sale todo lo que la
 * pantalla necesita, el título incluido. Las páginas no vuelven a calcular
 * fechas por su cuenta.
 */
export function resolverRango(periodo: Periodo, fecha: string): Rango {
  const ancla = leerFecha(fecha);
  const dia = hoy();

  if (periodo === "todo") {
    return {
      periodo,
      fecha: ancla,
      desde: null,
      hasta: null,
      titulo: "Todo",
      esActual: true,
    };
  }

  if (periodo === "semana") {
    const desde = lunesDe(ancla);
    const hasta = correr(desde, 6);
    const esActual = dia >= desde && dia <= hasta;
    return {
      periodo,
      fecha: ancla,
      desde,
      hasta,
      titulo: esActual
        ? "Esta semana"
        : `${DIA_CORTO.format(aFecha(desde))} al ${DIA_CORTO.format(aFecha(hasta))}`,
      esActual,
    };
  }

  if (periodo === "mes") {
    const [a, m] = ancla.split("-").map(Number);
    const desde = `${ancla.slice(0, 7)}-01`;
    // Día 0 del mes siguiente = último del actual, sin tener que saber cuántos
    // días tiene ni acordarse de los bisiestos.
    const hasta = aIso(new Date(Date.UTC(a, m, 0, 12)));
    const esActual = dia.slice(0, 7) === ancla.slice(0, 7);
    const nombre = MES_LARGO.format(aFecha(desde));
    return {
      periodo,
      fecha: ancla,
      desde,
      hasta,
      titulo: esActual ? "Este mes" : nombre[0].toUpperCase() + nombre.slice(1),
      esActual,
    };
  }

  const esActual = ancla === dia;
  return {
    periodo: "dia",
    fecha: ancla,
    desde: ancla,
    hasta: ancla,
    titulo: esActual
      ? "Hoy"
      : ancla === correr(dia, -1)
        ? "Ayer"
        : DIA_LARGO.format(aFecha(ancla)),
    esActual,
  };
}

/**
 * La fecha ancla del período anterior o siguiente.
 *
 * Devuelve `null` cuando no hay a dónde ir: "todo" no tiene anterior, y no se
 * puede avanzar más allá del período que contiene a hoy. Sin ese freno, las
 * flechas invitan a pasear por meses futuros que siempre están vacíos.
 */
export function correrPeriodo(
  periodo: Periodo,
  fecha: string,
  cuantos: 1 | -1,
): string | null {
  if (periodo === "todo") return null;

  const ancla = leerFecha(fecha);
  let destino: string;

  if (periodo === "semana") destino = correr(lunesDe(ancla), cuantos * 7);
  else if (periodo === "mes") {
    const [a, m] = ancla.split("-").map(Number);
    destino = aIso(new Date(Date.UTC(a, m - 1 + cuantos, 1, 12)));
  } else destino = correr(ancla, cuantos);

  if (cuantos === 1 && resolverRango(periodo, destino).desde! > hoy()) {
    return null;
  }
  return destino;
}
