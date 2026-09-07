"use client";

import {
  contarSinImporte,
  costoPorUnidad,
  renglonVacio,
  renglonesCargados,
  unidadesTotales,
  type RenglonBorrador,
} from "@/lib/negocio";
import { formatearCentavos, parsearMonto } from "@/lib/plata";

/**
 * Los renglones de la factura del proveedor.
 *
 * Se carga lo que dice el papel —cuántos bultos, qué trae cada uno, cuánta
 * plata— y abajo aparece lo que salió cada unidad. Ese número no se tipea ni se
 * guarda: es la división, y se muestra en vivo porque es lo que se mira para
 * decidir a cuánto vender.
 */
export default function EditorRenglones({
  renglones,
  onCambio,
}: {
  renglones: RenglonBorrador[];
  onCambio: (renglones: RenglonBorrador[]) => void;
}) {
  function editar(indice: number, cambio: Partial<RenglonBorrador>) {
    onCambio(renglones.map((r, n) => (n === indice ? { ...r, ...cambio } : r)));
  }

  function sacar(indice: number) {
    const quedan = renglones.filter((_, n) => n !== indice);
    onCambio(quedan.length ? quedan : [renglonVacio()]);
  }

  /** Lo mismo que hace el servidor, pero con lo tipeado, para mostrarlo al vuelo. */
  function cuentas(renglon: RenglonBorrador) {
    const cantidad = Number(renglon.cantidad) || 1;
    const porBulto = Number(renglon.unidadesPorBulto) || 1;
    const importeCentavos = renglon.importe.trim()
      ? parsearMonto(renglon.importe)
      : null;
    return {
      unidades: unidadesTotales(cantidad, porBulto),
      porBulto,
      costo: costoPorUnidad({
        cantidad,
        unidadesPorBulto: porBulto,
        importeCentavos,
      }),
      importeCentavos,
    };
  }

  const cargados = renglonesCargados(renglones);
  const sinImporte = contarSinImporte(renglones);
  const suma = cargados.reduce(
    (total, r) => total + (cuentas(r).importeCentavos ?? 0),
    0,
  );

  const campo =
    "rounded-lg border border-linea bg-white px-2 py-2 text-sm text-center";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-tinta-suave">Qué trajo</span>
        {cargados.length > 0 && (
          <span className="cifra text-xs text-tinta-suave">
            {suma > 0 ? "suman " + formatearCentavos(suma) : "sin importes"}
          </span>
        )}
      </div>

      <ul className="mt-1 space-y-2">
        {renglones.map((renglon, i) => {
          const { unidades, porBulto, costo } = cuentas(renglon);
          return (
            <li
              key={i}
              className="rounded-xl border border-linea bg-white/70 px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <input
                  value={renglon.descripcion}
                  placeholder="producto"
                  aria-label="Producto"
                  onChange={(e) => editar(i, { descripcion: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => sacar(i)}
                  aria-label="Sacar este renglón"
                  className="shrink-0 rounded-lg px-1.5 py-2 text-lg leading-none text-tinta-suave"
                >
                  ×
                </button>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <input
                  value={renglon.cantidad}
                  inputMode="numeric"
                  aria-label="Cuántos bultos"
                  onChange={(e) => editar(i, { cantidad: e.target.value })}
                  className={campo + " cifra w-12 shrink-0"}
                />
                <span className="shrink-0 text-xs text-tinta-suave">×</span>
                <input
                  value={renglon.unidadesPorBulto}
                  inputMode="numeric"
                  aria-label="Unidades por bulto"
                  onChange={(e) =>
                    editar(i, { unidadesPorBulto: e.target.value })
                  }
                  className={campo + " cifra w-12 shrink-0"}
                />
                <span className="shrink-0 text-xs text-tinta-suave">u.</span>
                <input
                  value={renglon.importe}
                  inputMode="decimal"
                  placeholder="importe"
                  aria-label="Importe del renglón"
                  onChange={(e) => editar(i, { importe: e.target.value })}
                  className="cifra ml-auto w-28 shrink-0 rounded-lg border border-linea bg-white px-2 py-2 text-sm"
                />
              </div>

              {/* El número que se mira para poner el precio de venta. */}
              <p className="mt-1.5 text-xs text-tinta-suave">
                {costo != null ? (
                  <>
                    {unidades} unidad{unidades === 1 ? "" : "es"} ·{" "}
                    <span className="cifra text-tinta">
                      {formatearCentavos(costo)}
                    </span>{" "}
                    te sale cada una
                  </>
                ) : porBulto > 1 ? (
                  `${unidades} unidades. Poné el importe y te digo a cuánto te sale cada una.`
                ) : (
                  "Poné el importe y te digo a cuánto te sale cada una."
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onCambio([...renglones, renglonVacio()])}
        className="mt-2 text-xs text-acento underline underline-offset-4"
      >
        + otro renglón
      </button>

      {sinImporte > 0 && (
        <p className="mt-2 text-xs text-tinta-suave">
          {sinImporte === 1
            ? "1 renglón sin importe."
            : sinImporte + " renglones sin importe."}{" "}
          Si no ponés el total de la factura, no suman al costo.
        </p>
      )}
    </div>
  );
}
