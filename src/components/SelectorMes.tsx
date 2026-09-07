"use client";

import { useRouter } from "next/navigation";
import { correrMes, nombreDeMes } from "@/lib/fechas";

/**
 * Las compras se miran mes por mes, igual que la caja se mira día por día. El
 * mes vive en la URL para que el link de un mes puntual se pueda compartir y
 * para que el server lo arme sin estado del cliente.
 */
export default function SelectorMes({
  mes,
  base,
  extra,
  tope,
}: {
  mes: string;
  /** a dónde navegar: "/compras" o la ficha de un proveedor */
  base: string;
  /** parámetros que hay que conservar al cambiar de mes */
  extra?: Record<string, string>;
  /** el mes más nuevo al que se puede ir; normalmente el actual */
  tope: string;
}) {
  const router = useRouter();

  function ir(destino: string) {
    const params = new URLSearchParams(extra);
    params.set("mes", destino);
    router.push(`${base}?${params.toString()}`);
  }

  const flecha =
    "rounded-full border border-linea bg-white/70 px-3 py-1.5 text-sm leading-none disabled:opacity-35";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ir(correrMes(mes, -1))}
        aria-label="Mes anterior"
        className={flecha}
      >
        ‹
      </button>

      <span className="min-w-[9.5rem] text-center text-sm font-medium first-letter:uppercase">
        {nombreDeMes(mes)}
      </span>

      {/* Un mes que todavía no pasó está siempre vacío. */}
      <button
        type="button"
        onClick={() => ir(correrMes(mes, 1))}
        disabled={mes >= tope}
        aria-label="Mes siguiente"
        className={flecha}
      >
        ›
      </button>
    </div>
  );
}
