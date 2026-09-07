"use client";

import { useRouter } from "next/navigation";
import { hoyLocal } from "@/lib/fechas";

/** Corre la fecha ISO N días, sin que el huso horario la mueva de más. */
function correr(iso: string, dias: number): string {
  const fecha = new Date(`${iso}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Los días se miran de a uno y casi siempre es hoy o ayer, así que las flechas
 * son lo que más se usa. La fecha vive en la URL para poder compartir el link
 * de un día puntual y que el server la lea sin estado del cliente.
 */
export default function SelectorDia({ fecha }: { fecha: string }) {
  const router = useRouter();
  const hoy = hoyLocal();

  function ir(destino: string) {
    router.push(destino === hoy ? "/caja" : `/caja?f=${destino}`);
  }

  const flecha =
    "rounded-full border border-linea bg-white/70 px-3 py-1.5 text-sm leading-none";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ir(correr(fecha, -1))}
        aria-label="Día anterior"
        className={flecha}
      >
        ‹
      </button>

      <input
        type="date"
        value={fecha}
        max={hoy}
        onChange={(e) => e.target.value && ir(e.target.value)}
        aria-label="Día que se está mirando"
        className="cifra rounded-lg border border-linea bg-white px-2.5 py-1.5 text-sm"
      />

      {/* Sin tope para adelante no se puede: un día futuro está siempre vacío. */}
      <button
        type="button"
        onClick={() => ir(correr(fecha, 1))}
        disabled={fecha >= hoy}
        aria-label="Día siguiente"
        className={flecha + " disabled:opacity-35"}
      >
        ›
      </button>

      {fecha !== hoy && (
        <button
          type="button"
          onClick={() => ir(hoy)}
          className="text-xs text-acento underline underline-offset-4"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
