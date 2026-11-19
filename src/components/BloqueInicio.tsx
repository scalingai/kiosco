import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Un bloque del Inicio: una planilla corta con su título y un link a la
 * sección de donde sale.
 *
 * Es una tarjeta blanca y no más que eso. El relleno horizontal coincide con
 * el `-mx-4` de `Tabla`, para que la planilla llegue al borde de la tarjeta.
 */
export default function BloqueInicio({
  titulo,
  href,
  enlace,
  urgente,
  children,
  pie,
  className = "",
}: {
  titulo: string;
  /** a dónde lleva el "ver todo" */
  href: string;
  enlace: string;
  /** hay algo esperando: el borde y el título lo dicen */
  urgente?: boolean;
  children: ReactNode;
  /** una línea chica debajo, para avisos como "y 4 más" */
  pie?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "overflow-hidden rounded-xl border bg-tarjeta px-4 pb-1 " +
        (urgente ? "border-deuda/50 " : "border-linea ") +
        className
      }
    >
      <div className="flex items-baseline justify-between gap-3 py-2.5">
        <h2
          className={
            "text-sm font-medium " + (urgente ? "text-deuda" : "text-tinta")
          }
        >
          {titulo}
        </h2>
        <Link
          href={href}
          className="text-xs text-tinta-suave underline-offset-4 hover:text-tinta hover:underline"
        >
          {enlace} →
        </Link>
      </div>
      {children}
      {pie && (
        <p className="border-t border-linea py-2 text-xs text-tinta-suave">
          {pie}
        </p>
      )}
    </section>
  );
}
