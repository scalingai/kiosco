"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarVenta } from "@/app/acciones";
import SelectorNombre from "@/components/SelectorNombre";
import RepartoDePago, {
  mediosUsados,
  montoDe,
  montosVacios,
  sumarMontos,
  type MontosPorMedio,
} from "@/components/RepartoDePago";
import {
  agregar,
  cambiarCantidad,
  gananciaDelCarrito,
  sacar,
  totalDelCarrito,
  unidadesDelCarrito,
  type RenglonCarrito,
} from "@/lib/carrito";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import { normalizarNombre } from "@/lib/nombres";
import { repartirPago, type MedioPago } from "@/lib/negocio";
import { formatearCentavos, parsearMonto } from "@/lib/plata";
import type { ProductoVendible } from "@/lib/stock";

/** Cuántas sugerencias se dibujan mientras se escribe. */
const MAXIMO = 8;

/**
 * El mostrador: cobrar una venta producto por producto.
 *
 * Está pensado para una mano sola y un lector de códigos. El lector escribe los
 * dígitos como si fuera un teclado y termina con Enter, así que el campo de
 * arriba hace las dos cosas sin que haya que elegir un modo: si lo que entró es
 * un código que existe, el producto entra al carrito y el campo se limpia solo;
 * si es texto, busca por nombre.
 *
 * El catálogo entero viaja al navegador (ver `listarParaVender`). Escanear
 * resuelve en el acto, sin pedirle nada al servidor, y sigue andando con el
 * wifi caído. En un mostrador eso es la diferencia entre cobrar y esperar.
 */
export default function Mostrador({
  fecha,
  productos,
  clientes,
  alGuardar,
}: {
  fecha: string;
  productos: ProductoVendible[];
  /** para poder poner la venta a nombre de alguien que ya existe */
  clientes: { id: string; nombre: string }[];
  alGuardar?: () => void;
}) {
  const router = useRouter();
  const [renglones, setRenglones] = useState<RenglonCarrito[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [montos, setMontos] = useState<MontosPorMedio>(montosVacios());
  const [cliente, setCliente] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  /*
   * Lo tecleado en los precios que faltan, mientras se teclea. Va aparte del
   * carrito porque un precio a medio escribir ("1" camino a "1200") no es un
   * precio: metido en el renglón, el primer dígito ya valdría un peso y la
   * fila dejaría de pedir el número justo cuando se estaba poniendo.
   *
   * La llave es la misma con la que el carrito junta renglones iguales, así
   * que sigue al producto aunque se muevan las filas.
   */
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const total = totalDelCarrito(renglones);
  const unidades = unidadesDelCarrito(renglones);
  const ganancia = gananciaDelCarrito(renglones);
  const sinPrecio = renglones.filter((r) => r.precioUnitarioCentavos <= 0).length;

  /** El código de barras es la llave más rápida: se arma una sola vez. */
  const porCodigo = useMemo(() => {
    const mapa = new Map<string, ProductoVendible>();
    for (const p of productos) if (p.codigoBarras) mapa.set(p.codigoBarras, p);
    return mapa;
  }, [productos]);

  /*
   * Busca por PALABRAS sueltas, no por la frase entera: quien atiende escribe
   * "coca 600" y el producto se llama "Coca-Cola común 600 ml". Pidiendo que
   * el texto aparezca de corrido, esa búsqueda —la natural— no encuentra nada,
   * porque entre "coca" y "600" hay dos palabras más.
   *
   * Tienen que estar TODAS las palabras: cada una que se agrega achica la
   * lista, que es lo que uno espera al seguir escribiendo.
   */
  const sugerencias = useMemo(() => {
    const palabras = normalizarNombre(busqueda).split(" ").filter(Boolean);
    if (!palabras.length) return [];

    const puntuadas: { p: ProductoVendible; puntaje: number }[] = [];
    for (const p of productos) {
      const nombre = normalizarNombre(p.nombre);
      const marca = normalizarNombre(p.marca ?? "");
      const donde = marca ? nombre + " " + marca : nombre;
      if (!palabras.every((palabra) => donde.includes(palabra))) continue;
      // Lo que empieza con lo escrito va primero: es lo más probable.
      puntuadas.push({ p, puntaje: nombre.startsWith(palabras[0]) ? 0 : 1 });
    }

    puntuadas.sort(
      (a, b) => a.puntaje - b.puntaje || a.p.nombre.localeCompare(b.p.nombre),
    );
    return puntuadas.slice(0, MAXIMO).map((x) => x.p);
  }, [productos, busqueda]);

  function meter(producto: ProductoVendible) {
    setRenglones((previo) =>
      agregar(previo, {
        productoId: producto.id,
        descripcion: producto.nombre,
        cantidad: 1,
        // Sin precio cargado entra en cero y la fila pide el número. Frenar la
        // venta porque falta un precio sería dejar de cobrar por un dato que se
        // puede poner en el momento.
        precioUnitarioCentavos: producto.precioVentaCentavos ?? 0,
        costoUnitarioCentavos: producto.costoRealCentavos,
      }),
    );
    setBusqueda("");
    setError(null);
    campo.current?.focus();
  }

  /** Algo que no está en el catálogo: entra con su precio y sin nombre de ficha. */
  function meterSuelto(texto: string) {
    const centavos = parsearMonto(texto);
    if (centavos == null || centavos <= 0) return false;
    setRenglones((previo) =>
      agregar(previo, {
        productoId: null,
        descripcion: "Varios",
        cantidad: 1,
        precioUnitarioCentavos: centavos,
        costoUnitarioCentavos: null,
      }),
    );
    setBusqueda("");
    setError(null);
    campo.current?.focus();
    return true;
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const texto = busqueda.trim();
    if (!texto) return;

    // 1) Un código que existe entra derecho: es el camino del lector y tiene
    //    que ganarle a cualquier otra interpretación.
    const porEscaneo = porCodigo.get(texto.replace(/\D/g, ""));
    if (porEscaneo) return void meter(porEscaneo);

    // 2) Si hay una sola coincidencia por nombre, esa.
    if (sugerencias.length) return void meter(sugerencias[0]);

    // 3) Si no encontró nada y lo escrito es un número, se cobra como monto
    //    suelto. Es lo que se hace con lo que no está cargado todavía.
    if (meterSuelto(texto)) return;

    setError(
      `No encontré "${texto}". Si es un precio suelto, escribí sólo el número.`,
    );
  }

  /** La identidad de un renglón: la misma con la que el carrito deduplica. */
  function llaveDe(renglon: RenglonCarrito): string {
    return renglon.productoId ?? "suelto:" + renglon.descripcion;
  }

  function ponerPrecio(renglon: RenglonCarrito, texto: string) {
    const llave = llaveDe(renglon);
    setPrecios((previo) => ({ ...previo, [llave]: texto }));

    const centavos = texto.trim() ? (parsearMonto(texto) ?? 0) : 0;
    setRenglones((previo) =>
      previo.map((r) =>
        llaveDe(r) === llave ? { ...r, precioUnitarioCentavos: centavos } : r,
      ),
    );
  }

  async function cobrar() {
    setError(null);

    if (!renglones.length) {
      setError("El carrito está vacío.");
      return;
    }
    if (sinPrecio) {
      setError(
        sinPrecio === 1
          ? "Hay un producto sin precio."
          : `Hay ${sinPrecio} productos sin precio.`,
      );
      return;
    }

    /*
     * Con qué pagó sale de lo escrito en los tres campos, sin ningún modo que
     * declarar: uno solo con plata es un pago simple, dos o tres es un reparto,
     * y ninguno es todo en efectivo (lo más común en el mostrador, y por eso el
     * default).
     */
    const usados = mediosUsados(montos);
    let medio: MedioPago = usados[0] ?? "efectivo";
    let reparto;

    if (usados.length) {
      if (sumarMontos(montos) !== total) {
        setError(
          `Los medios suman ${formatearCentavos(sumarMontos(montos))} y la ` +
            `venta es ${formatearCentavos(total)}. Tienen que dar lo mismo.`,
        );
        return;
      }
      if (usados.length > 1) {
        medio = usados.reduce((mayor, m) =>
          montoDe(montos, m) > montoDe(montos, mayor) ? m : mayor,
        );
        try {
          reparto =
            repartirPago(
              usados.map((m) => ({
                medio: m,
                importeCentavos: montoDe(montos, m),
              })),
              total,
            ) ?? undefined;
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
      guardarVenta({
        // Sin monto: lo dice el carrito. Mandarlo calculado desde acá sería que
        // la pantalla y el servidor puedan discrepar sobre el mismo total.
        fecha,
        medio,
        items: renglones,
        pagos: reparto,
        clienteId,
        // Sólo si es alguien nuevo: con el id ya elegido, mandar el nombre
        // haría que el servidor lo busque de nuevo por texto.
        nombreCliente: clienteId ? null : cliente.trim() || null,
        telefonoCliente: clienteId ? null : telefono.trim() || null,
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

    setRenglones([]);
    setPrecios({});
    setMontos(montosVacios());
    setBusqueda("");
    setCliente("");
    setClienteId(null);
    setTelefono("");
    router.refresh();
    alGuardar?.();
  }

  const buscador = (
    <div>
      <input
        ref={campo}
        value={busqueda}
        autoFocus
        enterKeyHint="done"
        aria-label="Escaneá o buscá un producto"
        placeholder="Escaneá el código o escribí el producto"
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={alTeclear}
        className="w-full rounded-xl border border-linea bg-white px-4 py-3 text-base"
      />

      {sugerencias.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-linea bg-tarjeta">
          {sugerencias.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => meter(p)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-papel-hondo"
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.nombre}</span>
                  {p.marca && (
                    <span className="block truncate text-xs text-tinta-suave">
                      {p.marca}
                    </span>
                  )}
                </span>
                <span className="cifra shrink-0 text-sm">
                  {p.precioVentaCentavos != null
                    ? formatearCentavos(p.precioVentaCentavos)
                    : "sin precio"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-tinta-suave">
          El lector escribe acá solo: pasá el producto y entra al carrito. Si no
          está cargado, escribí el precio y se cobra como monto suelto.
        </p>
      )}
    </div>
  );

  /*
   * El cliente va DEBAJO del buscador y no arriba: ponerlo primero haría que
   * cada venta empiece pidiendo un nombre que casi nunca hace falta, y eso
   * frena lo único que siempre importa, que es cobrar.
   */
  const fichaCliente = (
    <div className="rounded-xl border border-linea bg-tarjeta p-3">
      <p className="text-xs text-tinta-suave">A nombre de (opcional)</p>

      <div className="mt-2">
        <SelectorNombre
          valor={cliente}
          alCambiar={(nombre, id) => {
            setCliente(nombre);
            setClienteId(id);
          }}
          opciones={clientes}
          queEs="Cliente"
          placeholder="Nombre del cliente"
        />
      </div>

      {/* El teléfono sólo si es alguien nuevo: al que ya está cargado se le
          pide desde su ficha, y repetirlo acá invita a dejar dos distintos. */}
      {cliente.trim() && !clienteId && (
        <input
          value={telefono}
          inputMode="tel"
          placeholder="Teléfono (opcional)"
          aria-label="Teléfono del cliente"
          onChange={(e) => setTelefono(e.target.value)}
          className="cifra mt-2 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      )}

      <p className="mt-2 text-xs text-tinta-suave">
        Ponerle nombre NO lo fía: la venta se cobra igual. Sirve para saber
        quién compró qué.
      </p>
    </div>
  );

  const carrito =
    renglones.length === 0 ? (
      <p className="rounded-xl border border-dashed border-linea px-4 py-10 text-center text-sm text-tinta-suave">
        El carrito está vacío.
        <br />
        Pasá el primer producto por el lector.
      </p>
    ) : (
      <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-tarjeta">
        {renglones.map((renglon, i) => (
          <li
            key={llaveDe(renglon)}
            className="flex items-center gap-2 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {renglon.descripcion}
              </span>
              {renglon.precioUnitarioCentavos > 0 ? (
                <span className="cifra block text-xs text-tinta-suave">
                  {formatearCentavos(renglon.precioUnitarioCentavos)} c/u
                </span>
              ) : (
                <input
                  value={precios[llaveDe(renglon)] ?? ""}
                  inputMode="decimal"
                  autoFocus
                  placeholder="precio"
                  aria-label={"Precio de " + renglon.descripcion}
                  onChange={(e) => ponerPrecio(renglon, e.target.value)}
                  className="cifra mt-1 w-24 rounded-lg border border-deuda bg-white px-2 py-1 text-xs"
                />
              )}
            </span>

            {/* El más y el menos son de dedo: en el mostrador se corrige una
                cantidad sin mirar, y un campo de texto obliga a apuntar. */}
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={"Uno menos de " + renglon.descripcion}
                onClick={() =>
                  setRenglones((p) =>
                    cambiarCantidad(p, i, renglon.cantidad - 1),
                  )
                }
                className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
              >
                −
              </button>
              <span className="cifra w-7 text-center text-sm">
                {renglon.cantidad}
              </span>
              <button
                type="button"
                aria-label={"Uno más de " + renglon.descripcion}
                onClick={() =>
                  setRenglones((p) =>
                    cambiarCantidad(p, i, renglon.cantidad + 1),
                  )
                }
                className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
              >
                +
              </button>
            </span>

            <span className="cifra w-24 shrink-0 text-right text-sm font-medium">
              {formatearCentavos(
                renglon.precioUnitarioCentavos * renglon.cantidad,
              )}
            </span>

            <button
              type="button"
              aria-label={"Sacar " + renglon.descripcion}
              onClick={() => setRenglones((p) => sacar(p, i))}
              className="shrink-0 px-1 text-lg leading-none text-tinta-suave"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    /*
     * Dos columnas: a la izquierda lo que se BUSCA, a la derecha lo que se
     * ACUMULA. En una sola columna el carrito empujaba el buscador fuera de la
     * pantalla justo en la venta larga, que es la única donde el carrito sirve.
     * En el celular se apilan, con el buscador arriba porque es donde está la
     * mano.
     */
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {buscador}
        {fichaCliente}
      </div>

      <div className="space-y-3">
        {carrito}

        {renglones.length > 0 && (
          <>
            <div className="rounded-xl bg-papel-hondo px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-tinta-suave">
                  {unidades === 1 ? "1 producto" : `${unidades} productos`}
                </span>
                <span className="cifra text-3xl font-medium text-pago">
                  {formatearCentavos(total)}
                </span>
              </div>
              {ganancia.centavos > 0 && (
                <p className="mt-1 text-right text-xs text-tinta-suave">
                  deja{" "}
                  <span className="cifra">
                    {formatearCentavos(ganancia.centavos)}
                  </span>
                  {/* Con un renglón sin costo, lo que se puede calcular es
                      MENOS que lo real: decirlo evita leerlo como el final. */}
                  {!ganancia.completa && " (de lo que tiene costo cargado)"}
                </p>
              )}
            </div>

            <RepartoDePago
              montos={montos}
              alCambiar={setMontos}
              totalCentavos={total}
            />
          </>
        )}

        {error && (
          <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={cobrar}
          disabled={guardando || renglones.length === 0}
          className="w-full rounded-full bg-acento px-5 py-3 text-base font-medium text-white disabled:opacity-45"
        >
          {guardando
            ? "Cobrando…"
            : total > 0
              ? `Cobrar ${formatearCentavos(total)}`
              : "Cobrar"}
        </button>
      </div>
    </div>
  );
}
