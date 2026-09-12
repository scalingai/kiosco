"use client";

import { useState, useTransition } from "react";
import { editarProducto } from "@/app/acciones";
import type { CompraDelHistorial, RenglonDelHistorial } from "@/lib/compras";
import { fechaCorta } from "@/lib/fechas";
import { calcularMargen, costoConIva, formatearContenido, ETIQUETA_MEDIO, precioSugerido } from "@/lib/negocio";
import { formatearCentavos, parsearMonto } from "@/lib/plata";

export default function PreciosDeCompra({ compras }: { compras: CompraDelHistorial[] }) {
  const [seleccion, setSeleccion] = useState(compras[0]?.id ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [precios, setPrecios] = useState<Record<string, number | null>>({});
  const compra = compras.find(c => c.id === seleccion) ?? compras[0];
  if (!compra) return null;
  const precioDe = (r: RenglonDelHistorial) => r.productoId && r.productoId in precios ? precios[r.productoId] : r.precioVentaCentavos;
  const pendientes = compra.renglones.filter(r => precioDe(r) == null).length;
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filas = compra.renglones.filter(r => normalizar(r.descripcion ?? "").includes(normalizar(busqueda)) && (!soloPendientes || precioDe(r) == null));

  return (
    <section className="overflow-hidden rounded-2xl border border-linea bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-linea p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <label htmlFor="compra-precios" className="mb-2 block text-sm font-medium text-tinta-suave">Compra a revisar</label>
          <select id="compra-precios" value={compra.id} onChange={e => setSeleccion(e.target.value)} className="w-full max-w-lg rounded-lg border border-linea bg-papel px-3 py-2.5 text-sm font-semibold focus:outline-2 focus:outline-acento">
            {compras.map(c => <option key={c.id} value={c.id}>{fechaCorta(c.fecha)} — {c.comprobante || "Sin comprobante"}</option>)}
          </select>
          <p className="mt-2 text-xs text-tinta-suave">{compra.renglones.length} productos · {compra.pagadoEn ? `Pagada${compra.medio ? ` en ${ETIQUETA_MEDIO[compra.medio].toLowerCase()}` : ""}` : "Pendiente de pago"}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-tinta-suave">Total de la compra</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{formatearCentavos(compra.montoCentavos)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-papel/60 px-4 py-3 sm:px-6">
        <input aria-label="Buscar en esta compra" placeholder="Buscar producto…" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-acento" />
        <button type="button" aria-pressed={soloPendientes} onClick={() => setSoloPendientes(!soloPendientes)} className={`rounded-full border px-3 py-2 text-xs font-medium focus:outline-2 focus:outline-acento ${soloPendientes ? "border-acento bg-acento text-white" : "border-linea bg-white text-tinta"}`}>Por confirmar ({pendientes})</button>
      </div>

      <div className="px-4 pb-3 pt-2 text-xs leading-relaxed text-tinta-suave sm:px-6">
        Sugerido: multiplicador del producto o 40% inicial. Desde $10 sobre una centena, sube a la siguiente. {compra.enBlanco ? "Costo con IVA, sin percepciones." : "Costo de esta compra."} Al guardar, se actualiza también en Stock.
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_130px_120px_160px] gap-4 border-y border-linea bg-papel/60 px-6 py-3 text-xs font-semibold text-tinta-suave md:grid">
        <span>Producto</span><span>Costo {compra.enBlanco ? "con IVA" : "unitario"}</span><span title="Porcentaje que agregás al costo">Multiplicador</span><span>Precio de venta</span>
      </div>
      <div className="divide-y divide-linea">
        {filas.map(r => <PrecioRenglon key={`${compra.id}:${r.id}`} renglon={r} enBlanco={compra.enBlanco} precio={precioDe(r)} alGuardar={valor => { if (r.productoId) setPrecios(p => ({ ...p, [r.productoId!]: valor })); }} />)}
      </div>
      {filas.length === 0 && <p className="p-8 text-center text-sm text-tinta-suave">{compra.renglones.length === 0 ? "Esta compra no tiene productos detallados." : "No hay productos con ese filtro."}</p>}
      <details className="border-t border-linea px-4 py-4 text-sm sm:px-6">
        <summary className="cursor-pointer font-medium text-acento">Ver comprobante y notas</summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-tinta-suave">{compra.nota || "Sin notas adicionales."}</p>
      </details>
    </section>
  );
}

function PrecioRenglon({ renglon: r, enBlanco, precio, alGuardar }: { renglon: RenglonDelHistorial; enBlanco: boolean; precio: number | null; alGuardar: (valor: number) => void }) {
  const costo = r.costoCentavos == null ? null : costoConIva(r.costoCentavos, enBlanco);
  const sugerido = costo == null ? null : precioSugerido(costo, r.multiplicadorMilesimas);
  const [texto, setTexto] = useState(precio == null ? null : String(precio / 100).replace(".", ","));
  const [porcentaje, setPorcentaje] = useState<string | null>(null);
  const [ventaManual, setVentaManual] = useState(false);
  const textoVisible = texto ?? (sugerido == null ? "" : String(sugerido / 100).replace(".", ","));
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState(false);
  const [guardando, iniciar] = useTransition();
  const valor = parsearMonto(textoVisible);
  const margen = costo != null && valor != null && valor > 0 ? calcularMargen(costo, valor) : null;
  const cambio = valor !== (precio ?? sugerido);
  const porcentajeVisible = porcentaje ?? (!ventaManual && (texto == null || r.multiplicadorMilesimas != null) ? String(((r.multiplicadorMilesimas ?? 1400) - 1000) / 10).replace(".", ",") : margen && costo ? String(Math.round((margen.multiplicador - 1) * 1000) / 10).replace(".", ",") : "");
  function cambiarPorcentaje(nuevo: string) {
    setPorcentaje(nuevo);
    setMensaje("");
    setError(false);
    const numero = Number(nuevo.replace(",", "."));
    const valido = nuevo.trim() !== "" && Number.isFinite(numero) && numero >= 0 && numero <= 900;
    const calculado = valido && costo != null ? precioSugerido(costo, Math.round(1000 + numero * 10)) : null;
    setTexto(calculado != null && Number.isSafeInteger(calculado) ? String(calculado / 100).replace(".", ",") : "");
  }
  function guardar() {
    if (!r.productoId || guardando || !cambio) return;
    if (valor == null || !Number.isSafeInteger(valor) || valor <= 0) {
      setError(true); setMensaje("Ingresá un precio mayor a cero."); return;
    }
    iniciar(async () => {
      try {
        const respuesta = await editarProducto(r.productoId!, { precioVentaCentavos: valor, ...(porcentaje != null ? { multiplicadorMilesimas: Math.round(1000 + Number(porcentaje.replace(",", ".")) * 10) } : {}) });
        if (!respuesta.ok) { setError(true); setMensaje(respuesta.error); return; }
        alGuardar(valor); setError(false); setMensaje("Guardado");
      } catch { setError(true); setMensaje("No se pudo guardar. Volvé a intentar."); }
    });
  }
  return (
    <div className="grid grid-cols-3 items-start gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_130px_120px_160px] md:gap-4 md:px-6">
      <div className="col-span-3 min-w-0 md:col-span-1">
        <h3 className="text-sm font-semibold leading-snug">{r.descripcion || "Producto sin nombre"}</h3>
        <p className="mt-1 text-xs text-tinta-suave">{formatearContenido(r.cantidad * r.unidadesPorBulto, r.unidad)} compradas</p>
      </div>
      <div>
        <span className="mb-1 block text-[11px] text-tinta-suave md:hidden">Costo {enBlanco ? "con IVA" : "unitario"}</span>
        <p className="text-sm font-medium tabular-nums">{costo == null ? "Sin costo" : formatearCentavos(costo)}</p>
        <p className="mt-1 text-[11px] text-tinta-suave">{r.porCada}</p>
      </div>
      <div>
        <label htmlFor={`multiplicador-${r.id}`} className="mb-1 block text-[11px] text-tinta-suave md:sr-only">Multiplicador<span className="sr-only"> de {r.descripcion}</span></label>
        <div className="flex items-center rounded-lg border border-linea bg-white focus-within:border-acento focus-within:ring-1 focus-within:ring-acento">
          <input id={`multiplicador-${r.id}`} form={`precio-form-${r.id}`} inputMode="decimal" autoComplete="off" placeholder="—" value={porcentajeVisible} disabled={!r.productoId || guardando || !costo} onChange={e => cambiarPorcentaje(e.target.value)} aria-label={`Multiplicador de ${r.descripcion}`} className="min-w-0 w-full bg-transparent px-2 py-2 text-base tabular-nums outline-none md:text-sm" />
          <span className="pr-2 text-sm text-tinta-suave">%</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-tinta-suave">Sobre el costo, antes del redondeo</p>
      </div>
      <form id={`precio-form-${r.id}`} onSubmit={e => { e.preventDefault(); guardar(); }}>
        <label htmlFor={`venta-${r.id}`} className="mb-1 block text-[11px] text-tinta-suave md:sr-only">Precio de venta<span className="sr-only"> de {r.descripcion}</span></label>
        <div className="flex items-center rounded-lg border border-linea bg-white focus-within:border-acento focus-within:ring-1 focus-within:ring-acento">
          <span className="pl-2 text-sm text-tinta-suave">$</span>
          <input id={`venta-${r.id}`} inputMode="decimal" autoComplete="off" placeholder="Sin precio" value={textoVisible} disabled={!r.productoId || guardando} aria-invalid={error} aria-describedby={`estado-${r.id}`} onChange={e => { setTexto(e.target.value); setPorcentaje(null); setVentaManual(true); setMensaje(""); setError(false); }} className="min-w-0 w-full bg-transparent px-2 py-2 text-base tabular-nums outline-none md:text-sm" />
        </div>
        {cambio && <button type="submit" disabled={guardando || !r.productoId} className="mt-2 w-full rounded-lg bg-acento px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>}
        <p id={`estado-${r.id}`} role="status" className={`mt-1 text-[11px] ${error ? "text-deuda" : !cambio && precio != null ? "text-pago" : "text-tinta-suave"}`}>{!r.productoId ? "Sin vínculo al catálogo" : mensaje || (cambio ? "Sin guardar" : precio != null ? "Guardado" : sugerido != null ? "Sugerido" : "Sin precio")}</p>
        <p className="mt-1 text-[11px] leading-snug text-tinta-suave">{margen ? `${formatearCentavos(margen.gananciaCentavos)} ${margen.gananciaCentavos < 0 ? "de pérdida" : "te quedan"}` : costo === 0 ? "Sin costo" : "Poné un precio"}</p>
      </form>
    </div>
  );
}
