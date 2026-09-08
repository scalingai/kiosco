"use client";

import {
  contenidoTotal,
  costoConIva,
  costoDeReferencia,
  formatearContenido,
  MARGEN_SUGERIDO_MILESIMAS,
  MILESIMAS,
  precioSugerido,
  renglonVacio,
  renglonesCargados,
  totalDelRenglon,
  type ModoPrecio,
  type RenglonBorrador,
} from "@/lib/negocio";
import SelectorNombre from "@/components/SelectorNombre";
import { normalizarNombre } from "@/lib/nombres";
import {
  centavosAPesos,
  formatearCentavos,
  parsearMonto,
} from "@/lib/plata";

type Producto = {
  id: string;
  nombre: string;
  /** lo que hoy dice la góndola; null si nunca se le puso precio */
  precioVentaCentavos: number | null;
  multiplicadorMilesimas: number | null;
};

type Cuentas = {
  total: number;
  costo: { centavos: number; porCada: string } | null;
  real: number | null;
  /** lo que la app propone cobrar, con el multiplicador que haya */
  sugerido: number | null;
  importeCentavos: number | null;
  /** en milésimas: el del renglón, el del producto, o el general */
  multiplicador: number;
  /** lo que ese producto costaba en la góndola hasta hoy */
  precioAnterior: number | null;
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

  /*
   * El último multiplicador tecleado en esta factura. Se lee de los renglones
   * y no de un estado aparte: así no hay dos verdades que puedan discrepar.
   */
  const ultimoUsado = (() => {
    for (let i = renglones.length - 1; i >= 0; i--) {
      const escrito = renglones[i].multiplicador.trim();
      if (!escrito) continue;
      const numero = Number(escrito.replace(",", "."));
      if (Number.isFinite(numero) && numero >= 1 && numero <= 10) {
        return Math.round(numero * MILESIMAS);
      }
    }
    return null;
  })();

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
    const producto = productoDe(renglon.descripcion);
    const multiplicador = multiplicadorDe(renglon, producto);
    return {
      total: contenidoTotal(cantidad, porBulto),
      costo,
      real,
      sugerido: real != null ? precioSugerido(real, multiplicador) : null,
      importeCentavos,
      multiplicador,
      precioAnterior: producto?.precioVentaCentavos ?? null,
    };
  }

  /** El producto del catálogo que corresponde a lo escrito, si existe. */
  function productoDe(nombre: string): Producto | null {
    const limpio = normalizarNombre(nombre);
    if (!limpio) return null;
    return (
      productos.find((p) => normalizarNombre(p.nombre) === limpio) ?? null
    );
  }

  /**
   * Con qué multiplicador trabajar, en orden: el que escribiste en el renglón,
   * el que ese producto tiene guardado, el último que usaste en esta misma
   * factura, y recién ahí el 1,4 de la casa.
   *
   * El "último usado" está porque una factura suele ser todo del mismo rubro:
   * si arrancaste poniendo 1,3 a las gaseosas, las diez siguientes también van
   * a 1,3 y no tiene sentido escribirlo diez veces.
   */
  function multiplicadorDe(
    renglon: RenglonBorrador,
    producto: Producto | null,
  ): number {
    if (renglon.multiplicador.trim()) {
      const numero = Number(renglon.multiplicador.trim().replace(",", "."));
      if (Number.isFinite(numero) && numero >= 1 && numero <= 10) {
        return Math.round(numero * MILESIMAS);
      }
    }
    if (producto?.multiplicadorMilesimas != null) {
      return producto.multiplicadorMilesimas;
    }
    return ultimoUsado ?? MARGEN_SUGERIDO_MILESIMAS;
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
      alCambiar={(texto) => {
        /*
         * Al elegir uno que ya existe se traen SU precio y SU multiplicador.
         * Es lo que hace que el renglón muestre "antes valía $2.900" en vez de
         * un campo en blanco: sin el precio viejo no hay con qué comparar.
         */
        const elegido = productoDe(texto);
        editar(i, {
          descripcion: texto,
          ...(elegido?.precioVentaCentavos != null
            ? { precioVenta: String(centavosAPesos(elegido.precioVentaCentavos)) }
            : {}),
          ...(elegido?.multiplicadorMilesimas != null
            ? {
                multiplicador: String(
                  elegido.multiplicadorMilesimas / MILESIMAS,
                ).replace(".", ","),
              }
            : {}),
        });
      }}
      opciones={productos}
      queEs="Producto"
      placeholder="producto"
      etiquetaAria="Producto"
    />
  );

  const campoMultiplicador = (i: number, c: Cuentas) => (
    <input
      value={renglones[i].multiplicador}
      inputMode="decimal"
      aria-label="Multiplicador del margen"
      placeholder={String(c.multiplicador / MILESIMAS).replace(".", ",")}
      onChange={(e) => editar(i, { multiplicador: e.target.value })}
      className={CAMPO + " cifra w-full text-center"}
    />
  );

  const campoPrecioVenta = (i: number, c: Cuentas) => (
    <input
      value={renglones[i].precioVenta}
      inputMode="decimal"
      aria-label="A cuánto lo vendés"
      /*
       * Primero lo que sugiere el costo de HOY, y si todavía no cargaste el
       * importe, lo que ese producto vale hoy en la góndola. Un "—" no dice
       * nada: el precio anterior es el punto de partida real, porque la mayoría
       * de las veces no se toca.
       */
      placeholder={
        c.sugerido != null
          ? String(centavosAPesos(c.sugerido))
          : c.precioAnterior != null
            ? String(centavosAPesos(c.precioAnterior))
            : "—"
      }
      onChange={(e) => editar(i, { precioVenta: e.target.value })}
      className={CAMPO + " cifra w-full text-right"}
    />
  );

  /**
   * Qué cambia respecto de lo que ese producto valía hasta hoy.
   *
   * Es el aviso que pidió Agus: el precio de venta puede cambiar entre una
   * compra y la otra, y si nadie lo dice se cambia sin querer. Muestra la
   * diferencia contra la góndola, no contra el sugerido.
   */
  const avisoDeCambio = (i: number, c: Cuentas) => {
    const escrito = renglones[i].precioVenta.trim();
    if (!escrito || c.precioAnterior == null) return null;
    const nuevo = parsearMonto(escrito);
    if (nuevo == null || nuevo === c.precioAnterior) return null;

    const diferencia = nuevo - c.precioAnterior;
    const porciento = Math.round((diferencia / c.precioAnterior) * 100);
    return (
      <span className="block text-right text-xs text-deuda">
        antes {formatearCentavos(c.precioAnterior)} ({diferencia > 0 ? "+" : "−"}
        {Math.abs(porciento)}%)
      </span>
    );
  };

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

  /**
   * Cuánto sale UNA unidad. El "a cuánto venderlo" ya no vive acá: pasó a ser
   * un campo editable, porque el precio se decide en este momento y mirarlo
   * sin poder tocarlo obligaba a ir a otra pantalla.
   */
  const columnaCosto = (c: Cuentas, renglon: RenglonBorrador) => {
    if (!c.costo || c.real == null) {
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
        <span className="cifra block text-sm">{formatearCentavos(c.real)}</span>
      </span>
    );
  };

  const encabezado = "px-1 pb-1 text-left text-xs font-normal text-tinta-suave";

  return (
    <div>
      {/* Sin rótulo: los encabezados de la tabla ya dicen qué es cada cosa, y
          "Qué trajo" encima de una columna que dice "Producto" era ruido. */}
      <div className="flex items-baseline justify-end">
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
            <th className={encabezado + " w-24"}>Precio</th>
            <th className={encabezado + " w-24 text-right"}>Importe</th>
            <th className={encabezado + " w-24 text-right"}>
              {enBlanco ? "Costo c/IVA" : "Costo"}
            </th>
            <th className={encabezado + " w-14 text-center"}>×</th>
            <th className={encabezado + " w-28 text-right"}>Venta</th>
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
                  {columnaCosto(c, renglon)}
                </td>
                <td className="p-1">
                  {campoMultiplicador(i, c)}
                </td>
                <td className="p-1">
                  {campoPrecioVenta(i, c)}
                  {avisoDeCambio(i, c)}
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

              {/* El precio se decide con la mercadería en la mano, así que en
                  el celular también tiene que estar acá y no en otra pantalla. */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="shrink-0 text-xs text-tinta-suave">×</span>
                <span className="w-16 shrink-0">{campoMultiplicador(i, c)}</span>
                <span className="shrink-0 text-xs text-tinta-suave">vendo a</span>
                <span className="min-w-0 flex-1">{campoPrecioVenta(i, c)}</span>
              </div>
              {avisoDeCambio(i, c)}

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
              {enBlanco && c.real != null && c.costo && (
                <p className="text-xs text-tinta-suave">
                  {"con IVA "}
                  <span className="cifra text-tinta">
                    {formatearCentavos(c.real)}
                  </span>{" "}
                  {c.costo.porCada}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Se toca una vez por renglón de la factura, así que es un botón de
          verdad y no un link de 12px: en el mostrador se aprieta con el pulgar
          y con una caja en la otra mano. */}
      <button
        type="button"
        onClick={() => onCambio([...renglones, renglonVacio()])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-linea bg-white px-3.5 py-2 text-sm text-acento transition-colors hover:border-acento hover:bg-papel-hondo"
      >
        <span aria-hidden className="text-base leading-none">
          +
        </span>
        otro producto
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
