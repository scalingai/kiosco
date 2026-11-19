import type { ReactNode } from "react";

/**
 * La tarjeta blanca sobre la que se apoya una planilla. Es sólo el marco: el
 * relleno horizontal coincide con el `-mx-4` de `Tabla` en pantallas chicas,
 * para que la tabla llegue al borde de la tarjeta y no al de la pantalla.
 */
export default function TarjetaPlanilla({
  children,
  pie,
}: {
  children: ReactNode;
  /** una línea chica debajo, para avisos como "mostrando las últimas 1000" */
  pie?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
      {children}
      {pie && (
        <p className="border-t border-linea py-2 text-xs text-tinta-suave">
          {pie}
        </p>
      )}
    </section>
  );
}
