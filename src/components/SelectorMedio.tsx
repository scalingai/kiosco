"use client";

import { ETIQUETA_MEDIO, MEDIOS, type MedioPago } from "@/lib/negocio";

/**
 * Con qué se paga o se cobra. Tres botones y no un desplegable: es lo que más
 * se toca de cada formulario y en el mostrador se elige de un dedazo.
 */
export default function SelectorMedio({
  valor,
  onCambio,
  etiqueta = "Con qué",
}: {
  valor: MedioPago;
  onCambio: (medio: MedioPago) => void;
  etiqueta?: string;
}) {
  return (
    <div>
      <span className="text-xs text-tinta-suave">{etiqueta}</span>
      <div className="mt-1 flex gap-2" role="group" aria-label={etiqueta}>
        {MEDIOS.map((medio) => (
          <button
            key={medio}
            type="button"
            aria-pressed={valor === medio}
            onClick={() => onCambio(medio)}
            className={
              "flex-1 rounded-lg border px-2 py-2 text-sm " +
              (valor === medio
                ? "border-acento bg-acento text-white"
                : "border-linea bg-white text-tinta")
            }
          >
            {ETIQUETA_MEDIO[medio]}
          </button>
        ))}
      </div>
    </div>
  );
}
