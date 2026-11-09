"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarEnBlancoDelPedido,
  editarProducto,
  guardarRenglonDePedido,
  sacarRenglonDePedido,
  traerLoDeSiempre,
} from "@/app/acciones";
import SelectorNombre from "@/components/SelectorNombre";
import { formatearCentavos, parsearMonto } from "@/lib/plata";
import type { PedidoDeReposicion, RenglonDePedido } from "@/lib/reposicion";

/**
 * La planilla del pedido, en tabla.
 *
 * Es una planilla y se usa como tal: el proveedor canta precios uno atrás de
 * otro y hay que ir anotando sin levantar la vista.
 *
 * La tabla ocupa EXACTAMENTE el ancho de la hoja y no scrollea adentro. Tuvo
 * un `min-w` y estaba mal: una planilla que hay que arrastrar para ver el
 * margen no sirve, porque el margen es justo para lo que uno la mira. Cuando
 * no entra, no se achican todas las columnas hasta volverlas ilegibles — se
 * esconden las dos que se pueden rehacer de cabeza (un/bulto y costo por
 * unidad) y las que deciden quedan siempre.
 *
 * Todo lo calculado —costo por unidad, sugerido, margen— lo hace el SERVIDOR
 * al leer (`leerPedido`). Acá no se recalcula nada: la pantalla escribe el
 * dato crudo y vuelve a pedir la fila. Un segundo juego de fórmulas en el
 * cliente es cómo terminan dos números distintos para la misma cosa según
 * dónde se mire.
 */
export default function PlanillaPedido({
  pedido,
  productos,
}: {
  pedido: PedidoDeReposicion;
  productos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const enPedido = new Set(pedido.renglones.map((r) => r.productoId));
  const disponibles = productos.filter((p) => !enPedido.has(p.id));

  function guardarRenglon(
    r: RenglonDePedido,
    cambio: Partial<{
      cantidad: number;
      unidadesPorBulto: number;
      importeBultoCentavos: number | null;
    }>,
  ) {
    empezar(async () => {
      const res = await guardarRenglonDePedido(pedido.id, r.productoId, {
        cantidad: r.cantidad,
        unidadesPorBulto: r.unidadesPorBulto,
        importeBultoCentavos: r.importeBultoCentavos,
        ...cambio,
      });
      if (!res.ok) return setError(res.error);
      setError(null);
      router.refresh();
    });
  }

  /**
   * El precio de venta se guarda en el PRODUCTO, no en el pedido.
   *
   * Está acá porque éste es el único momento en que se tiene el costo nuevo a
   * la vista: decidir el precio en otra pantalla obliga a acordarse del número
   * o a ir y volver. De los productos que el kiosco ya compró, la mayoría no
   * tiene precio cargado — y sin precio no se pueden vender ni salen en la
   * tienda.
   */
  function guardarPrecio(productoId: string, centavos: number | null) {
    empezar(async () => {
      const res = await editarProducto(productoId, {
        precioVentaCentavos: centavos,
      });
      if (!res.ok) return setError(res.error);
      setError(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={pedido.enBlanco}
            disabled={guardando}
            onChange={(e) => {
              const valor = e.target.checked;
              empezar(async () => {
                await cambiarEnBlancoDelPedido(pedido.id, valor);
                router.refresh();
              });
            }}
            className="h-4 w-4"
          />
          En blanco
          <span className="text-xs font-normal text-tinta-suave">
            el costo real es el importe +21%
          </span>
        </label>

        {pedido.renglones.length === 0 && (
          <button
            type="button"
            disabled={guardando}
            onClick={() =>
              empezar(async () => {
                const r = await traerLoDeSiempre(pedido.id);
                if (!r.ok) return setError(r.error);
                router.refresh();
              })
            }
            className="rounded-lg bg-acento px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Traer lo de siempre
          </button>
        )}
      </div>

      {pedido.renglones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linea p-6 text-center text-sm text-tinta-suave">
          El pedido está vacío. «Traer lo de siempre» lo arranca con lo que ya
          le compraste a este proveedor, o agregá productos abajo.
        </p>
      ) : (
        <div className="rounded-xl border border-linea bg-tarjeta">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-[10px] uppercase tracking-wider text-tinta-suave">
                {/* Los anchos suman 100 en cada corte. Si no, la última
                    columna queda pegada al borde. */}
                <th className="w-[24%] px-3 py-2 text-left font-semibold escritorio:w-[19%]">
                  Producto
                </th>
                <th className="w-[10%] px-1.5 py-2 text-right font-semibold">
                  Bultos
                </th>
                <th className="hidden px-1.5 py-2 text-right font-semibold escritorio:table-cell escritorio:w-[9%]">
                  Un/bulto
                </th>
                <th className="w-[13%] px-1.5 py-2 text-right font-semibold escritorio:w-[11%]">
                  $ bulto
                </th>
                <th className="w-[13%] px-1.5 py-2 text-right font-semibold escritorio:w-[11%]">
                  Renglón
                </th>
                <th className="hidden px-1.5 py-2 text-right font-semibold escritorio:table-cell escritorio:w-[10%]">
                  Costo/un
                </th>
                <th className="w-[13%] px-1.5 py-2 text-right font-semibold escritorio:w-[10%]">
                  Sugerido
                </th>
                <th className="w-[14%] px-1.5 py-2 text-right font-semibold escritorio:w-[11%]">
                  Precio
                </th>
                <th className="w-[9%] px-1.5 py-2 text-right font-semibold escritorio:w-[6%]">
                  Margen
                </th>
                <th className="w-[4%] px-1.5 py-2 escritorio:w-[3%]" />
              </tr>
            </thead>
            <tbody>
              {pedido.renglones.map((r) => (
                <Fila
                  key={r.id}
                  r={r}
                  ocupado={guardando}
                  onRenglon={(c) => guardarRenglon(r, c)}
                  onPrecio={(c) => guardarPrecio(r.productoId, c)}
                  onSacar={() =>
                    empezar(async () => {
                      await sacarRenglonDePedido(r.id);
                      router.refresh();
                    })
                  }
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-linea-fuerte font-semibold">
                {/* El colSpan cambia con las columnas que están escondidas. */}
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-xs uppercase tracking-wider text-tinta-suave escritorio:hidden"
                >
                  Lo que sale el pedido
                </td>
                <td
                  colSpan={4}
                  className="hidden px-3 py-2.5 text-xs uppercase tracking-wider text-tinta-suave escritorio:table-cell"
                >
                  Lo que sale el pedido
                </td>
                <td className="px-1.5 py-2.5 text-right font-mono text-base tabular-nums">
                  {formatearCentavos(pedido.totalCentavos)}
                </td>
                <td colSpan={3} className="escritorio:hidden" />
                <td colSpan={4} className="hidden escritorio:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pedido.sinPrecio > 0 && (
        <p className="mt-2 text-xs text-alerta">
          {pedido.sinPrecio} {pedido.sinPrecio === 1 ? "renglón" : "renglones"}{" "}
          sin precio todavía: ese total está incompleto.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-linea bg-tarjeta p-3">
        <SelectorNombre
          queEs="producto"
          valor={nombreNuevo}
          opciones={disponibles}
          placeholder="Sumar otro producto al pedido"
          etiquetaAria="Producto para agregar al pedido"
          permitirCrear={false}
          alCambiar={(texto, id) => {
            setNombreNuevo(texto);
            if (!id) return;
            empezar(async () => {
              const res = await guardarRenglonDePedido(pedido.id, id, {
                cantidad: 1,
                unidadesPorBulto: 1,
              });
              if (!res.ok) return setError(res.error);
              router.refresh();
            });
            setNombreNuevo("");
          }}
        />
      </div>

      {error && <p className="mt-3 text-sm text-deuda">{error}</p>}
    </>
  );
}

function Fila({
  r,
  ocupado,
  onRenglon,
  onPrecio,
  onSacar,
}: {
  r: RenglonDePedido;
  ocupado: boolean;
  onRenglon: (c: {
    cantidad?: number;
    unidadesPorBulto?: number;
    importeBultoCentavos?: number | null;
  }) => void;
  onPrecio: (centavos: number | null) => void;
  onSacar: () => void;
}) {
  const subio =
    r.importeBultoAnteriorCentavos != null &&
    r.importeBultoCentavos != null &&
    r.importeBultoCentavos > r.importeBultoAnteriorCentavos;

  const flojo = r.margenRealPorciento != null && r.margenRealPorciento < 15;

  return (
    <tr className="border-b border-linea last:border-0 hover:bg-papel-hondo/50">
      <td className="px-3 py-1.5 align-middle">
        <span className="block leading-tight">{r.nombre}</span>
        {r.importeBultoAnteriorCentavos != null && (
          <span className="block text-[10px] text-tinta-suave">
            antes {formatearCentavos(r.importeBultoAnteriorCentavos)}
          </span>
        )}
      </td>

      <Numero
        valor={r.cantidad}
        ocupado={ocupado}
        etiqueta={`Bultos de ${r.nombre}`}
        onListo={(v) => onRenglon({ cantidad: v })}
      />
      <Numero
        valor={r.unidadesPorBulto}
        ocupado={ocupado}
        etiqueta={`Unidades por bulto de ${r.nombre}`}
        soloEnGrande
        onListo={(v) => onRenglon({ unidadesPorBulto: v })}
      />

      <Plata
        centavos={r.importeBultoCentavos}
        ocupado={ocupado}
        etiqueta={`Precio por bulto de ${r.nombre}`}
        onListo={(c) => onRenglon({ importeBultoCentavos: c })}
      />

      <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">
        {r.totalCentavos == null ? (
          <span className="text-falta">—</span>
        ) : (
          <>
            {formatearCentavos(r.totalCentavos)}
            {subio && <span className="ml-0.5 text-alerta">▲</span>}
          </>
        )}
      </td>

      <td className="hidden px-1.5 py-1.5 text-right font-mono tabular-nums text-tinta-suave escritorio:table-cell">
        {r.costoUnitarioCentavos == null
          ? "—"
          : formatearCentavos(r.costoUnitarioCentavos)}
      </td>

      {/* El sugerido se aplica con un toque: es el 90% de los casos. */}
      <td className="px-1.5 py-1.5 text-right">
        {r.sugeridoCentavos == null ? (
          <span className="text-falta">—</span>
        ) : (
          <button
            type="button"
            disabled={ocupado || r.precioVentaCentavos === r.sugeridoCentavos}
            onClick={() => onPrecio(r.sugeridoCentavos)}
            title="Poner este precio de venta"
            className="w-full rounded-md bg-acento-tenue px-1 py-1 font-mono text-xs font-semibold tabular-nums text-acento enabled:hover:brightness-95 disabled:opacity-50"
          >
            {formatearCentavos(r.sugeridoCentavos)}
          </button>
        )}
      </td>

      <Plata
        centavos={r.precioVentaCentavos}
        ocupado={ocupado}
        etiqueta={`Precio de venta de ${r.nombre}`}
        resaltado
        onListo={onPrecio}
      />

      <td
        className={`px-1.5 py-1.5 text-right font-mono tabular-nums ${
          flojo ? "font-semibold text-deuda" : "text-tinta-suave"
        }`}
      >
        {r.margenRealPorciento == null ? "—" : `${r.margenRealPorciento}%`}
      </td>

      <td className="px-1.5 py-1.5 text-right">
        <button
          type="button"
          onClick={onSacar}
          disabled={ocupado}
          aria-label={`Sacar ${r.nombre} del pedido`}
          className="rounded px-1 py-0.5 text-tinta-suave hover:bg-linea"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

/** Una celda con un número entero chico. */
function Numero({
  valor,
  ocupado,
  etiqueta,
  soloEnGrande,
  onListo,
}: {
  valor: number;
  ocupado: boolean;
  etiqueta: string;
  soloEnGrande?: boolean;
  onListo: (v: number) => void;
}) {
  return (
    <td
      className={`px-1.5 py-1.5 text-right ${soloEnGrande ? "hidden escritorio:table-cell" : ""}`}
    >
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        disabled={ocupado}
        defaultValue={valor}
        aria-label={etiqueta}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 1 && n !== valor) onListo(n);
        }}
        className="w-full rounded-md border border-linea bg-papel px-1.5 py-1 text-right font-mono tabular-nums"
      />
    </td>
  );
}

/**
 * Una celda con plata.
 *
 * Guarda al salir del campo Y con Enter. Lo segundo no es un lujo: con el
 * proveedor cantando precios uno atrás de otro, Enter es lo que sale solo, y
 * si sólo guardara al salir, el último precio tecleado se perdería al cerrar
 * la pantalla sin que nada avise.
 */
function Plata({
  centavos,
  ocupado,
  etiqueta,
  resaltado,
  onListo,
}: {
  centavos: number | null;
  ocupado: boolean;
  etiqueta: string;
  resaltado?: boolean;
  onListo: (centavos: number | null) => void;
}) {
  return (
    <td className="px-1.5 py-1.5 text-right">
      <input
        type="text"
        inputMode="decimal"
        disabled={ocupado}
        defaultValue={centavos == null ? "" : String(centavos / 100)}
        placeholder="—"
        aria-label={etiqueta}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const texto = e.target.value.trim();
          const nuevo = texto ? parsearMonto(texto) : null;
          if (nuevo !== centavos) onListo(nuevo);
        }}
        className={`w-full rounded-md border px-1.5 py-1 text-right font-mono tabular-nums ${
          resaltado
            ? "border-acento/40 bg-acento-tenue/40 font-semibold"
            : "border-linea bg-papel"
        }`}
      />
    </td>
  );
}
