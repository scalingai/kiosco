"use client";

import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarEnBlancoDelPedido,
  guardarRenglonDePedido,
  sacarRenglonDePedido,
  traerLoDeSiempre,
} from "@/app/acciones";
import SelectorNombre from "@/components/SelectorNombre";
import { formatearCentavos, parsearMonto } from "@/lib/plata";
import type { PedidoDeReposicion, RenglonDePedido } from "@/lib/reposicion";

/**
 * La planilla del pedido: una fila por renglón, las cuentas a la derecha.
 *
 * Todo lo que se calcula —costo por unidad, sugerido, margen— lo hace el
 * SERVIDOR al leer (`leerPedido`). Acá no se recalcula nada: la pantalla
 * escribe el dato crudo y vuelve a pedir la fila. Un segundo juego de
 * fórmulas en el cliente es exactamente cómo terminan dos números distintos
 * para la misma cosa según dónde se mire.
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

  // Mientras el servidor contesta, la fila ya se ve apagada en vez de quieta.
  const [sacados, marcarSacado] = useOptimistic<string[], string>(
    [],
    (previo, id) => [...previo, id],
  );

  const enPedido = new Set(pedido.renglones.map((r) => r.productoId));
  const disponibles = productos.filter((p) => !enPedido.has(p.id));

  function guardar(
    productoId: string,
    datos: Parameters<typeof guardarRenglonDePedido>[2],
  ) {
    empezar(async () => {
      const r = await guardarRenglonDePedido(pedido.id, productoId, datos);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <ul className="space-y-2">
          {pedido.renglones.map((r) => (
            <Fila
              key={r.id}
              renglon={r}
              apagada={sacados.includes(r.id)}
              ocupado={guardando}
              onGuardar={(datos) => guardar(r.productoId, datos)}
              onSacar={() =>
                empezar(async () => {
                  marcarSacado(r.id);
                  await sacarRenglonDePedido(r.id);
                  router.refresh();
                })
              }
            />
          ))}
        </ul>
      )}

      {/* Agregar algo que no estaba en la última compra. */}
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
            guardar(id, { cantidad: 1, unidadesPorBulto: 1 });
            setNombreNuevo("");
          }}
        />
      </div>

      {error && <p className="mt-3 text-sm text-deuda">{error}</p>}

      {/* El total, pegado abajo: es el número con el que se decide. */}
      <div className="sticky bottom-0 z-10 mt-4 -mx-4 border-t border-linea bg-tarjeta/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">
            Lo que sale el pedido
          </span>
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {formatearCentavos(pedido.totalCentavos)}
          </span>
        </div>
        {pedido.sinPrecio > 0 && (
          <p className="mt-1 text-xs text-alerta">
            {pedido.sinPrecio}{" "}
            {pedido.sinPrecio === 1 ? "renglón" : "renglones"} sin precio
            todavía: ese total está incompleto.
          </p>
        )}
      </div>
    </>
  );
}

function Fila({
  renglon: r,
  apagada,
  ocupado,
  onGuardar,
  onSacar,
}: {
  renglon: RenglonDePedido;
  apagada: boolean;
  ocupado: boolean;
  onGuardar: (datos: {
    cantidad?: number;
    unidadesPorBulto?: number;
    importeBultoCentavos?: number | null;
  }) => void;
  onSacar: () => void;
}) {
  const importe = useRef<HTMLInputElement>(null);

  const subio =
    r.importeBultoAnteriorCentavos != null &&
    r.importeBultoCentavos != null &&
    r.importeBultoCentavos > r.importeBultoAnteriorCentavos;

  return (
    <li
      className={`rounded-xl border border-linea bg-tarjeta p-3 ${apagada ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium leading-snug">{r.nombre}</span>
          {r.importeBultoAnteriorCentavos != null && (
            <span className="block text-[11px] text-tinta-suave">
              la vez pasada el bulto salía{" "}
              {formatearCentavos(r.importeBultoAnteriorCentavos)}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onSacar}
          disabled={ocupado}
          aria-label={`Sacar ${r.nombre} del pedido`}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-papel-hondo"
        >
          Sacar
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Campo
          etiqueta="Bultos"
          defecto={String(r.cantidad)}
          onListo={(v) => onGuardar({ cantidad: Number(v) || 1, unidadesPorBulto: r.unidadesPorBulto, importeBultoCentavos: r.importeBultoCentavos })}
          ocupado={ocupado}
        />
        <Campo
          etiqueta="Un/bulto"
          defecto={String(r.unidadesPorBulto)}
          onListo={(v) => onGuardar({ cantidad: r.cantidad, unidadesPorBulto: Number(v) || 1, importeBultoCentavos: r.importeBultoCentavos })}
          ocupado={ocupado}
        />
        <span className="flex flex-col gap-0.5">
          <label
            htmlFor={`imp-${r.id}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-tinta-suave"
          >
            $ por bulto
          </label>
          <input
            id={`imp-${r.id}`}
            ref={importe}
            type="text"
            inputMode="decimal"
            disabled={ocupado}
            defaultValue={
              r.importeBultoCentavos == null
                ? ""
                : String(r.importeBultoCentavos / 100)
            }
            placeholder="—"
            onBlur={(e) => {
              const texto = e.target.value.trim();
              const centavos = texto ? parsearMonto(texto) : null;
              onGuardar({
                cantidad: r.cantidad,
                unidadesPorBulto: r.unidadesPorBulto,
                importeBultoCentavos: centavos,
              });
            }}
            className="w-28 rounded-lg border border-linea bg-papel px-2.5 py-2 font-mono text-sm tabular-nums"
          />
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {r.totalCentavos == null ? (
          <span className="rounded-md border border-dashed border-linea px-2 py-1 text-tinta-suave">
            {r.cantidad * r.unidadesPorBulto} unidades · falta el precio
          </span>
        ) : (
          <>
            <span className="rounded-md bg-papel-hondo px-2 py-1 font-medium">
              Renglón{" "}
              <b className="tabular-nums">
                {formatearCentavos(r.totalCentavos)}
              </b>
              {subio && <span className="ml-1 text-alerta">▲</span>}
            </span>
            <span className="rounded-md bg-papel-hondo px-2 py-1 font-medium">
              {r.cantidad * r.unidadesPorBulto} un · costo{" "}
              <b className="tabular-nums">
                {formatearCentavos(r.costoUnitarioCentavos ?? 0)}
              </b>
            </span>
            <span className="rounded-md bg-acento-tenue px-2 py-1 font-semibold text-acento">
              Vender a{" "}
              <b className="tabular-nums">
                {formatearCentavos(r.sugeridoCentavos ?? 0)}
              </b>
            </span>
            {r.precioVentaCentavos != null && (
              <span
                className={`rounded-md px-2 py-1 font-medium ${
                  (r.margenRealPorciento ?? 0) < 15
                    ? "bg-deuda-tenue text-deuda"
                    : "bg-papel-hondo"
                }`}
              >
                hoy {formatearCentavos(r.precioVentaCentavos)} ·{" "}
                <b>{r.margenRealPorciento}%</b>
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Un número chico que se guarda al salir del campo. */
function Campo({
  etiqueta,
  defecto,
  onListo,
  ocupado,
}: {
  etiqueta: string;
  defecto: string;
  onListo: (valor: string) => void;
  ocupado: boolean;
}) {
  // `useId` y no un random: el id tiene que ser el mismo en el servidor y en
  // el navegador, si no React se queja de que el HTML no coincide.
  const id = useId();
  return (
    <span className="flex flex-col gap-0.5">
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-wider text-tinta-suave"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        disabled={ocupado}
        defaultValue={defecto}
        onBlur={(e) => {
          if (e.target.value !== defecto) onListo(e.target.value);
        }}
        className="w-20 rounded-lg border border-linea bg-papel px-2.5 py-2 font-mono text-sm tabular-nums"
      />
    </span>
  );
}
