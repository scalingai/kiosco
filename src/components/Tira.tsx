import Link from "next/link";
import type { ReactNode } from "react";

/**
 * La tira de cifras que va arriba de cada planilla.
 *
 * Es la respuesta corta a "cómo venimos", para que no haya que leer la tabla
 * para saberlo. Dos reglas que la hacen funcionar y que son las que se rompen
 * solas si cada página la arma a mano:
 *
 * - **Son cajas chicas y apretadas, no tarjetas.** Una tira de seis tarjetas
 *   con sombra y aire ocupa media pantalla y empuja la tabla abajo del pliegue,
 *   que es justo lo que uno vino a ver. Acá entran seis en una fila.
 * - **Una sola cifra es la grande.** Si todas gritan, ninguna se escucha: el
 *   resto son conteos chicos y hay UNA que es la plata del período.
 */

export type Dato = {
  etiqueta: string;
  valor: ReactNode;
  /** aclaración chica abajo */
  pie?: ReactNode;
  /** el color del número, cuando significa algo */
  tono?: "normal" | "pago" | "deuda" | "suave";
  /** si se puede hacer click, a dónde va */
  href?: string;
};

const TONO = {
  normal: "text-tinta",
  pago: "text-pago",
  deuda: "text-deuda",
  suave: "text-tinta-suave",
} as const;

export default function Tira({
  datos,
  destacado,
}: {
  datos: Dato[];
  /** la cifra grande de la derecha: la que de verdad importa del período */
  destacado?: { etiqueta: string; valor: ReactNode; pie?: ReactNode; tono?: Dato["tono"] };
}) {
  return (
    /*
     * En el celular se apila y la cifra grande va PRIMERA; en pantalla ancha
     * van lado a lado con la grande a la derecha.
     *
     * El orden invertido no es un capricho de maquetación. Acostado, el ojo
     * barre de izquierda a derecha y termina en la cifra grande; parado, lo
     * primero que ve es lo de arriba. Dejar el destacado al final en el celular
     * lo mandaba abajo de cinco recuadros, o sea a la cifra más importante a un
     * scroll de distancia.
     */
    <div className="flex flex-col items-stretch gap-2 sm:flex-row">
      <div className="order-2 grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-linea bg-tarjeta p-2 sm:order-1 sm:flex sm:flex-wrap sm:gap-2">
        {datos.map((d) => {
          const cuerpo = (
            <>
              <p className="text-[0.65rem] uppercase tracking-wider text-tinta-suave">
                {d.etiqueta}
              </p>
              <p
                className={
                  "cifra mt-0.5 text-lg font-medium leading-none " +
                  TONO[d.tono ?? "normal"]
                }
              >
                {d.valor}
              </p>
              {d.pie && (
                <p className="mt-0.5 text-[0.65rem] leading-tight text-tinta-suave">
                  {d.pie}
                </p>
              )}
            </>
          );

          const clases = "rounded-lg px-2.5 py-1.5 sm:min-w-24 sm:flex-1";

          return d.href ? (
            <Link
              key={d.etiqueta}
              href={d.href}
              className={clases + " transition-colors hover:bg-papel-hondo"}
            >
              {cuerpo}
            </Link>
          ) : (
            <div key={d.etiqueta} className={clases}>
              {cuerpo}
            </div>
          );
        })}
      </div>

      {destacado && (
        <div className="order-1 flex flex-col justify-center rounded-xl border border-linea bg-tarjeta px-4 py-2.5 sm:order-2 sm:min-w-56">
          <p className="text-[0.65rem] uppercase tracking-wider text-tinta-suave">
            {destacado.etiqueta}
          </p>
          <p
            className={
              "cifra mt-0.5 text-3xl font-medium leading-none " +
              TONO[destacado.tono ?? "pago"]
            }
          >
            {destacado.valor}
          </p>
          {destacado.pie && (
            <p className="mt-1 text-xs text-tinta-suave">{destacado.pie}</p>
          )}
        </div>
      )}
    </div>
  );
}
