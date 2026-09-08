"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarCompra } from "@/app/acciones";
import EditorRenglones from "@/components/EditorRenglones";
import RepartoDePago, {
  mediosUsados,
  montoDe,
  montosVacios,
  sumarMontos,
  type MontosPorMedio,
} from "@/components/RepartoDePago";
import SelectorNombre from "@/components/SelectorNombre";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import {
  aRenglonesAGuardar,
  renglonVacio,
  renglonesCargados,
  RenglonInvalido,
  repartirPago,
  sumarRenglones,
  type MedioPago,
  type RenglonBorrador,
} from "@/lib/negocio";
import { normalizarNombre } from "@/lib/nombres";
import { centavosAPesos, formatearCentavos, parsearMonto } from "@/lib/plata";

/** Lo escrito en cada medio, listo para `repartirPago`. */
function montosComoPagos(montos: MontosPorMedio) {
  return (Object.keys(montos) as MedioPago[]).map((medio) => ({
    medio,
    importeCentavos: montos[medio].trim()
      ? (parsearMonto(montos[medio]) ?? 0)
      : 0,
  }));
}

type Proveedor = { id: string; nombre: string };
type Producto = {
  id: string;
  nombre: string;
  precioVentaCentavos: number | null;
  multiplicadorMilesimas: number | null;
};

/**
 * Lo que trajo el proveedor. Las dos fechas están separadas a propósito:
 * `fecha` es cuándo llegó la mercadería y `pagadoEn` cuándo salió la plata. Una
 * compra a cuenta se anota hoy y recién impacta la caja el día que se paga.
 */
export default function FormCompra({
  fecha,
  proveedores,
  productos,
  proveedorInicial,
  alGuardar,
}: {
  fecha: string;
  proveedores: Proveedor[];
  /** los productos que ya existen, para elegir en vez de re-escribir */
  productos: Producto[];
  /** cuando el formulario se abre desde la ficha de un proveedor */
  proveedorInicial?: string;
  alGuardar?: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(proveedorInicial ?? "");
  const [items, setItems] = useState<RenglonBorrador[]>([renglonVacio()]);
  const [monto, setMonto] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [nota, setNota] = useState("");
  const [cuando, setCuando] = useState(fecha);
  const [pago, setPago] = useState<"ahora" | "cuenta">("ahora");
  const [fechaPago, setFechaPago] = useState(fecha);
  const [montos, setMontos] = useState<MontosPorMedio>(montosVacios());
  const [enBlanco, setEnBlanco] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Sólo para el placeholder: si no ponés total, esto es lo que se anota.
  let suma = 0;
  try {
    suma = sumarRenglones(aRenglonesAGuardar(items));
  } catch {
    suma = 0;
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError("Falta el proveedor.");
      return;
    }

    let itemsAGuardar;
    try {
      itemsAGuardar = aRenglonesAGuardar(items);
    } catch (problema) {
      setError(
        problema instanceof RenglonInvalido
          ? problema.message
          : "Revisá los renglones.",
      );
      return;
    }

    let montoCentavos: number | null = null;
    if (monto.trim()) {
      montoCentavos = parsearMonto(monto);
      if (montoCentavos == null || montoCentavos <= 0) {
        setError("Poné un total mayor a cero, o dejalo vacío.");
        return;
      }
    }
    if (montoCentavos == null && !itemsAGuardar.length) {
      setError("Anotá el total de la factura o al menos un renglón.");
      return;
    }

    // Si lo escrito coincide con uno de la lista, mandamos su id. Se compara
    // normalizado —sin acentos ni signos— así "Coca Cola" encuentra a
    // "Coca-Cola" en vez de crear un proveedor nuevo por un guion.
    const coincide = proveedores.find(
      (p) => normalizarNombre(p.nombre) === normalizarNombre(nombre),
    );

    /*
     * Con qué se pagó sale de lo escrito en los tres campos, sin ningún modo
     * que declarar: uno solo con plata es un pago simple, dos o tres es un
     * reparto, y ninguno es todo en efectivo (lo más común, y por eso el
     * default). Se valida acá para decirlo con el formulario a la vista; el
     * servidor lo vuelve a validar igual, que es donde no se negocia.
     */
    const totalReal = montoCentavos ?? sumarRenglones(itemsAGuardar);
    const usados = mediosUsados(montos);
    let medio: MedioPago = usados[0] ?? "efectivo";
    let reparto;

    if (pago === "ahora" && usados.length) {
      if (sumarMontos(montos) !== totalReal) {
        setError(
          `Los medios suman ${formatearCentavos(sumarMontos(montos))} y la ` +
            `compra es ${formatearCentavos(totalReal)}. Tienen que dar lo mismo.`,
        );
        return;
      }
      if (usados.length > 1) {
        // El medio de la compra queda en el que más plata movió: es lo que se
        // muestra de un vistazo cuando no hay lugar para los tres.
        medio = usados.reduce((mayor, m) =>
          montoDe(montos, m) > montoDe(montos, mayor) ? m : mayor,
        );
        try {
          reparto = repartirPago(montosComoPagos(montos), totalReal) ?? undefined;
        } catch (problema) {
          setError(
            problema instanceof Error ? problema.message : "Revisá el reparto.",
          );
          return;
        }
      }
    }

    setGuardando(true);
    const espera = await conLimiteDeTiempo(
      guardarCompra({
        proveedorId: coincide?.id,
        nombreProveedor: coincide ? undefined : nombre.trim(),
        montoCentavos,
        items: itemsAGuardar,
        fecha: cuando,
        pagadoEn: pago === "ahora" ? fechaPago : null,
        medio: pago === "ahora" ? medio : null,
        pagos: pago === "ahora" ? reparto : undefined,
        comprobante,
        nota,
        enBlanco,
      }),
    );
    setGuardando(false);

    if (espera.venció) {
      setError(AVISO_TARDANZA);
      return;
    }
    if (!espera.valor.ok) {
      setError(espera.valor.error);
      return;
    }

    setNombre(proveedorInicial ?? "");
    setMonto("");
    setComprobante("");
    setNota("");
    setItems([renglonVacio()]);
    setMontos(montosVacios());
    router.refresh();
    alGuardar?.();
  }

  /*
   * Contra qué se reparte el pago: el total declarado si lo escribiste, y si no
   * la suma de los renglones. Es el mismo número que va a guardar el servidor,
   * así que lo que dice la pantalla y lo que valida la base no pueden discrepar.
   */
  const totalDeLaCompra = monto.trim() ? (parsearMonto(monto) ?? 0) : suma;

  const proveedorNuevo =
    nombre.trim().length > 0 &&
    !proveedores.some(
      (p) => normalizarNombre(p.nombre) === normalizarNombre(nombre),
    );

  const sinPrecioYSinTotal =
    !monto.trim() && renglonesCargados(items).some((i) => !i.importe.trim());

  return (
    <form onSubmit={enviar} className="space-y-3">
      <label className="block">
        <span className="text-xs text-tinta-suave">Proveedor</span>
        <div className="mt-1">
          <SelectorNombre
            valor={nombre}
            alCambiar={(texto) => setNombre(texto)}
            opciones={proveedores}
            queEs="Proveedor"
            placeholder="Nombre del proveedor"
            autoFocus={!proveedorInicial}
          />
        </div>
        {proveedorNuevo && (
          <span className="mt-1 block text-xs text-tinta-suave">
            Proveedor nuevo. Si ya le comprabas, elegilo de la lista.
          </span>
        )}
      </label>

      {/*
        Cambia el costo, no un rótulo: en blanco el mayorista factura + IVA, así
        que lo que sale de verdad cada unidad es el importe por 1,21.

        Va pegado al proveedor y ANTES de los renglones porque es la decisión de
        la que dependen todos los números de abajo: el costo por unidad y el
        precio sugerido de cada producto se leen mientras se carga la factura, y
        elegirlo después obliga a releer todo lo que ya se había mirado.
      */}
      <fieldset className="rounded-xl border border-linea bg-white/60 px-3 py-2.5">
        <legend className="px-1 text-xs text-tinta-suave">Cómo se compró</legend>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={enBlanco}
            onClick={() => setEnBlanco(true)}
            className={
              "flex-1 rounded-lg border px-2 py-2 text-sm " +
              (enBlanco
                ? "border-acento bg-acento text-white"
                : "border-linea bg-white text-tinta")
            }
          >
            En blanco
          </button>
          <button
            type="button"
            aria-pressed={!enBlanco}
            onClick={() => setEnBlanco(false)}
            className={
              "flex-1 rounded-lg border px-2 py-2 text-sm " +
              (!enBlanco
                ? "border-acento bg-acento text-white"
                : "border-linea bg-white text-tinta")
            }
          >
            En negro
          </button>
        </div>
        <p className="mt-2 text-xs text-tinta-suave">
          {enBlanco
            ? "Con factura: al importe se le suma el IVA para saber el costo real."
            : "Sin factura: el importe ya es el costo."}
        </p>
      </fieldset>

      <EditorRenglones
        renglones={items}
        onCambio={setItems}
        productos={productos}
        enBlanco={enBlanco}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Total de la factura</span>
          <input
            value={monto}
            inputMode="decimal"
            placeholder={suma > 0 ? String(centavosAPesos(suma)) : "opcional"}
            onChange={(e) => setMonto(e.target.value)}
            className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-tinta-suave">
            {monto.trim()
              ? "Vale este total, no la suma."
              : suma > 0
                ? "Vacío usa la suma: " + formatearCentavos(suma)
                : "Si lo dejás vacío, se usa la suma de los renglones."}
          </span>
        </label>

        <label className="block">
          <span className="text-xs text-tinta-suave">Llegó el</span>
          <input
            type="date"
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>


      <fieldset className="rounded-xl border border-linea bg-white/60 px-3 py-2.5">
        <legend className="px-1 text-xs text-tinta-suave">Cómo se paga</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pago"
              checked={pago === "ahora"}
              onChange={() => setPago("ahora")}
            />
            Se pagó
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pago"
              checked={pago === "cuenta"}
              onChange={() => setPago("cuenta")}
            />
            Queda a cuenta
          </label>
        </div>

        {pago === "ahora" ? (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="text-xs text-tinta-suave">Día en que se pagó</span>
              <input
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm sm:w-48"
              />
            </label>
            <RepartoDePago
              montos={montos}
              alCambiar={setMontos}
              totalCentavos={totalDeLaCompra}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-tinta-suave">
            No toca la caja de ningún día hasta que la marques pagada. Mientras
            tanto figura como deuda con el proveedor.
          </p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Factura o remito</span>
          <input
            value={comprobante}
            placeholder="opcional"
            onChange={(e) => setComprobante(e.target.value)}
            className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>

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
        <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          Hay renglones sin importe y no pusiste el total de la factura: quedan
          anotados, pero ese total todavía no es el total.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
      >
        {guardando ? "Anotando…" : "Anotar compra"}
      </button>
    </form>
  );
}
