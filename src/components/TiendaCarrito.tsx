"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";
import { dejarPedido } from "@/app/tienda/acciones";
import { formatearCentavos } from "@/lib/plata";
import type { ProductoEnVidriera } from "@/lib/tienda";

export type RenglonTienda = {
  producto: ProductoEnVidriera;
  cantidad: number;
};

type Carrito = {
  renglones: RenglonTienda[];
  total: number;
  unidades: number;
  agregar: (producto: ProductoEnVidriera) => void;
  cambiar: (id: string, cantidad: number) => void;
  vaciar: () => void;
  cuantos: (id: string) => number;
  abrir: () => void;
};

const Contexto = createContext<Carrito | null>(null);

export function useCarrito(): Carrito {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("Falta envolver con <TiendaCarrito>");
  return valor;
}

/** Dónde se guarda entre visitas. */
const LLAVE = "osito_carrito";

/* ── El carrito guardado, como almacén externo ──────────────────────────────
 *
 * Va con `useSyncExternalStore` y no con un `useEffect` que llama a
 * `setState`, que es como se escribía esto antes. Dos razones:
 *
 *  - En el servidor no hay `localStorage`, así que la primera pasada tiene que
 *    dar vacío sí o sí. `getServerSnapshot` es exactamente eso, y React sabe
 *    reconciliar las dos pasadas sin tirar un error de hidratación.
 *  - De yapa, escuchar `storage` sincroniza las pestañas: quien arma el pedido
 *    en dos ventanas no termina con dos carritos distintos.
 *
 * `cache` existe porque `getSnapshot` tiene que devolver SIEMPRE la misma
 * referencia mientras nada cambie: si parseara el JSON en cada llamada,
 * devolvería un array nuevo cada vez y React volvería a dibujar para siempre.
 */
let cache: RenglonTienda[] = [];
let cacheCrudo: string | null = null;
const VACIO: RenglonTienda[] = [];
const oyentes = new Set<() => void>();

function leerGuardado(): RenglonTienda[] {
  let crudo: string | null = null;
  try {
    crudo = window.localStorage.getItem(LLAVE);
  } catch {
    /* modo privado o sin permiso: el carrito vive sólo en memoria */
    return cache;
  }
  if (crudo === cacheCrudo) return cache;
  cacheCrudo = crudo;
  try {
    cache = crudo ? (JSON.parse(crudo) as RenglonTienda[]) : [];
  } catch {
    // Un carrito ilegible se descarta: no vale romper la tienda por eso.
    cache = [];
  }
  return cache;
}

function guardar(renglones: RenglonTienda[]) {
  cache = renglones;
  try {
    cacheCrudo = JSON.stringify(renglones);
    window.localStorage.setItem(LLAVE, cacheCrudo);
  } catch {
    /* sin espacio: sigue andando, sólo que no sobrevive al cierre */
  }
  for (const avisar of oyentes) avisar();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  // `storage` sólo lo disparan las OTRAS pestañas, que es justo lo que falta.
  const deOtraPestana = () => {
    cacheCrudo = null;
    avisar();
  };
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", deOtraPestana);
  };
}

/**
 * El carrito de la tienda.
 *
 * Vive en el navegador y no en el servidor: quien mira la tienda no tiene
 * cuenta ni sesión, así que no hay a quién colgarle un carrito. Se guarda en
 * `localStorage` para que no se pierda al cerrar la pestaña — el que arma un
 * pedido grande lo hace en dos ratos.
 *
 * Lo que se guarda es el producto entero y no sólo su id, para poder dibujar
 * el carrito sin volver a pedir nada. El precio de ahí adentro es SÓLO para
 * mostrar: al confirmar, el servidor lo vuelve a leer de la base. Un precio
 * que viaja desde el navegador es un precio que el cliente puede elegir.
 */
export default function TiendaCarrito({
  children,
}: {
  children: React.ReactNode;
}) {
  const renglones = useSyncExternalStore(suscribir, leerGuardado, () => VACIO);
  const [abierto, setAbierto] = useState(false);

  const agregar = useCallback((producto: ProductoEnVidriera) => {
    const previo = leerGuardado();
    const i = previo.findIndex((r) => r.producto.id === producto.id);
    guardar(
      i === -1
        ? [...previo, { producto, cantidad: 1 }]
        : previo.map((r, n) =>
            n === i ? { ...r, cantidad: r.cantidad + 1 } : r,
          ),
    );
  }, []);

  const cambiar = useCallback((id: string, cantidad: number) => {
    const previo = leerGuardado();
    guardar(
      cantidad <= 0
        ? previo.filter((r) => r.producto.id !== id)
        : previo.map((r) => (r.producto.id === id ? { ...r, cantidad } : r)),
    );
  }, []);

  const vaciar = useCallback(() => guardar([]), []);

  const valor = useMemo<Carrito>(() => {
    const total = renglones.reduce(
      (suma, r) => suma + r.producto.precioCentavos * r.cantidad,
      0,
    );
    const unidades = renglones.reduce((suma, r) => suma + r.cantidad, 0);
    return {
      renglones,
      total,
      unidades,
      agregar,
      cambiar,
      vaciar,
      cuantos: (id) =>
        renglones.find((r) => r.producto.id === id)?.cantidad ?? 0,
      abrir: () => setAbierto(true),
    };
  }, [renglones, agregar, cambiar, vaciar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Cajon abierto={abierto} cerrar={() => setAbierto(false)} />
    </Contexto.Provider>
  );
}

/* ── El cajón: el carrito y el checkout ─────────────────────────────────── */

function Cajon({
  abierto,
  cerrar,
}: {
  abierto: boolean;
  cerrar: () => void;
}) {
  const { renglones, total, cambiar, vaciar } = useCarrito();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrega, setEntrega] = useState<"retiro" | "envio">("retiro");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [numero, setNumero] = useState<number | null>(null);

  // Con el cajón abierto, el fondo no se scrollea: si no, al mover el dedo
  // adentro del cajón se mueve la lista de atrás y se pierde el lugar.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alEscapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alEscapar);
    return () => document.removeEventListener("keydown", alEscapar);
  }, [abierto, cerrar]);

  if (!abierto) return null;

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (!nombre.trim()) return setError("Poné tu nombre.");
    if (!telefono.trim()) return setError("Dejá un teléfono para avisarte.");
    if (entrega === "envio" && !direccion.trim()) {
      return setError("Para el envío hace falta la dirección.");
    }

    setEnviando(true);
    const respuesta = await dejarPedido({
      nombre,
      telefono,
      entrega,
      direccion,
      nota,
      // Sólo qué y cuánto: el precio lo pone el servidor.
      renglones: renglones.map((r) => ({
        productoId: r.producto.id,
        cantidad: r.cantidad,
      })),
    });
    setEnviando(false);

    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    setNumero(respuesta.numero);
    vaciar();
  }

  const campo =
    "mt-1 w-full rounded-xl border border-linea bg-white px-3 py-2.5 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar el carrito"
        onClick={cerrar}
        className="absolute inset-0 bg-tinta/40"
      />

      <aside
        role="dialog"
        aria-label="Tu pedido"
        className="relative flex h-full w-full max-w-md flex-col bg-papel shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-linea px-5 py-4">
          <h2 className="font-display text-xl font-semibold leading-none">
            {numero != null ? "Pedido tomado" : "Tu pedido"}
          </h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="-mr-2 px-2.5 py-1 text-2xl leading-none text-tinta-suave"
          >
            ×
          </button>
        </header>

        {numero != null ? (
          /* La confirmación, con el número grande: es lo que el cliente
             repite por teléfono cuando llama a preguntar. */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-tinta-suave">Tu número de pedido</p>
            <p className="cifra text-6xl font-medium text-pago">{numero}</p>
            <p className="max-w-xs text-sm text-tinta-suave">
              Te vamos a escribir al {telefono} para confirmarte. Guardá este
              número.
            </p>
            <button
              type="button"
              onClick={() => {
                setNumero(null);
                cerrar();
              }}
              className="mt-2 rounded-full bg-acento px-6 py-2.5 text-sm font-medium text-white"
            >
              Listo
            </button>
          </div>
        ) : renglones.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <p className="text-center text-sm text-tinta-suave">
              Todavía no agregaste nada.
            </p>
          </div>
        ) : (
          <form
            onSubmit={confirmar}
            className="flex min-h-0 flex-1 flex-col"
          >
            <ul className="min-h-0 flex-1 divide-y divide-linea overflow-y-auto px-5">
              {renglones.map((r) => (
                <li key={r.producto.id} className="flex items-center gap-3 py-3">
                  {r.producto.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.producto.imagenUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-papel-hondo text-sm text-tinta-suave">
                      {r.producto.nombre.charAt(0).toUpperCase()}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug">
                      {r.producto.nombre}
                    </span>
                    <span className="cifra block text-xs text-tinta-suave">
                      {formatearCentavos(r.producto.precioCentavos)} c/u
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={"Uno menos de " + r.producto.nombre}
                      onClick={() => cambiar(r.producto.id, r.cantidad - 1)}
                      className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
                    >
                      −
                    </button>
                    <span className="cifra w-6 text-center text-sm">
                      {r.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label={"Uno más de " + r.producto.nombre}
                      onClick={() => cambiar(r.producto.id, r.cantidad + 1)}
                      className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-3 border-t border-linea px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-tinta-suave">Total</span>
                <span className="cifra text-2xl font-medium text-pago">
                  {formatearCentavos(total)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { valor: "retiro", texto: "Lo paso a buscar" },
                    { valor: "envio", texto: "Que me lo manden" },
                  ] as const
                ).map((opcion) => (
                  <button
                    key={opcion.valor}
                    type="button"
                    aria-pressed={entrega === opcion.valor}
                    onClick={() => setEntrega(opcion.valor)}
                    className={
                      "rounded-xl border px-3 py-2.5 text-sm transition-colors " +
                      (entrega === opcion.valor
                        ? "border-acento bg-acento text-white"
                        : "border-linea bg-white text-tinta")
                    }
                  >
                    {opcion.texto}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-tinta-suave">Tu nombre</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className={campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Teléfono</span>
                  <input
                    value={telefono}
                    inputMode="tel"
                    onChange={(e) => setTelefono(e.target.value)}
                    className={"cifra " + campo}
                  />
                </label>
              </div>

              {entrega === "envio" && (
                <label className="block">
                  <span className="text-xs text-tinta-suave">Dirección</span>
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Calle, número, piso"
                    className={campo}
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs text-tinta-suave">
                  Alguna aclaración
                </span>
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="opcional"
                  className={campo}
                />
              </label>

              {error && (
                <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-full bg-acento px-5 py-3 text-base font-medium text-white disabled:opacity-45"
              >
                {enviando ? "Mandando…" : "Hacer el pedido"}
              </button>

              <p className="text-center text-xs text-tinta-suave">
                No se paga nada ahora. Te escribimos para confirmarte.
              </p>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
