"use client";

import { ETIQUETA_MEDIO, MEDIOS, type MedioPago } from "@/lib/negocio";
import { centavosAPesos, formatearCentavos, parsearMonto } from "@/lib/plata";

export type MontosPorMedio = Record<MedioPago, string>;

export function montosVacios(): MontosPorMedio {
  return { efectivo: "", mercadopago: "", banco: "" };
}

/** Lo escrito en un medio, en centavos. Vacío o ilegible es cero. */
export function montoDe(montos: MontosPorMedio, medio: MedioPago): number {
  const escrito = montos[medio].trim();
  if (!escrito) return 0;
  return parsearMonto(escrito) ?? 0;
}

/** Lo repartido en total. */
export function sumarMontos(montos: MontosPorMedio): number {
  return MEDIOS.reduce((total, medio) => total + montoDe(montos, medio), 0);
}

/** Los medios que tienen plata puesta. */
export function mediosUsados(montos: MontosPorMedio): MedioPago[] {
  return MEDIOS.filter((medio) => montoDe(montos, medio) > 0);
}

/**
 * Con qué se le pagó al proveedor.
 *
 * Tres campos, uno por caja, siempre a la vista. El botón "total" de cada uno
 * mete ahí lo que falte repartir: pagar todo en efectivo es un click, igual que
 * cuando esto era un selector de una sola opción.
 *
 * No hay modo simple y modo dividido. Los tuvo un rato y estaba de más: obligaba
 * a declarar de antemano cuántos medios ibas a usar, que es algo que se sabe
 * recién cuando terminás de contar la plata.
 *
 * La suma tiene que dar el total de la compra. Se dice acá abajo, mientras se
 * escribe, y no en un error después de apretar guardar.
 */
export default function RepartoDePago({
  montos,
  alCambiar,
  totalCentavos,
}: {
  montos: MontosPorMedio;
  alCambiar: (montos: MontosPorMedio) => void;
  /** el total de la compra, para saber cuánto falta repartir */
  totalCentavos: number;
}) {
  const repartido = sumarMontos(montos);
  const falta = totalCentavos - repartido;
  const usados = mediosUsados(montos);

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {MEDIOS.map((medio) => (
          <label key={medio} className="block">
            <span className="text-xs text-tinta-suave">
              {ETIQUETA_MEDIO[medio]}
            </span>
            <div className="mt-1 flex items-stretch gap-1">
              <input
                value={montos[medio]}
                inputMode="decimal"
                placeholder="0"
                aria-label={"Cuánto por " + ETIQUETA_MEDIO[medio]}
                onChange={(e) =>
                  alCambiar({ ...montos, [medio]: e.target.value })
                }
                className="cifra min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
              />
              {/* Mete lo que falta, no el total de la compra: si ya pusiste
                  algo en otra caja, el botón completa en vez de pisar. */}
              <button
                type="button"
                disabled={falta <= 0}
                onClick={() =>
                  alCambiar({
                    ...montos,
                    [medio]: String(
                      centavosAPesos(montoDe(montos, medio) + falta),
                    ),
                  })
                }
                className="shrink-0 rounded-lg border border-linea px-2.5 text-xs text-acento disabled:opacity-35"
              >
                total
              </button>
            </div>
          </label>
        ))}
      </div>

      <p className="mt-2 text-xs">
        {totalCentavos <= 0 ? (
          <span className="text-tinta-suave">
            Poné los importes de la compra y repartí acá con qué la pagaste.
          </span>
        ) : falta === 0 ? (
          <span className="text-pago">
            {usados.length > 1
              ? `Repartido entre ${usados.length}: ${formatearCentavos(totalCentavos)}.`
              : `Todo por ${ETIQUETA_MEDIO[usados[0]].toLowerCase()}.`}
          </span>
        ) : falta > 0 ? (
          <span className="text-tinta-suave">
            Falta repartir{" "}
            <span className="cifra">{formatearCentavos(falta)}</span> de{" "}
            {formatearCentavos(totalCentavos)}. Sin repartir nada, se anota todo
            en efectivo.
          </span>
        ) : (
          <span className="text-deuda">
            Te pasaste <span className="cifra">{formatearCentavos(-falta)}</span>
            .
          </span>
        )}
      </p>
    </div>
  );
}
