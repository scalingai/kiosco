"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarProducto } from "@/app/acciones";
import { ETIQUETA_UNIDAD, type Unidad } from "@/lib/negocio";
import { centavosAPesos, parsearMonto } from "@/lib/plata";

type Marca = { id: string; nombre: string };

/**
 * Lo que se carga a mano de un producto: su marca y cuánto trae cada unidad.
 *
 * El contenido es el dato que hace comparables dos tamaños de la misma marca.
 * El costo y el proveedor no se editan acá a propósito: los escribe la última
 * compra, y dejarlos a mano sería tener dos números para la misma cosa.
 */
export default function FichaProducto({
  id,
  nombre,
  marca,
  contenido,
  contenidoUnidad,
  precioVentaCentavos,
  sugeridoCentavos,
  marcas,
}: {
  id: string;
  nombre: string;
  marca: string | null;
  contenido: number | null;
  contenidoUnidad: Unidad | null;
  precioVentaCentavos: number | null;
  /** lo que la app propondría; se usa de placeholder */
  sugeridoCentavos: number | null;
  marcas: Marca[];
}) {
  const router = useRouter();
  const [nuevoNombre, setNuevoNombre] = useState(nombre);
  const [nuevaMarca, setNuevaMarca] = useState(marca ?? "");
  const [nuevoContenido, setNuevoContenido] = useState(
    contenido != null ? String(contenido) : "",
  );
  const [unidad, setUnidad] = useState<Unidad>(contenidoUnidad ?? "ml");
  const [precio, setPrecio] = useState(
    precioVentaCentavos != null ? String(centavosAPesos(precioVentaCentavos)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);
  const [pendiente, empezar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(false);

    const escrito = nuevoContenido.trim();
    let valor: number | null = null;
    if (escrito) {
      const numero = Number(escrito);
      if (!Number.isFinite(numero) || numero <= 0) {
        setError("El contenido tiene que ser un número mayor a cero.");
        return;
      }
      valor = Math.round(numero);
    }

    let venta: number | null = null;
    if (precio.trim()) {
      venta = parsearMonto(precio);
      if (venta == null || venta <= 0) {
        setError("Revisá el precio de venta.");
        return;
      }
    }

    empezar(async () => {
      const resultado = await editarProducto(id, {
        nombre: nuevoNombre,
        marca: nuevaMarca.trim() || null,
        contenido: valor,
        contenidoUnidad: valor ? unidad : null,
        precioVentaCentavos: venta,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAviso(true);
      router.refresh();
    });
  }

  const campo =
    "w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm";

  return (
    <form onSubmit={enviar} className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Nombre</span>
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className={"mt-1 " + campo}
          />
        </label>

        <label className="block">
          <span className="text-xs text-tinta-suave">Marca</span>
          <input
            value={nuevaMarca}
            list="lista-marcas"
            placeholder="opcional: Coca-Cola, Lays…"
            onChange={(e) => setNuevaMarca(e.target.value)}
            className={"mt-1 " + campo}
          />
        </label>
      </div>

      <div>
        <span className="text-xs text-tinta-suave">Cuánto trae cada unidad</span>
        <div className="mt-1 flex gap-2">
          <input
            value={nuevoContenido}
            inputMode="numeric"
            placeholder="2250"
            aria-label="Contenido de una unidad"
            onChange={(e) => setNuevoContenido(e.target.value)}
            className="cifra w-28 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
          <select
            value={unidad}
            aria-label="Unidad del contenido"
            onChange={(e) => setUnidad(e.target.value as Unidad)}
            className="rounded-lg border border-linea bg-white px-2 py-2 text-sm"
          >
            <option value="ml">{ETIQUETA_UNIDAD.ml}</option>
            <option value="gr">{ETIQUETA_UNIDAD.gr}</option>
          </select>
        </div>
        <span className="mt-1 block text-xs text-tinta-suave">
          Con esto la app puede decirte el precio por litro o por kilo, que es lo
          único con lo que se comparan dos tamaños de la misma marca.
        </span>
      </div>

      <label className="block">
        <span className="text-xs text-tinta-suave">A cuánto lo vendés</span>
        <input
          value={precio}
          inputMode="decimal"
          placeholder={
            sugeridoCentavos != null
              ? String(centavosAPesos(sugeridoCentavos))
              : "opcional"
          }
          onChange={(e) => setPrecio(e.target.value)}
          className="cifra mt-1 w-32 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-tinta-suave">
          {/* Sin este dato la app sólo puede sugerir; con él dice el margen
              que estás sacando de verdad. */}
          Poniéndolo, la app te dice el margen real en vez de uno sugerido.
        </span>
      </label>

      {error && <p className="text-xs text-deuda">{error}</p>}
      {aviso && !error && <p className="text-xs text-pago">Guardado.</p>}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-acento px-4 py-2 text-xs font-medium text-white disabled:opacity-45"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>

      <datalist id="lista-marcas">
        {marcas.map((m) => (
          <option key={m.id} value={m.nombre} />
        ))}
      </datalist>
    </form>
  );
}
