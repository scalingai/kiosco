"use client";

import {
  contarSinPrecio,
  itemVacio,
  itemsConTexto,
  type ItemBorrador,
} from "@/lib/movimiento";
import { formatearCentavos, parsearMonto } from "@/lib/plata";

/**
 * La lista de lo que se llevó. El precio es opcional a propósito: se puede
 * anotar "dos gaseosas y pan" sin números y ponerle precio después.
 */
export default function EditorItems({
  items,
  onCambio,
}: {
  items: ItemBorrador[];
  onCambio: (items: ItemBorrador[]) => void;
}) {
  function editar(indice: number, cambio: Partial<ItemBorrador>) {
    onCambio(items.map((i, n) => (n === indice ? { ...i, ...cambio } : i)));
  }

  function sacar(indice: number) {
    const quedan = items.filter((_, n) => n !== indice);
    onCambio(quedan.length ? quedan : [itemVacio()]);
  }

  const conTexto = itemsConTexto(items);
  const sinPrecio = contarSinPrecio(items);

  const suma = conTexto.reduce((total, item) => {
    const centavos = item.precio.trim() ? parsearMonto(item.precio) : null;
    const cantidad = Number(item.cantidad) || 1;
    return total + (centavos ?? 0) * cantidad;
  }, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-tinta-suave">Qué se llevó</span>
        {conTexto.length > 0 && (
          <span className="cifra text-xs text-tinta-suave">
            {suma > 0 ? "suman " + formatearCentavos(suma) : "sin precios"}
          </span>
        )}
      </div>

      <ul className="mt-1 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={item.cantidad}
              inputMode="numeric"
              aria-label="Cantidad"
              onChange={(e) => editar(i, { cantidad: e.target.value })}
              className="cifra w-12 shrink-0 rounded-lg border border-linea bg-white px-2 py-2 text-center text-sm"
            />
            <span className="shrink-0 text-xs text-tinta-suave">×</span>
            <input
              value={item.descripcion}
              placeholder="producto"
              aria-label="Producto"
              onChange={(e) => editar(i, { descripcion: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            />
            <input
              value={item.precio}
              inputMode="decimal"
              placeholder="precio"
              aria-label="Precio por unidad"
              onChange={(e) => editar(i, { precio: e.target.value })}
              className="cifra w-24 shrink-0 rounded-lg border border-linea bg-white px-2 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => sacar(i)}
              aria-label="Sacar este producto"
              className="shrink-0 rounded-lg px-1.5 py-2 text-lg leading-none text-tinta-suave"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onCambio([...items, itemVacio()])}
        className="mt-2 text-xs text-acento underline underline-offset-4"
      >
        + otro producto
      </button>

      {sinPrecio > 0 && (
        <p className="mt-2 text-xs text-tinta-suave">
          {sinPrecio === 1
            ? "1 producto sin precio."
            : sinPrecio + " productos sin precio."}{" "}
          Si no ponés un total abajo, no suman a la deuda.
        </p>
      )}
    </div>
  );
}
