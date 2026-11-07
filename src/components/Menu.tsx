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
  grabando: boolean;
  procesando: boolean;
  segundos: number;
  onGrabar: () => void;
  onFrenar: () => void;
  onNuevaVenta: () => void;
  onNuevaCompra: () => void;
};

function IconoCasa() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function IconoDia() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8.5 15.5h7" />
    </svg>
  );
}

function IconoPedidos() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M5 8h14l-1 11.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function IconoLocal() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3 10 4.8 4.6A1 1 0 0 1 5.75 4h12.5a1 1 0 0 1 .95.6L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

function IconoHistorial() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v4h4" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function IconoFiado() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 6.5h16v11H4z" />
      <path d="M8 6.5v11M4 10h4M4 14h4" />
      <path d="M12 11h5M12 14h3" />
    </svg>
  );
}

function IconoCompras() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3.5 6.5h2l1.6 9.2a1.5 1.5 0 0 0 1.5 1.3h8.3a1.5 1.5 0 0 0 1.5-1.2l1.1-6.3H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </svg>
  );
}

function IconoVentas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 19V9.5M10 19V5M16 19v-6.5M4 19h16" />
    </svg>
  );
}

function IconoStock() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" />
    </svg>
  );
}

function IconoMicrofono({ grande }: { grande?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={(grande ? "h-5 w-5" : "h-4 w-4") + " shrink-0"}
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

const PAGINAS = [
  { href: "/", etiqueta: "Inicio", Icono: IconoCasa },
  { href: "/fiado", etiqueta: "Fiado", Icono: IconoFiado },
  { href: "/caja", etiqueta: "Caja", Icono: IconoDia },
  { href: "/ventas", etiqueta: "Ventas", Icono: IconoVentas },
  { href: "/compras", etiqueta: "Compras", Icono: IconoCompras },
  { href: "/stock", etiqueta: "Stock", Icono: IconoStock },
  { href: "/historial", etiqueta: "Historial", Icono: IconoHistorial },
  { href: "/pedidos", etiqueta: "Pedidos", Icono: IconoPedidos },
  { href: "/sucursales", etiqueta: "Sucursales", Icono: IconoLocal },
] as const;

/**
 * Cómo se llama la pantalla que estás mirando. En el celular la barra de arriba
 * es lo único que queda, así que decir dónde estás es lo que tiene que hacer:
 * un botón solo, sin texto, no te ubica cuando volvés a la app al rato.
 */
function tituloDe(ruta: string): string {
  const pagina = PAGINAS.find((p) => p.href === ruta);
  if (pagina) return pagina.etiqueta;
  if (ruta.startsWith("/cliente/")) return "Cuenta del cliente";
  // Las subpáginas de compras (proveedor, día) siguen siendo compras.
  if (ruta.startsWith("/compras")) return "Compras";
  return "El Osito";
}

/**
 * El menú de la app: una columna fija en pantalla grande y un cajón que se
 * despliega en el celular. Antes esto era una barra abajo; con la caja diaria
 * adentro son más pantallas de las que entran en una fila.
 */
export default function Menu({
  conSalir,
  grabando,
  procesando,
  segundos,
  onGrabar,
  onFrenar,
  onNuevaVenta,
  onNuevaCompra,
}: Props) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

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

  const enlace = (activo: boolean) =>
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors " +
    /*
     * El menú va sobre el verde, así que el activo no se puede marcar con un
     * fondo de color: encima de la lava, un tinte verde no se distingue del
     * fondo. Lo marca un vidrio blanco, que funciona igual sobre la parte
     * clara y sobre la oscura del humo.
     */
    (activo
      ? "bg-white/20 font-medium text-white shadow-sm"
      : "text-emerald-50/75 hover:bg-white/10 hover:text-white");

  const panel = (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <Link
        href="/"
        className="mb-3 flex items-center gap-2.5 px-2"
        onClick={() => setAbierto(false)}
      >
        <Image
          src="/oso.png"
          alt=""
          width={36}
          height={36}
          priority
          className="h-9 w-9 object-contain"
        />
        <span className="font-display text-2xl font-semibold leading-none tracking-tight text-white">
          El Osito
        </span>
      </Link>

      <nav aria-label="Navegación" className="space-y-1">
        {PAGINAS.map(({ href, etiqueta, Icono }) => (
          <Link
            key={href}
            href={href}
            // Al navegar, el cajón se cierra: si no, tapa lo que fuiste a ver.
            onClick={() => setAbierto(false)}
            className={enlace(ruta === href)}
          >
            <Icono />
            {etiqueta}
          </Link>
        ))}
      </nav>

      {/*
        Las dos cosas que se hacen todo el día: cobrar y recibir mercadería.
        Viven acá arriba de todo y no adentro de su pantalla porque se arrancan
        desde donde uno esté — llega un cliente al mostrador y no importa qué
        estabas mirando.
      */}
      <div className="mt-4 space-y-2 border-t border-white/15 pt-4">
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            onNuevaVenta();
          }}
          className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-marca shadow-sm transition-colors hover:bg-emerald-50"
        >
          <IconoVentas />
          Nueva venta
        </button>

        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            onNuevaCompra();
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-white/25 px-3 py-2.5 text-sm text-emerald-50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <IconoCompras />
          Nueva compra
        </button>

        {/*
          El audio quedó como ícono: dejó de ser una de las dos acciones
          principales, pero sacarle la puerta del todo lo volvería código
          muerto — y es la forma más rápida de anotar un fiado con las manos
          ocupadas, que es para lo que se hizo.
        */}
        <button
          type="button"
          onClick={grabando ? onFrenar : onGrabar}
          disabled={procesando}
          aria-label={grabando ? "Frenar la grabación" : "Grabar un audio"}
          className={
            "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors disabled:opacity-60 " +
            (grabando
              ? "bg-deuda text-white"
              : "text-emerald-50/70 hover:bg-white/10 hover:text-white")
          }
        >
          {grabando ? (
            <>
              <span className="grabando block h-3.5 w-3.5 shrink-0 rounded-sm bg-white" />
              <span className="cifra">Frenar · {segundos}s</span>
            </>
          ) : (
            <>
              <IconoMicrofono />
              {procesando ? "Escuchando…" : "Anotar por audio"}
            </>
          )}
        </button>
      </div>

      {conSalir && (
        <div className="mt-auto px-2 pt-4">
          <BotonSalir />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Pantalla grande: la columna vive siempre, no se despliega. */}
      {/* Pantalla grande: la columna vive siempre sobre la lava del marco, sin
          fondo propio — el verde que se ve es el del layout, y por eso el humo
          sigue de largo por detrás del menú sin cortarse.

          El corte es "escritorio" y no "lg": eso viene de main y es mejor que
          lo que yo tenía. Una tablet acostada muestra la planilla y parada
          muestra la navegación del celular, que es como se usa de verdad. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 escritorio:block">
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

        {/*
          Mientras graba, el botón de frenar tiene que estar a la vista sí o sí:
          si viviera sólo adentro del cajón, quedaría un micrófono abierto que
          no se puede cortar sin abrir el menú.
        */}
        {(grabando || procesando) && (
          <button
            type="button"
            onClick={grabando ? onFrenar : undefined}
            disabled={procesando}
            className={
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-70 " +
              (grabando ? "bg-deuda text-white" : "bg-white text-marca")
            }
          >
            {grabando ? (
              <>
                <span className="grabando block h-3.5 w-3.5 rounded-sm bg-white" />
                <span className="cifra">{segundos}s</span>
              </>
            ) : (
              <span className="grabando">Escuchando…</span>
            )}
          </button>
        )}
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
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-hidden shadow-2xl">
            <FondoMarca velo="parejo" />
            <div className="relative h-full">{panel}</div>
          </div>
        </div>
      )}
    </>
  );
}
