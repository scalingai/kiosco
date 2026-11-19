import Link from "next/link";
import type { ReactNode } from "react";

/**
 * La tarjeta blanca donde vive una tabla.
 *
 * Es el marco de TODAS las planillas de Stock: blanca sobre el papel gris, sin
 * sombra, con el borde fino. El relleno lateral compensa el `-mx-4` que la
 * tabla usa en el celular para llegar al borde, así que la tabla y la tarjeta
 * se alinean en cualquier ancho.
 */
export default function Planilla({
  titulo,
  derecha,
  children,
}: {
  titulo?: ReactNode;
  /** lo que va al otro extremo del título: un total, un aviso */
  derecha?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta">
      {titulo && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-linea bg-papel-hondo/50 px-4 py-1.5 text-xs">
          <h2 className="font-medium text-tinta">{titulo}</h2>
          {derecha && <span className="text-tinta-suave">{derecha}</span>}
        </div>
      )}
      <div className="px-4 pb-1">{children}</div>
    </section>
  );
}

/** Un chip para elegir entre cortes de la misma planilla. */
export function Corte({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={
        "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors " +
        (activo
          ? "border-acento bg-acento text-white"
          : "border-linea bg-tarjeta text-tinta hover:bg-papel-hondo")
      }
    >
      {children}
    </Link>
  );
}
