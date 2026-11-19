import BarraPeriodo from "@/components/BarraPeriodo";
import Solapas from "@/components/Solapas";
import type { Rango } from "@/lib/periodo";

const SOLAPAS = [
  { ruta: "/ventas", etiqueta: "Ventas" },
  { ruta: "/fiado", etiqueta: "Fiado" },
  { ruta: "/historial", etiqueta: "Historial" },
] as const;

/**
 * La cabecera que comparten las tres solapas de Ventas: título, período y
 * solapas, en ese orden.
 *
 * Es una sola para las tres porque el período tiene que sobrevivir al cambio
 * de solapa: los links de las solapas llevan los mismos parámetros, así que
 * pasar de Ventas a Fiado no te devuelve a "Hoy" sin avisar.
 */
export default function CabeceraVentas({
  rango,
  activa,
  deben,
}: {
  rango: Rango;
  /** la ruta de la solapa abierta, ej `/fiado` */
  activa: (typeof SOLAPAS)[number]["ruta"];
  /** cuántos clientes deben: el aviso de la solapa Fiado sin entrar */
  deben?: number;
}) {
  const parametros = new URLSearchParams({ periodo: rango.periodo });
  if (rango.periodo !== "todo") parametros.set("fecha", rango.fecha);

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="font-display text-3xl leading-none">Ventas</h1>
        {/* La barra navega a la solapa en la que estás, no siempre a /ventas. */}
        <BarraPeriodo rango={rango} base={activa} />
      </div>
      <Solapas
        activa={activa}
        solapas={SOLAPAS.map((s) => ({
          href: `${s.ruta}?${parametros}`,
          etiqueta: s.etiqueta,
          cuenta: s.ruta === "/fiado" ? deben : undefined,
        }))}
      />
    </header>
  );
}
