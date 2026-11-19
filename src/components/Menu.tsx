"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BotonSalir from "@/components/BotonSalir";
import FondoMarca from "@/components/Lava";

type Props = {
  /** Sin PIN configurado no hay sesión que cerrar, así que no se ofrece salir. */
  conSalir: boolean;
  onNuevaVenta: () => void;
};

/*
 * Los íconos van en 24×24 y se dibujan a 26 px adentro del cuadrado de vidrio.
 * Trazo 1.6: a este tamaño, 1.7 empastaba los que tienen líneas juntas.
 */
const traza = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-6 w-6",
  "aria-hidden": true,
} as const;

function IconoInicio() {
  return (
    <svg {...traza}>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function IconoVentas() {
  return (
    <svg {...traza}>
      <path d="M4 19V9.5M10 19V5M16 19v-6.5M4 19h16" />
    </svg>
  );
}

function IconoStock() {
  return (
    <svg {...traza}>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" />
    </svg>
  );
}

function IconoPedidos() {
  return (
    <svg {...traza}>
      <path d="M5 8h14l-1 11.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function IconoFinanzas() {
  return (
    <svg {...traza}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 9.1a2.7 2.7 0 0 0-2.6-1.4c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.6.8 2.6 2.1-1.1 2.1-2.6 2.1a2.8 2.8 0 0 1-2.6-1.5" />
      <path d="M12 6v12" />
    </svg>
  );
}

function IconoNuevaVenta() {
  return (
    <svg {...traza}>
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

/**
 * Las cinco secciones.
 *
 * Eran once. Lo que se juntó no se juntó por prolijidad: Fiado es una venta que
 * todavía no se cobró, Historial es la misma venta mirada en orden, y Compras
 * es de dónde salió lo que hay en Stock. Como entradas sueltas, el menú te
 * obligaba a saber de antemano en qué pantalla vive el dato que buscás. Ahora
 * cada una es una solapa adentro de la sección donde uno la iría a buscar.
 *
 * `raices` es qué rutas pintan esta sección como activa: sin eso, entrar a la
 * solapa de Fiado apagaba Ventas y el menú dejaba de decirte dónde estás.
 */
const SECCIONES = [
  { href: "/", etiqueta: "Inicio", Icono: IconoInicio, raices: ["/"] },
  {
    href: "/ventas",
    etiqueta: "Ventas",
    Icono: IconoVentas,
    raices: ["/ventas", "/fiado", "/historial", "/cliente"],
  },
  {
    href: "/stock",
    etiqueta: "Stock",
    Icono: IconoStock,
    raices: ["/stock", "/compras", "/reponer"],
  },
  { href: "/pedidos", etiqueta: "Pedidos", Icono: IconoPedidos, raices: ["/pedidos"] },
  {
    href: "/finanzas",
    etiqueta: "Finanzas",
    Icono: IconoFinanzas,
    raices: ["/finanzas", "/caja", "/inversion"],
  },
] as const;

function seccionDe(ruta: string) {
  return SECCIONES.find((s) =>
    s.raices.some((r) => (r === "/" ? ruta === "/" : ruta.startsWith(r))),
  );
}

/** Cómo se llama la pantalla, para la barra del celular. */
function tituloDe(ruta: string): string {
  if (ruta.startsWith("/cliente/")) return "Cuenta del cliente";
  return seccionDe(ruta)?.etiqueta ?? "El Osito";
}

/**
 * El menú: una columna angosta en pantalla grande, un cajón en el celular.
 *
 * El ícono es grande y adentro de un cuadrado de vidrio, con la etiqueta
 * ABAJO en vez de al costado. Eso es lo que permite que la columna pase de 224
 * a 96 px: el ancho dejó de depender de la palabra más larga. Los ~130 px que
 * se recuperan van a la planilla, que es lo que se mira todo el día.
 *
 * El cuadrado de vidrio no es un adorno: el menú va sobre la lava roja, donde
 * un fondo de color no se distingue del fondo. Un vidrio blanco funciona igual
 * sobre la parte clara y sobre la oscura del humo, y es lo que marca el activo.
 */
export default function Menu({ conSalir, onNuevaVenta }: Props) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const activa = seccionDe(ruta);

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  // En el portón no hay nada que navegar.
  if (ruta === "/entrar") return null;

  const cuadrado = (activo: boolean) =>
    "flex h-12 w-12 items-center justify-center rounded-2xl border backdrop-blur transition-colors " +
    (activo
      ? "border-white/25 bg-white/20 text-white shadow-sm"
      : "border-white/10 bg-white/[0.07] text-emerald-50/80 group-hover:bg-white/15 group-hover:text-white");

  const item = (
    { href, etiqueta, Icono }: (typeof SECCIONES)[number],
    activo: boolean,
  ) => (
    <Link
      key={href}
      href={href}
      onClick={() => setAbierto(false)}
      aria-current={activo ? "page" : undefined}
      className="group flex flex-col items-center gap-1 rounded-2xl py-1.5"
    >
      <span className={cuadrado(activo)}>
        <Icono />
      </span>
      <span
        className={
          "text-[0.7rem] leading-none transition-colors " +
          (activo ? "font-medium text-white" : "text-emerald-50/70 group-hover:text-white")
        }
      >
        {etiqueta}
      </span>
    </Link>
  );

  const panel = (
    <div className="flex h-full flex-col items-center gap-1 px-2 py-4">
      <Link
        href="/"
        className="mb-3 block"
        onClick={() => setAbierto(false)}
        aria-label="El Osito, inicio"
      >
        {/* El logo solo, sin el texto al lado: el dibujo ya dice cómo se llama,
            y el nombre repetido era lo que obligaba a la columna a ser ancha. */}
        <Image
          src="/oso.png"
          alt="El Osito"
          width={52}
          height={52}
          priority
          className="h-13 w-13 object-contain drop-shadow"
        />
      </Link>

      <nav aria-label="Navegación" className="flex w-full flex-col gap-0.5">
        {SECCIONES.map((s) => item(s, activa?.href === s.href))}
      </nav>

      {/*
        Cobrar es lo único que se hace todo el día y desde donde sea: llega un
        cliente al mostrador y no importa qué pantalla tenías abierta. Por eso
        es lo único que quedó como botón, y las otras dos acciones se fueron:
        una compra se carga desde Stock, que es donde se está mirando qué falta.
      */}
      <div className="mt-4 w-full border-t border-white/15 pt-4">
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            onNuevaVenta();
          }}
          className="group flex w-full flex-col items-center gap-1 rounded-2xl py-1.5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-marca shadow-sm transition-colors group-hover:bg-emerald-50">
            <IconoNuevaVenta />
          </span>
          <span className="text-[0.7rem] font-medium leading-none text-white">
            Vender
          </span>
        </button>
      </div>

      {conSalir && (
        <div className="mt-auto pt-4">
          <BotonSalir />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Pantalla grande: la columna vive siempre sobre la lava del marco, sin
          fondo propio — el verde que se ve es el del layout, y por eso el humo
          sigue de largo por detrás del menú sin cortarse.

          El corte es "escritorio" y no "lg": una tablet acostada muestra la
          planilla y parada muestra la navegación del celular, que es como se
          usa de verdad. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-24 escritorio:block">
        {panel}
      </aside>

      {/* Celular: arriba queda un solo botón, y todo lo demás sale de ahí. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 px-3 text-white escritorio:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir el menú"
          aria-expanded={abierto}
          className="rounded-xl border border-white/25 px-3 py-2 transition-colors hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold leading-none">
          {tituloDe(ruta)}
        </span>
      </header>

      {abierto && (
        <div className="fixed inset-0 z-50 escritorio:hidden">
          <button
            type="button"
            aria-label="Cerrar el menú"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 bg-tinta/35"
          />
          {/* El cajón es la MISMA superficie que la columna de escritorio: si
              fuera una hoja blanca, abrir el menú cambiaría de app. */}
          <div className="absolute inset-y-0 left-0 w-28 overflow-hidden shadow-2xl">
            <FondoMarca velo="parejo" />
            <div className="relative h-full">{panel}</div>
          </div>
        </div>
      )}
    </>
  );
}
