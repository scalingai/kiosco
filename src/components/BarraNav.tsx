"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

type Props = {
  grabando: boolean;
  procesando: boolean;
  segundos: number;
  onGrabar: () => void;
  onFrenar: () => void;
  onCargarAMano: () => void;
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
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
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
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4v4h4" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function IconoMicrofono() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

/**
 * La barra de abajo. En el mostrador se usa con una mano: el micrófono va a la
 * derecha, donde llega el pulgar, y sobresale porque es lo que más se toca.
 */
export default function BarraNav({
  grabando,
  procesando,
  segundos,
  onGrabar,
  onFrenar,
  onCargarAMano,
}: Props) {
  const ruta = usePathname();

  // En el portón no hay nada que navegar.
  if (ruta === "/entrar") return null;

  const casilla = (activo: boolean) =>
    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.7rem] " +
    (activo ? "text-acento" : "text-tinta-suave");

  return (
    <nav
      aria-label="Navegación"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-papel-hondo/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-md items-end justify-between gap-1 px-3 pb-[env(safe-area-inset-bottom)]">
        <Link href="/" className={casilla(ruta === "/")}>
          <IconoCasa />
          Inicio
        </Link>

        <Link href="/historial" className={casilla(ruta === "/historial")}>
          <IconoHistorial />
          Historial
        </Link>

        <button type="button" onClick={onCargarAMano} className={casilla(false)}>
          <span className="flex h-5 w-5 items-center justify-center text-2xl leading-none">
            +
          </span>
          A mano
        </button>

        <button
          type="button"
          onClick={grabando ? onFrenar : onGrabar}
          disabled={procesando}
          aria-label={grabando ? "Frenar la grabación" : "Grabar un audio"}
          className="flex flex-1 flex-col items-center"
        >
          {/* El anillo del color del papel hace que el botón se vea recortado
              sobre la barra en vez de apoyado encima. */}
          <span
            className={
              "-mt-7 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full text-white shadow-lg ring-4 ring-papel transition-transform active:scale-95 " +
              (grabando ? "bg-deuda" : "bg-acento") +
              (procesando ? " opacity-70" : "")
            }
          >
            {procesando ? (
              <span className="grabando text-base font-medium">…</span>
            ) : grabando ? (
              <span className="grabando block h-5 w-5 rounded-sm bg-white" />
            ) : (
              <IconoMicrofono />
            )}
          </span>
          <span
            className={
              "cifra mt-1 pb-1 text-[0.7rem] " +
              (grabando ? "text-deuda" : "text-tinta-suave")
            }
          >
            {grabando ? segundos + "s" : procesando ? "…" : "Audio"}
          </span>
        </button>
      </div>
    </nav>
  );
}
