import type { ReactNode } from "react";
import BarraPeriodo from "@/components/BarraPeriodo";
import Solapas from "@/components/Solapas";
import {
  leerFecha,
  leerPeriodo,
  resolverRango,
  type Rango,
} from "@/lib/periodo";

type Parametros = Record<string, string | string[] | undefined>;

/**
 * El rango que dice la URL, con "mes" como corte de arranque.
 *
 * Stock arranca en el mes y no en el día —que es el corte por defecto de
 * `leerPeriodo`— porque de un día de compras casi nunca hay nada, y una
 * pantalla que abre vacía se lee como una pantalla rota.
 */
export function rangoDeLaUrl(params: Parametros, porDefecto = "mes"): Rango {
  const leer = (clave: string) => {
    const valor = params[clave];
    return Array.isArray(valor) ? valor[0] : valor;
  };
  return resolverRango(
    leerPeriodo(leer("periodo") ?? porDefecto),
    leerFecha(leer("fecha")),
  );
}

/** Los parámetros del período, para que las solapas no te cambien de mes. */
export function colaDelPeriodo(rango: Rango): string {
  const cola = new URLSearchParams({ periodo: rango.periodo });
  if (rango.periodo !== "todo") cola.set("fecha", rango.fecha);
  return cola.toString();
}

export type SolapaStock = "catalogo" | "compras" | "cargar";

/**
 * La cabecera común de las tres solapas de Stock: el título, el período y las
 * solapas.
 *
 * Es una sola para las tres porque son una sección y se tienen que sentir una:
 * si cada página armara la suya, al cambiar de solapa se movería el título, el
 * selector de período y hasta el ancho de la planilla.
 */
export default function CabeceraStock({
  activa,
  rango,
  base,
  extra,
  pedidosAbiertos = 0,
  sinSelector = false,
  children,
}: {
  activa: SolapaStock;
  rango: Rango;
  /** la ruta de la página actual, para que el período navegue en ella */
  base: string;
  /** otros parámetros de la URL que hay que conservar al cambiar de período */
  extra?: Record<string, string | undefined>;
  /** cuántos pedidos esperan precios: va de globito en «Cargar compra» */
  pedidosAbiertos?: number;
  /**
   * Sin el selector de período: para las fichas (un proveedor, un día), donde
   * el corte de tiempo ya lo dice la ruta o la maneja la propia pantalla.
   */
  sinSelector?: boolean;
  /** lo que va a la derecha del selector: acciones de la solapa */
  children?: ReactNode;
}) {
  const cola = colaDelPeriodo(rango);
  const href = {
    catalogo: `/stock?${cola}`,
    compras: `/compras?${cola}`,
    cargar: `/reponer?${cola}`,
  } as const;

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-3xl leading-none">Stock</h1>
        <div className="flex flex-wrap items-center gap-3">
          {children}
          {!sinSelector && (
            <BarraPeriodo rango={rango} base={base} extra={extra} />
          )}
        </div>
      </div>

      <Solapas
        activa={href[activa]}
        solapas={[
          { href: href.catalogo, etiqueta: "Catálogo" },
          { href: href.compras, etiqueta: "Compras" },
          {
            href: href.cargar,
            etiqueta: "Cargar compra",
            cuenta: pedidosAbiertos,
          },
        ]}
      />
    </header>
  );
}
