import type { ReactNode } from "react";

/**
 * El chip de estado de una fila: "Pagada", "Pendiente", "Anulada".
 *
 * Existe para que el estado se lea sin leerlo. En una planilla de cincuenta
 * filas, lo que el ojo barre es la forma y el color de esta columna; el texto
 * sólo se lee cuando algo llama la atención. Por eso el tono no es decoración
 * y hay uno solo por significado:
 *
 * - `pago` (verde) — la plata entró, el asunto está cerrado
 * - `deuda` (rojo) — falta plata
 * - `espera` (ámbar) — todavía no se sabe; no es bueno ni malo
 * - `apagado` (gris) — ya no cuenta: anulado, cancelado
 *
 * El ámbar es el único color que no sale de los tokens de la app, y es a
 * propósito: `deuda` ya es rojo y `marca` también, así que "ojo, esto está en
 * el aire" no podía ser otro rojo más.
 */

export type Tono = "pago" | "deuda" | "espera" | "apagado";

const CLASES: Record<Tono, string> = {
  pago: "bg-pago-tenue text-pago",
  deuda: "bg-deuda-tenue text-deuda",
  espera: "bg-amber-100 text-amber-800",
  apagado: "bg-papel-hondo text-tinta-suave",
};

export default function Pastilla({
  tono = "apagado",
  children,
  icono,
}: {
  tono?: Tono;
  children: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium " +
        CLASES[tono]
      }
    >
      {icono}
      {children}
    </span>
  );
}

/** El tilde de "listo". Chico, para que entre adentro de la pastilla. */
export function Tilde() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

/** El puntito de "en curso": no es un tilde porque todavía no terminó. */
export function Punto() {
  return (
    <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
  );
}
