import Link from "next/link";

/**
 * Las solapas de adentro de una sección.
 *
 * Son la mitad del rediseño del menú: el menú bajó de once entradas a cinco
 * porque cosas que eran pantallas pasaron a ser solapas. Fiado es una venta que
 * todavía no se cobró y Compras es de dónde salió lo que hay en Stock — como
 * entradas sueltas te obligaban a saber de antemano en qué pantalla vive el
 * dato; acá están donde uno las iría a buscar.
 *
 * Cada solapa es una ruta de verdad, no un estado del navegador: se puede
 * guardar, compartir y recargar sin perder dónde estabas. Y como el `href`
 * conserva los parámetros, cambiar de solapa no te saca del período que estabas
 * mirando.
 */
export default function Solapas({
  solapas,
  activa,
}: {
  solapas: { href: string; etiqueta: string; cuenta?: number }[];
  /** el `href` de la que está abierta */
  activa: string;
}) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-linea">
      {solapas.map(({ href, etiqueta, cuenta }) => {
        const esta = href.split("?")[0] === activa.split("?")[0];
        return (
          <Link
            key={href}
            href={href}
            aria-current={esta ? "page" : undefined}
            className={
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors " +
              (esta
                ? "border-acento font-medium text-tinta"
                : "border-transparent text-tinta-suave hover:border-linea-fuerte hover:text-tinta")
            }
          >
            {etiqueta}
            {cuenta !== undefined && cuenta > 0 && (
              <span
                className={
                  "cifra rounded px-1 py-px text-[0.65rem] " +
                  (esta ? "bg-acento-tenue text-acento" : "bg-papel-hondo")
                }
              >
                {cuenta}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
