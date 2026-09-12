"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatearCentavos } from "@/lib/plata";
import "./etiquetas.css";

export type ProductoEtiqueta = { id: string; nombre: string; precio: number | null; sugerido: boolean };

/** Acorta palabras genéricas y conserva marca, variedad y presentación. */
function nombreCorto(nombre: string) {
  return nombre.replace(/papel higi[eé]nico/gi, "P. hig.")
    .replace(/toallitas/gi, "Toall.").replace(/acondicionador/gi, "Acond.")
    .replace(/limpiador/gi, "Limp.").replace(/protector femenino/gi, "Prot.")
    .replace(/frescura/gi, "").replace(/con alas/gi, "c/alas")
    .replace(/buenas noches/gi, "B. Noches").replace(/unidades/gi, "un")
    .replace(/\s+/g, " ").trim();
}

export default function EtiquetasCompra({ productos }: { productos: ProductoEtiqueta[] }) {
  const [abierto, setAbierto] = useState(false);
  return <>
    <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-acento px-3 py-2 text-sm font-medium text-acento">Etiquetas A4</button>
    {abierto && createPortal(<EditorEtiquetas productos={productos} cerrar={() => setAbierto(false)} />, document.body)}
  </>;
}

function EditorEtiquetas({ productos, cerrar }: { productos: ProductoEtiqueta[]; cerrar: () => void }) {
  const [filas, setFilas] = useState(() => productos.map(p => ({ ...p, corto: nombreCorto(p.nombre), copias: p.precio && !p.sugerido ? 1 : 0 })));
  const elegidas = filas.flatMap(p => p.precio && p.corto.trim() ? Array.from({ length: p.copias }, () => p) : []);
  const hojas = Array.from({ length: Math.ceil(elegidas.length / 76) }, (_, i) => elegidas.slice(i * 76, (i + 1) * 76));
  const sugeridas = elegidas.filter(p => p.sugerido).length;
  return <div className="etiquetas-editor" role="dialog" aria-modal="true" aria-label="Etiquetas para imprimir" onKeyDown={e => { if (e.key === "Escape") cerrar(); }}>
    <div className="etiquetas-controles">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Etiquetas para recortar</h2><p className="mt-1 text-sm text-tinta-suave">A4 · 5 × 1,5 cm · 76 por hoja</p></div>
        <button autoFocus type="button" onClick={cerrar} className="rounded-lg border border-linea px-4 py-2">Volver a la compra</button>
      </header>
      <p className="my-4 text-sm">Acortá los nombres sin perder la marca o el tamaño. Indicá cuántas etiquetas necesitás de cada producto. Se usan precios guardados; podés incluir los sugeridos.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-linea px-3 py-2 text-sm" onClick={() => setFilas(f => f.map(p => ({ ...p, copias: p.precio && !p.sugerido ? 1 : 0 })))}>Solo guardados</button>
        <button type="button" className="rounded-lg border border-linea px-3 py-2 text-sm" onClick={() => setFilas(f => f.map(p => ({ ...p, copias: p.precio ? 1 : 0 })))}>Incluir sugeridos</button>
        <button type="button" className="rounded-lg border border-linea px-3 py-2 text-sm" onClick={() => setFilas(f => f.map(p => ({ ...p, copias: 0 })))}>Ninguno</button>
        <a href="#vista-etiquetas" className="rounded-lg bg-acento px-3 py-2 text-sm text-white">Ver hoja lista para imprimir</a>
      </div>
      <div className="my-4 divide-y divide-linea">
        {filas.map((p, i) => <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_90px_64px] items-center gap-3 py-3">
          <div><label htmlFor={`nombre-etiqueta-${i}`} className="mb-1 block text-xs text-tinta-suave">{p.nombre}</label><input id={`nombre-etiqueta-${i}`} aria-label={`Nombre corto de ${p.nombre}`} value={p.corto} maxLength={48} onChange={e => setFilas(f => f.map((r, n) => n === i ? { ...r, corto: e.target.value } : r))} className="w-full rounded border border-linea px-2 py-2 text-sm" /></div>
          <div className="text-right text-sm font-semibold">{p.precio ? formatearCentavos(p.precio) : "Sin precio"}<span className="block text-xs font-normal text-tinta-suave">{p.precio ? p.sugerido ? "Sugerido" : "Guardado" : ""}</span></div>
          <label className="text-xs text-tinta-suave">Copias<input type="number" min="0" max="76" aria-label={`Copias de ${p.nombre}`} value={p.copias} disabled={!p.precio} onChange={e => setFilas(f => f.map((r, n) => n === i ? { ...r, copias: Math.min(76, Math.max(0, Math.floor(Number(e.target.value) || 0))) } : r))} className="mt-1 w-full rounded border border-linea px-2 py-2 text-sm text-tinta" /></label>
        </div>)}
      </div>
      <div className="etiquetas-acciones">
        <p className="text-sm">{elegidas.length} etiquetas · {hojas.length} {hojas.length === 1 ? "hoja" : "hojas"}{sugeridas > 0 ? ` · ${sugeridas} con precio sugerido` : ""}</p>
        <p className="text-xs text-tinta-suave">Imprimí en A4, escala 100% (tamaño real), sin encabezados ni pies. También podés guardar como PDF.</p>
        <button type="button" disabled={!elegidas.length} onClick={() => window.print()} className="rounded-lg bg-acento px-5 py-3 font-semibold text-white disabled:opacity-40">Imprimir etiquetas</button>
      </div>
    </div>
    <div id="vista-etiquetas" className="etiquetas-vista" aria-label="Vista previa de las hojas A4">
      {!hojas.length && <p className="p-8 text-center">Elegí productos para armar la hoja.</p>}
      {hojas.map((hoja, i) => <div className="etiquetas-hoja" key={i}>
        {hoja.map((p, n) => <div className="etiqueta-precio" key={n}>
          <div className="etiqueta-nombre">{p.corto}</div>
          <div className="etiqueta-valor" style={{ fontSize: p.precio! >= 10000000 ? "14pt" : "17pt" }}>{formatearCentavos(p.precio!)}</div>
        </div>)}
      </div>)}
    </div>
  </div>;
}
