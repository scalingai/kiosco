import type { ReactNode } from "react";
import BarraPeriodo from "@/components/BarraPeriodo";
import Solapas from "@/components/Solapas";
import type { Rango } from "@/lib/periodo";

const SOLAPAS = [
  { href: "/finanzas", etiqueta: "Balance" },
  { href: "/inversion", etiqueta: "Inversión" },
  { href: "/finanzas/reparto", etiqueta: "Reparto" },
] as const;

/**
 * La cabecera que comparten las tres solapas de Finanzas: título, período y
 * solapas, en ese orden.
 *
 * El período sólo aparece en Balance. La inversión y el reparto son acumulados
 * —lo que se puso desde que se abrió, lo que se ganó y se retiró desde
 * siempre— y ponerles un "Hoy" arriba sugeriría que cambian de un día a otro.
 */
export default function CabeceraFinanzas({
  activa,
  rango,
  acciones,
}: {
  /** el `href` de la solapa abierta */
  activa: (typeof SOLAPAS)[number]["href"];
  /** si viene, se dibuja la barra de período; las solapas acumuladas no lo pasan */
  rango?: Rango;
  /** botones de carga, a la derecha del título */
  acciones?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className="font-display text-3xl leading-none">Finanzas</h1>
          {rango && <BarraPeriodo rango={rango} base="/finanzas" />}
        </div>
        {acciones}
      </div>
      <Solapas activa={activa} solapas={[...SOLAPAS]} />
    </header>
  );
}
