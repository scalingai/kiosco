"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarMovimientos } from "@/app/acciones";
import EditorItems from "@/components/EditorItems";
import { hoyLocal } from "@/lib/fechas";
import {
  aItemsAGuardar,
  itemVacio,
  itemsCargados,
  MontoInvalido,
  sumarItems,
  type ItemBorrador,
} from "@/lib/movimiento";
import { centavosAPesos, formatearCentavos, parsearMonto } from "@/lib/plata";

type Candidato = { id: string; nombre: string };

type Props = {
  clientes: Candidato[];
  /** Cuando el formulario vive dentro de la ficha de un cliente, ya sabemos quién es. */
  clienteFijo?: Candidato;
  /** Adentro de una hoja el título ya lo pone la hoja. */
  sinTitulo?: boolean;
  /** Para que la hoja se cierre sola cuando el movimiento quedó anotado. */
  alGuardar?: () => void;
};

export default function FormMovimiento({
  clientes,
  clienteFijo,
  sinTitulo,
  alGuardar,
}: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(clienteFijo?.nombre ?? "");
  const [tipo, setTipo] = useState<"fiado" | "pago">("fiado");
  const [items, setItems] = useState<ItemBorrador[]>([itemVacio()]);
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(hoyLocal());
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const esPago = tipo === "pago";

  // Sólo para el placeholder: si no ponés total, esto es lo que se va a anotar.
  let sumaItems = 0;
  try {
    sumaItems = esPago ? 0 : sumarItems(aItemsAGuardar(items));
  } catch {
    sumaItems = 0;
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    if (!clienteFijo && !nombre.trim()) {
      setError("Falta el cliente.");
      return;
    }

    let itemsAGuardar;
    try {
      itemsAGuardar = esPago ? [] : aItemsAGuardar(items);
    } catch (problema) {
      setError(
        problema instanceof MontoInvalido ? problema.message : "Revisá los productos.",
      );
      return;
    }

    let montoCentavos: number | null = null;
    if (monto.trim()) {
      montoCentavos = parsearMonto(monto);
      if (montoCentavos == null || montoCentavos <= 0) {
        setError("Poné un monto mayor a cero, o dejalo vacío.");
        return;
      }
    }

    if (esPago && montoCentavos == null) {
      setError("Un pago necesita el monto.");
      return;
    }
    if (!esPago && montoCentavos == null && !itemsAGuardar.length) {
      setError("Anotá al menos un producto o un monto.");
      return;
    }

    // Si el nombre escrito coincide exacto con uno de la lista, usamos su id
    // en vez de mandar texto: así no se crea un duplicado por un espacio.
    const coincide = clientes.find(
      (c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase(),
    );

    setGuardando(true);
    const resultado = await guardarMovimientos([
      {
        clienteId: clienteFijo?.id ?? coincide?.id,
        nombreCliente: clienteFijo || coincide ? undefined : nombre.trim(),
        tipo,
        montoCentavos,
        items: itemsAGuardar,
        nota,
        fecha,
        origen: "manual",
      },
    ]);
    setGuardando(false);

    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setMonto("");
    setNota("");
    setItems([itemVacio()]);
    if (!clienteFijo) setNombre("");
    router.refresh();
    if (alGuardar) {
      alGuardar();
      return;
    }
    setAviso("Anotado.");
  }

  const sinPrecioYSinTotal =
    !esPago &&
    !monto.trim() &&
    itemsCargados(items).some((i) => !i.precio.trim());

  return (
    <form
      onSubmit={enviar}
      className={
        sinTitulo ? "" : "rounded-2xl border border-linea bg-white/60 p-4 sm:p-5"
      }
    >
      {!sinTitulo && (
        <h2 className="font-display text-xl leading-none">
          {clienteFijo ? "Anotar movimiento" : "Cargar a mano"}
        </h2>
      )}

      <div className={(sinTitulo ? "" : "mt-4 ") + "space-y-3"}>
        {!clienteFijo && (
          <label className="block">
            <span className="text-xs text-tinta-suave">Cliente</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              list="lista-clientes-manual"
              placeholder="Nombre"
              className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs text-tinta-suave">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "fiado" | "pago")}
            className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          >
            <option value="fiado">Fiado (debe)</option>
            <option value="pago">Pago (entrega)</option>
          </select>
        </label>

        {!esPago && <EditorItems items={items} onCambio={setItems} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-tinta-suave">
              {esPago ? "Monto" : "Total"}
            </span>
            <input
              value={monto}
              inputMode="decimal"
              placeholder={
                esPago
                  ? "0"
                  : sumaItems > 0
                    ? String(centavosAPesos(sumaItems))
                    : "opcional"
              }
              onChange={(e) => setMonto(e.target.value)}
              className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            />
            {!esPago && (
              <span className="mt-1 block text-xs text-tinta-suave">
                {monto.trim()
                  ? "Mandás este total, no la suma."
                  : sumaItems > 0
                    ? "Vacío usa la suma: " + formatearCentavos(sumaItems)
                    : "Si lo dejás vacío, se usa la suma de los productos."}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-tinta-suave">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-tinta-suave">Nota</span>
          <input
            value={nota}
            placeholder="opcional"
            onChange={(e) => setNota(e.target.value)}
            className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {sinPrecioYSinTotal && (
        <p className="mt-3 rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          Hay productos sin precio y no pusiste un total: esas líneas quedan
          anotadas pero no suman a la deuda.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p className="mt-3 rounded-lg bg-pago-tenue px-3 py-2 text-sm text-pago">
          {aviso}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-4 rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
      >
        {guardando ? "Anotando…" : "Anotar"}
      </button>

      {/* La lista la comparte con la carga por voz cuando vive adentro de una hoja. */}
      <datalist id="lista-clientes-manual">
        {clientes.map((c) => (
          <option key={c.id} value={c.nombre} />
        ))}
      </datalist>
    </form>
  );
}
