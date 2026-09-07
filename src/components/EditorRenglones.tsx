"use client";

import {
  contenidoTotal,
  costoDeReferencia,
  ETIQUETA_UNIDAD,
  formatearContenido,
  renglonVacio,
  renglonesCargados,
  UNIDADES,
  type RenglonBorrador,
  type Unidad,
} from "@/lib/negocio";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos, parsearMonto } from "@/lib/plata";

type Producto = { id: string; nombre: string };

/**
 * Los renglones de la factura del proveedor.
 *
 * Se carga lo que dice el papel —cuántos bultos, cuánto trae cada uno y cuánta
 * plata— y abajo aparece a cuánto sale la unidad, el kilo o el litro. Ese
 * número no se tipea ni se guarda: es la división, y se muestra en vivo porque
 * es lo que se mira para decidir a cuánto vender.
 */
export default function EditorRenglones({
  renglones,
  onCambio,
  productos,
}: {
  renglones: RenglonBorrador[];
  onCambio: (renglones: RenglonBorrador[]) => void;
  /** los que ya existen, para no crear "coca cola" al lado de "Coca-Cola" */
  productos: Producto[];
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
      total: contenidoTotal(cantidad, porBulto),
      costo: costoDeReferencia({
        cantidad,
        unidadesPorBulto: porBulto,
        unidad: renglon.unidad,
        importeCentavos,
      }),
      importeCentavos,
    };
  }

  /**
   * Si el nombre tipeado todavía no existe, se avisa. No frena nada —hay que
   * poder comprar algo por primera vez— pero es lo que evita terminar con el
   * mismo producto escrito de tres formas.
   */
  function esNuevo(nombre: string): boolean {
    const limpio = normalizarNombre(nombre);
    if (!limpio) return false;
    return !productos.some((p) => normalizarNombre(p.nombre) === limpio);
  }

  const cargados = renglonesCargados(renglones);
  const suma = cargados.reduce(
    (total, r) => total + (cuentas(r).importeCentavos ?? 0),
    0,
  );
  const sinImporte = cargados.filter((r) => !r.importe.trim()).length;

  const campo =
    "rounded-lg border border-linea bg-white px-2 py-2 text-center text-sm";

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
          const { total, costo } = cuentas(renglon);
          const nuevo = esNuevo(renglon.descripcion);
          return (
            <li
              key={i}
              className="rounded-xl border border-linea bg-white/70 px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <input
                    value={renglon.descripcion}
                    list="lista-productos"
                    placeholder="producto"
                    aria-label="Producto"
                    onChange={(e) => editar(i, { descripcion: e.target.value })}
                    className="w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                  />
                  {nuevo && (
                    <span className="mt-1 block text-xs text-tinta-suave">
                      Es nuevo: se va a agregar al stock. Si ya lo tenías, elegilo
                      de la lista para no duplicarlo.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => sacar(i)}
                  aria-label="Sacar este renglón"
                  className="shrink-0 self-start rounded-lg px-1.5 py-2 text-lg leading-none text-tinta-suave"
                >
                  ×
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                  aria-label="Cuánto trae cada bulto"
                  onChange={(e) =>
                    editar(i, { unidadesPorBulto: e.target.value })
                  }
                  className={campo + " cifra w-16 shrink-0"}
                />
                <select
                  value={renglon.unidad}
                  aria-label="Unidad de medida"
                  onChange={(e) =>
                    editar(i, { unidad: e.target.value as Unidad })
                  }
                  className="shrink-0 rounded-lg border border-linea bg-white px-2 py-2 text-sm"
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {ETIQUETA_UNIDAD[u]}
                    </option>
                  ))}
                </select>
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
                {formatearContenido(total, renglon.unidad)}
                {costo ? (
                  <>
                    {" · "}
                    <span className="cifra text-tinta">
                      {formatearCentavos(costo.centavos)}
                    </span>{" "}
                    {costo.porCada}
                  </>
                ) : (
                  " · poné el importe y te digo a cuánto sale"
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

      <datalist id="lista-productos">
        {productos.map((p) => (
          <option key={p.id} value={p.nombre} />
        ))}
      </datalist>
    </div>
  );
}
