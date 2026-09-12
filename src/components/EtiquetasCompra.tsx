"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatearCentavos } from "@/lib/plata";
import { nombreParaEtiqueta } from "@/lib/etiquetas";
import "./etiquetas.css";

export type ProductoEtiqueta = { id: string; nombre: string; precio: number | null; sugerido: boolean };

export default function EtiquetasCompra({ productos }: { productos: ProductoEtiqueta[] }) {
  const [abierto, setAbierto] = useState(false);
  return <>
    <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-acento px-3 py-2 text-sm font-medium text-acento">Etiquetas A4</button>
    {abierto && createPortal(<EditorEtiquetas productos={productos} cerrar={() => setAbierto(false)} />, document.body)}
  </>;
}

function EditorEtiquetas({ productos, cerrar }: { productos: ProductoEtiqueta[]; cerrar: () => void }) {
  const [filas, setFilas] = useState(() => productos.map(p => ({ ...p, corto: nombreParaEtiqueta(p.nombre), seleccionada: true })));
  const elegidas = filas.filter(p => p.seleccionada && p.precio && p.corto.trim());
  const hojas = Array.from({ length: Math.ceil(elegidas.length / 65) }, (_, i) => elegidas.slice(i * 65, (i + 1) * 65));
  const sugeridas = elegidas.filter(p => p.sugerido).length;
  return <div className="etiquetas-editor" role="dialog" aria-modal="true" aria-label="Etiquetas para imprimir" onKeyDown={e => { if (e.key === "Escape") cerrar(); }}>
    <div className="etiquetas-controles">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Etiquetas para recortar</h2><p className="mt-1 text-sm text-tinta-suave">A4 apaisada · 5 × 1,5 cm · 65 por hoja</p></div>
        <button autoFocus type="button" onClick={cerrar} className="rounded-lg border border-linea px-4 py-2">Volver a la compra</button>
      </header>
      <p className="my-4 text-sm">Todos los productos vienen marcados. Desmarcá los que no querés imprimir. Los nombres tienen hasta 14 caracteres y podés ajustarlos. Si no hay precio guardado, se usa el sugerido.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-linea px-3 py-2 text-sm" onClick={() => setFilas(f => f.map(p => ({ ...p, seleccionada: true })))}>Marcar todos</button>
        <button type="button" className="rounded-lg border border-linea px-3 py-2 text-sm" onClick={() => setFilas(f => f.map(p => ({ ...p, seleccionada: false })))}>Desmarcar todos</button>
        <a href="#vista-etiquetas" className="rounded-lg bg-acento px-3 py-2 text-sm text-white">Ver hoja lista para imprimir</a>
      </div>
      <div className="my-4 divide-y divide-linea">
        {filas.map((p, i) => <div key={p.id} className="grid grid-cols-[24px_minmax(0,1fr)_90px] items-center gap-3 py-3">
          <input type="checkbox" aria-label={`Imprimir ${p.nombre}`} checked={p.seleccionada} onChange={e => setFilas(f => f.map((r, n) => n === i ? { ...r, seleccionada: e.target.checked } : r))} className="h-5 w-5 accent-acento" />
          <div><label htmlFor={`nombre-etiqueta-${i}`} className="mb-1 block text-xs text-tinta-suave">{p.nombre}</label><input id={`nombre-etiqueta-${i}`} aria-label={`Nombre corto de ${p.nombre}`} value={p.corto} maxLength={14} onChange={e => setFilas(f => f.map((r, n) => n === i ? { ...r, corto: e.target.value.slice(0, 14) } : r))} className="w-full rounded border border-linea px-2 py-2 text-sm" /><span className="text-xs text-tinta-suave">{p.corto.length}/14</span></div>
          <div className="text-right text-sm font-semibold">{p.precio ? formatearCentavos(p.precio) : "Sin precio"}<span className="block text-xs font-normal text-tinta-suave">{p.precio ? p.sugerido ? "Sugerido" : "Guardado" : ""}</span></div>
        </div>)}
      </div>
      <div className="etiquetas-acciones">
        <p className="text-sm">{elegidas.length} etiquetas · {hojas.length} {hojas.length === 1 ? "hoja" : "hojas"}{sugeridas > 0 ? ` · ${sugeridas} con precio sugerido` : ""}</p>
        <p className="text-xs text-tinta-suave">Imprimí en A4 apaisada, escala 100% (tamaño real), sin encabezados ni pies. También podés guardar como PDF.</p>
        <button type="button" disabled={!elegidas.length} onClick={() => window.print()} className="rounded-lg bg-acento px-5 py-3 font-semibold text-white disabled:opacity-40">Imprimir etiquetas</button>
      </div>
    </div>
    <div id="vista-etiquetas" className="etiquetas-vista" aria-label="Vista previa de las hojas A4">
      {!hojas.length && <p className="p-8 text-center">Elegí productos para armar la hoja.</p>}
      {hojas.map((hoja, i) => <div className="etiquetas-hoja" key={i}>
        {hoja.map((p, n) => <div className="etiqueta-precio" key={n}>
          <div className="etiqueta-valor" style={{ fontSize: p.precio! >= 10000000 ? "14pt" : "17pt" }}>{formatearCentavos(p.precio!)}</div>
          <div className="etiqueta-nombre">{p.corto}</div>
        </div>)}
      </div>)}
    </div>
  </div>;
}
