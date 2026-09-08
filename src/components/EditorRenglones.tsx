"use client";

import {
  contenidoTotal,
  costoConIva,
  costoDeReferencia,
  formatearContenido,
  precioSugerido,
  renglonVacio,
  renglonesCargados,
  totalDelRenglon,
  type ModoPrecio,
  type RenglonBorrador,
} from "@/lib/negocio";
import SelectorNombre from "@/components/SelectorNombre";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos, parsearMonto } from "@/lib/plata";

type Producto = { id: string; nombre: string };

type Cuentas = {
  total: number;
  costo: { centavos: number; porCada: string } | null;
  real: number | null;
  sugerido: number | null;
  importeCentavos: number | null;
};

const CAMPO = "rounded-lg border border-linea bg-white px-2 py-2 text-sm";

/**
 * Los renglones de la factura del proveedor.
 *
 * La factura ES una tabla, así que en pantalla grande se carga como una tabla:
 * las columnas se leen de arriba abajo y los números quedan alineados, que es
 * como se controla contra el papel. En el celular no entra —seis columnas en
 * 375px no se pueden tocar— y ahí cada renglón se apila. Son los mismos campos.
 */
export default function EditorRenglones({
  renglones,
  onCambio,
  productos,
  enBlanco,
}: {
  renglones: RenglonBorrador[];
  onCambio: (renglones: RenglonBorrador[]) => void;
  /** los que ya existen, para no crear "coca cola" al lado de "Coca-Cola" */
  productos: Producto[];
  /** con factura el costo real es el importe por 1,21 */
  enBlanco: boolean;
}) {
  function editar(indice: number, cambio: Partial<RenglonBorrador>) {
    onCambio(renglones.map((r, n) => (n === indice ? { ...r, ...cambio } : r)));
  }

  function sacar(indice: number) {
    const quedan = renglones.filter((_, n) => n !== indice);
    onCambio(quedan.length ? quedan : [renglonVacio()]);
  }

  /** Lo mismo que hace el servidor, pero con lo tipeado, para mostrarlo al vuelo. */
  function cuentas(renglon: RenglonBorrador): Cuentas {
    const cantidad = Number(renglon.cantidad) || 1;
    const porBulto = Number(renglon.unidadesPorBulto) || 1;
    const escrito = renglon.importe.trim()
      ? parsearMonto(renglon.importe)
      : null;
    // Lo que se guarda es el total; si el precio vino por bulto, se multiplica.
    const importeCentavos = totalDelRenglon(escrito, cantidad, renglon.modo);
    const costo = costoDeReferencia({
      cantidad,
      unidadesPorBulto: porBulto,
      // Al proveedor se le compran unidades; los ml del envase son del producto.
      unidad: "un",
      importeCentavos,
    });
    // El costo de la factura no es lo que sale: en blanco hay que sumarle IVA.
    const real = costo ? costoConIva(costo.centavos, enBlanco) : null;
    return {
      total: contenidoTotal(cantidad, porBulto),
      costo,
      real,
      sugerido: real != null ? precioSugerido(real) : null,
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

  /*
   * Los campos se comparten entre la tabla y las tarjetas: un solo lugar donde
   * cambiarlos si mañana hay que agregar una columna.
   *
   * Son funciones que devuelven JSX y NO componentes. Un componente definido
   * adentro del render es un tipo nuevo en cada tecleo, así que React desmonta
   * el input y lo vuelve a montar: se pierde el foco letra por letra y no se
   * puede escribir nada.
   */

  const campoProducto = (i: number) => (
    <SelectorNombre
      valor={renglones[i].descripcion}
      alCambiar={(texto) => editar(i, { descripcion: texto })}
      opciones={productos}
      queEs="Producto"
      placeholder="producto"
      etiquetaAria="Producto"
    />
  );

  const campoBultos = (i: number) => (
    <input
      value={renglones[i].cantidad}
      inputMode="numeric"
      aria-label="Cuántos bultos"
      onChange={(e) => editar(i, { cantidad: e.target.value })}
      className={CAMPO + " cifra w-full text-center"}
    />
  );

  const campoPorBulto = (i: number) => (
    <input
      value={renglones[i].unidadesPorBulto}
      inputMode="numeric"
      aria-label="Cuánto trae cada bulto"
      onChange={(e) => editar(i, { unidadesPorBulto: e.target.value })}
      className={CAMPO + " cifra w-full text-center"}
    />
  );

  /**
   * Cómo leer el importe. Cuando el bulto trae 1 se dice "por unidad": es lo
   * mismo, pero "por bulto" al lado de un producto suelto se lee como un error.
   */
  const campoModo = (i: number) => (
    <select
      value={renglones[i].modo}
      aria-label="El importe es por bulto o el total"
      onChange={(e) => editar(i, { modo: e.target.value as ModoPrecio })}
      className={CAMPO + " w-full"}
    >
      <option value="bulto">
        {(Number(renglones[i].unidadesPorBulto) || 1) > 1
          ? "por bulto"
          : "por unidad"}
      </option>
      <option value="total">total</option>
    </select>
  );

  const campoImporte = (i: number) => (
    <input
      value={renglones[i].importe}
      inputMode="decimal"
      placeholder={renglones[i].modo === "bulto" ? "precio" : "total"}
      aria-label="Importe del renglón"
      onChange={(e) => editar(i, { importe: e.target.value })}
      className={CAMPO + " cifra w-full text-right"}
    />
  );

  const botonSacar = (i: number) => (
    <button
      type="button"
      onClick={() => sacar(i)}
      aria-label="Sacar este renglón"
      className="rounded-lg px-1.5 py-2 text-lg leading-none text-tinta-suave"
    >
      ×
    </button>
  );

  /** La columna que contesta la pregunta: cuánto sale y a cuánto venderlo. */
  const columnaSale = (c: Cuentas, renglon: RenglonBorrador) => {
    if (!c.costo || c.real == null || c.sugerido == null) {
      return <span className="text-xs text-tinta-suave">—</span>;
    }
    // Con el precio por bulto, el total del renglón es una multiplicación que
    // el proveedor ya hizo en su papel: mostrarlo es lo que deja controlarlo.
    const multiplica =
      renglon.modo === "bulto" &&
      (Number(renglon.cantidad) || 1) > 1 &&
      c.importeCentavos != null;
    return (
      <span className="block text-right">
        {multiplica && (
          <span className="cifra block text-xs text-tinta-suave">
            total {formatearCentavos(c.importeCentavos!)}
          </span>
        )}
        <span className="cifra block text-sm">
          {formatearCentavos(c.real)}
          <span className="text-xs font-normal text-tinta-suave">
            {" "}
            {c.costo.porCada}
          </span>
        </span>
        <span className="cifra block text-xs text-pago">
          vendé a {formatearCentavos(c.sugerido)}
        </span>
      </span>
    );
  };

  const encabezado = "px-1 pb-1 text-left text-xs font-normal text-tinta-suave";

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

      {/* ── Pantalla grande: la factura tal como está escrita ── */}
      <table className="mt-1 hidden w-full border-collapse sm:table">
        <thead>
          <tr>
            <th className={encabezado}>Producto</th>
            <th className={encabezado + " w-14 text-center"}>Bultos</th>
            <th className={encabezado + " w-16 text-center"}>Trae</th>
            <th className={encabezado + " w-28"}>Precio</th>
            <th className={encabezado + " w-28 text-right"}>Importe</th>
            <th className={encabezado + " w-36 text-right"}>
              {enBlanco ? "Sale con IVA" : "Sale"}
            </th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {renglones.map((renglon, i) => {
            const c = cuentas(renglon);
            const nuevo = esNuevo(renglon.descripcion);
            return (
              <tr key={i} className="align-top">
                <td className="p-1">
                  {campoProducto(i)}
                  {nuevo && (
                    <span className="mt-1 block text-xs text-tinta-suave">
                      Es nuevo: se agrega al stock.
                    </span>
                  )}
                </td>
                <td className="p-1">
                  {campoBultos(i)}
                </td>
                <td className="p-1">
                  {campoPorBulto(i)}
                </td>
                <td className="p-1">
                  {campoModo(i)}
                </td>
                <td className="p-1">
                  {campoImporte(i)}
                </td>
                <td className="p-1 pt-3">
                  {columnaSale(c, renglon)}
                </td>
                <td className="p-1 text-right">
                  {botonSacar(i)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Celular: los mismos campos, apilados ── */}
      <ul className="mt-1 space-y-2 sm:hidden">
        {renglones.map((renglon, i) => {
          const c = cuentas(renglon);
          const nuevo = esNuevo(renglon.descripcion);
          return (
            <li
              key={i}
              className="rounded-xl border border-linea bg-white/70 px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  {campoProducto(i)}
                  {nuevo && (
                    <span className="mt-1 block text-xs text-tinta-suave">
                      Es nuevo: se va a agregar al stock. Si ya lo tenías,
                      elegilo de la lista para no duplicarlo.
                    </span>
                  )}
                </span>
                <span className="shrink-0">
                  {botonSacar(i)}
                </span>
              </div>

              {/* En 375px los cinco campos en una fila no entran y el importe
                  se sale de la pantalla. Va en su propio renglón. */}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="w-12 shrink-0">{campoBultos(i)}</span>
                <span className="shrink-0 text-xs text-tinta-suave">×</span>
                <span className="w-16 shrink-0">{campoPorBulto(i)}</span>
                <span className="min-w-0 flex-1">{campoModo(i)}</span>
              </div>

              <div className="mt-1.5">{campoImporte(i)}</div>

              <p className="mt-1.5 text-xs text-tinta-suave">
                {formatearContenido(c.total, "un")}
                {c.costo && renglon.modo === "bulto" && c.importeCentavos != null && (Number(renglon.cantidad) || 1) > 1 && (
                  <>
                    {" · total "}
                    <span className="cifra">
                      {formatearCentavos(c.importeCentavos)}
                    </span>
                  </>
                )}
                {c.costo ? (
                  <>
                    {" · factura "}
                    <span className="cifra">
                      {formatearCentavos(c.costo.centavos)}
                    </span>{" "}
                    {c.costo.porCada}
                  </>
                ) : (
                  " · poné el importe y te digo a cuánto sale"
                )}
              </p>
              {c.real != null && c.sugerido != null && c.costo && (
                <p className="text-xs text-tinta-suave">
                  {enBlanco && (
                    <>
                      {"con IVA "}
                      <span className="cifra text-tinta">
                        {formatearCentavos(c.real)}
                      </span>
                      {" · "}
                    </>
                  )}
                  {"vendé a "}
                  <span className="cifra text-pago">
                    {formatearCentavos(c.sugerido)}
                  </span>{" "}
                  {c.costo.porCada}
                </p>
              )}
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
