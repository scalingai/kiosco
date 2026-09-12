"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarProducto } from "@/app/acciones";
import SelectorNombre from "@/components/SelectorNombre";
import {
  ETIQUETA_UNIDAD,
  MARGEN_SUGERIDO,
  MILESIMAS,
  precioSugerido,
  type Unidad,
} from "@/lib/negocio";
import type { Envase, OpcionCategoria } from "@/lib/stock";
import { centavosAPesos, formatearCentavos, parsearMonto } from "@/lib/plata";

type Marca = { id: string; nombre: string };

/**
 * El envase no es el rubro: un producto es de UN rubro pero viene en VARIOS
 * envases. Por eso son dos campos y no una sola lista.
 */
const ENVASES: { clave: Envase; etiqueta: string }[] = [
  { clave: "botella", etiqueta: "Botella" },
  { clave: "retornable", etiqueta: "Retornable" },
  { clave: "lata", etiqueta: "Lata" },
  { clave: "tetra", etiqueta: "Tetra" },
  { clave: "otro", etiqueta: "Otro" },
];

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
  multiplicadorMilesimas,
  costoRealCentavos,
  categoriaId,
  envase,
  codigoBarras,
  marcas,
  categoriasDisponibles,
}: {
  id: string;
  nombre: string;
  marca: string | null;
  contenido: number | null;
  contenidoUnidad: Unidad | null;
  precioVentaCentavos: number | null;
  /** lo que la app propondría; se usa de placeholder */
  sugeridoCentavos: number | null;
  /** el multiplicador propio de este producto; null = usa el general */
  multiplicadorMilesimas: number | null;
  /** el costo con IVA de una unidad, para recalcular mientras se escribe */
  costoRealCentavos: number | null;
  categoriaId: string | null;
  envase: Envase | null;
  codigoBarras: string | null;
  marcas: Marca[];
  categoriasDisponibles: OpcionCategoria[];
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
  // Se muestra con coma, como se escribe acá: 1,4 y no 1.4.
  const [multiplicador, setMultiplicador] = useState(
    multiplicadorMilesimas != null
      ? String(multiplicadorMilesimas / MILESIMAS).replace(".", ",")
      : "",
  );
  const [rubro, setRubro] = useState(categoriaId ?? "");
  const [envasado, setEnvasado] = useState<Envase | "">(envase ?? "");
  const [codigo, setCodigo] = useState(codigoBarras ?? "");
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

    // Vacío significa "seguí el general", que no es lo mismo que un 1,4 fijo.
    let milesimas: number | null = null;
    if (multiplicador.trim()) {
      const numero = Number(multiplicador.trim().replace(",", "."));
      if (!Number.isFinite(numero) || numero < 1 || numero > 10) {
        setError("El multiplicador tiene que estar entre 1 y 10. Ej: 1,4");
        return;
      }
      milesimas = Math.round(numero * MILESIMAS);
    }

    empezar(async () => {
      const resultado = await editarProducto(id, {
        nombre: nuevoNombre,
        marca: nuevaMarca.trim() || null,
        contenido: valor,
        contenidoUnidad: valor ? unidad : null,
        precioVentaCentavos: venta,
        multiplicadorMilesimas: milesimas,
        categoriaId: rubro || null,
        envase: envasado || null,
        codigoBarras: codigo.trim() || null,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAviso(true);
      router.refresh();
    });
  }

  /*
   * Lo que se sugeriría con el multiplicador que hay escrito AHORA. Si el
   * número tecleado no sirve todavía ("1," a medio escribir) se cae al que
   * vino del servidor en vez de parpadear.
   */
  const tecleado = Number(multiplicador.trim().replace(",", "."));
  const sugeridoVivo =
    costoRealCentavos != null &&
    multiplicador.trim() &&
    Number.isFinite(tecleado) &&
    tecleado >= 1 &&
    tecleado <= 10
      ? precioSugerido(costoRealCentavos, Math.round(tecleado * MILESIMAS))
      : sugeridoCentavos;

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
          <div className="mt-1">
            <SelectorNombre
              valor={nuevaMarca}
              alCambiar={(texto) => setNuevaMarca(texto)}
              opciones={marcas}
              queEs="Marca"
              placeholder="opcional: Coca-Cola, Lays…"
              className={campo}
            />
          </div>
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

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Rubro</span>
          <select
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
            className={"mt-1 " + campo}
          >
            <option value="">— sin rubro —</option>
            {categoriasDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.padre} › {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-tinta-suave">Envase</span>
          <select
            value={envasado}
            onChange={(e) => setEnvasado(e.target.value as Envase | "")}
            className={"mt-1 " + campo}
          >
            <option value="">— sin definir —</option>
            {ENVASES.map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">A cuánto lo vendés</span>
          <input
            value={precio}
            inputMode="decimal"
            placeholder={
              sugeridoVivo != null
                ? String(centavosAPesos(sugeridoVivo))
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

        <label className="block">
          <span className="text-xs text-tinta-suave">Multiplicador</span>
          <input
            value={multiplicador}
            inputMode="decimal"
            placeholder={String(MARGEN_SUGERIDO).replace(".", ",")}
            onChange={(e) => setMultiplicador(e.target.value)}
            className="cifra mt-1 w-24 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-tinta-suave">
            {/* El número de la izquierda cambia mientras se escribe: sin verlo
                hay que guardar y volver para saber si el margen dio bien. */}
            {sugeridoVivo != null ? (
              <>
                Sugiere {formatearCentavos(sugeridoVivo)}, redondeado.
                {multiplicador.trim() ? "" : " Vacío usa el " + String(MARGEN_SUGERIDO).replace(".", ",") + " de la casa."}
              </>
            ) : (
              "Vacío usa el " +
              String(MARGEN_SUGERIDO).replace(".", ",") +
              " de la casa. Cargá una compra para ver el sugerido."
            )}
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-tinta-suave">Código de barras</span>
        <input
          value={codigo}
          inputMode="numeric"
          placeholder="escaneá el producto"
          onChange={(e) => setCodigo(e.target.value)}
          className="cifra mt-1 w-56 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-tinta-suave">
          {/* El lector USB escribe los dígitos como si fuera un teclado, así
              que esto se llena sin tocar nada más. */}
          Poné el cursor acá y pasá el producto por el lector.
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
    </form>
  );
}
