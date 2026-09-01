"use client";

import { useEffect, useRef } from "react";

/**
 * Hoja que sube desde abajo. Se usa para todo lo que antes eran secciones de la
 * página: en el mostrador la pantalla es chica y lo que importa es la lista.
 */
export default function Hoja({
  abierta,
  titulo,
  onCerrar,
  children,
}: {
  abierta: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclear);

    // Sin esto, el fondo sigue scrolleando detrás de la hoja. Y al sacarle la
    // barra al body la página salta: se compensa con el mismo ancho de padding.
    const overflowPrevio = document.body.style.overflow;
    const paddingPrevio = document.body.style.paddingRight;
    const anchoBarra = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (anchoBarra > 0) document.body.style.paddingRight = `${anchoBarra}px`;

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
      document.body.style.paddingRight = paddingPrevio;
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-tinta/35"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-linea bg-papel shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-linea px-5 py-3.5">
          <h2 className="font-display text-xl leading-none">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-2 rounded-full px-2.5 py-1 text-2xl leading-none text-tinta-suave"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
