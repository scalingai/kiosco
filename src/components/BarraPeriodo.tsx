import Link from "next/link";
import {
  correrPeriodo,
  ETIQUETA_PERIODO,
  PERIODOS,
  type Rango,
} from "@/lib/periodo";

/**
 * El control principal de las planillas: qué pedazo de tiempo se está mirando.
 *
 * Va arriba de todo, al lado del título, porque TODO lo de abajo depende de él
 * —los KPIs, los totales, las filas—. Cuando el selector vivía al costado o
 * abajo, lo primero que hacía cualquiera era leer un número y recién después
 * descubrir de qué período era.
 *
 * Es de servidor y navega con links de verdad, no con estado del navegador. Dos
 * motivos, y los dos importan: la página es `force-dynamic` y los datos los
 * trae el servidor igual, así que un `useState` obligaría a un segundo viaje; y
 * un link se puede guardar, compartir y abrir en otra pestaña. "El mes pasado"
 * es una URL.
 */
export default function BarraPeriodo({
  rango,
  base,
  extra,
}: {
  rango: Rango;
  /** la ruta de la página, ej `/ventas` */
  base: string;
  /** otros parámetros de la URL que hay que conservar al cambiar de período */
  extra?: Record<string, string | undefined>;
}) {
  const url = (periodo: string, fecha: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
    p.set("periodo", periodo);
    if (periodo !== "todo") p.set("fecha", fecha);
    return `${base}?${p}`;
  };

  const anterior = correrPeriodo(rango.periodo, rango.fecha, -1);
  const siguiente = correrPeriodo(rango.periodo, rango.fecha, 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        Las flechas abrazan al título y no viven aparte: así el conjunto se lee
        como una sola cosa —"estoy en noviembre y puedo moverme"— en vez de
        como un texto y unos botones sueltos.
      */}
      <div className="flex items-center gap-0.5">
        <Flecha href={anterior ? url(rango.periodo, anterior) : null} atras />
        <span className="min-w-28 px-1 text-center text-sm font-medium">
          {rango.titulo}
        </span>
        <Flecha href={siguiente ? url(rango.periodo, siguiente) : null} />
      </div>

      <div className="flex items-center gap-0.5 rounded-lg bg-papel-hondo p-0.5">
        {PERIODOS.map((p) => {
          const activo = p === rango.periodo;
          return (
            <Link
              key={p}
              href={url(p, rango.fecha)}
              aria-current={activo ? "page" : undefined}
              className={
                "rounded-md px-3 py-1 text-sm transition-colors " +
                (activo
                  ? "bg-tarjeta font-medium text-tinta shadow-sm"
                  : "text-tinta-suave hover:text-tinta")
              }
            >
              {ETIQUETA_PERIODO[p]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Una flecha. Sin destino se dibuja igual pero apagada y sin ser un link: que
 * desaparezca movería todo lo de al lado cada vez que llegás al borde.
 */
function Flecha({ href, atras }: { href: string | null; atras?: boolean }) {
  const dibujo = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={atras ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );

  const clases = "rounded-md p-1.5 transition-colors";

  if (!href) {
    return (
      <span className={clases + " text-tinta-suave/25"} aria-hidden="true">
        {dibujo}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={atras ? "Período anterior" : "Período siguiente"}
      className={clases + " text-tinta-suave hover:bg-papel-hondo hover:text-tinta"}
    >
      {dibujo}
    </Link>
  );
}
