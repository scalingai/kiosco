"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { normalizarNombre } from "@/lib/nombres";

export type Opcion = {
  id: string;
  nombre: string;
  /** una segunda línea chiquita: la marca del producto, el saldo del cliente */
  detalle?: string;
};

/**
 * Cuántas filas se dibujan como mucho. Con 378 productos y el campo vacío,
 * pintarlas todas cuelga la lista en un celular y encima no sirve: nadie
 * elige de una lista de 378. Se muestran las primeras y se avisa que hay más,
 * que es la señal de "seguí escribiendo".
 */
const MAXIMO = 40;

/**
 * El campo para elegir algo que ya existe —un proveedor, una marca, un
 * producto, un cliente— o crearlo escribiéndolo.
 *
 * Reemplaza al `<datalist>` nativo, que parecía la opción obvia y tenía tres
 * problemas: lo dibuja el sistema operativo y no se puede estilar (en Windows
 * salía un cuadro negro), filtra comparando el texto crudo —así que "coca
 * cola" no encontraba "Coca-Cola"— y, sobre todo, **no distingue elegir de
 * crear**: escribías cualquier cosa y no había forma de saber si eso ya
 * existía o estabas por dar de alta algo nuevo.
 *
 * Acá el alta es explícita: si lo que escribiste no coincide con nada, la
 * última fila lo dice con todas las letras. Ese cartel es la única defensa
 * contra terminar con "Coca Cola", "coca-cola" y "Coca Cola SA" como tres
 * proveedores distintos.
 *
 * Compara con `normalizarNombre()`, el mismo que usa la base para su índice
 * único. Que el filtro de la pantalla y la regla del servidor sean la misma
 * función es lo que hace que lo que ves sea lo que va a pasar: si acá dice
 * "ya existe", el insert de allá lo va a encontrar.
 */
export default function SelectorNombre({
  valor,
  alCambiar,
  opciones,
  queEs,
  placeholder,
  autoFocus,
  etiquetaAria,
  permitirCrear = true,
  className,
}: {
  valor: string;
  /** `id` viene con algo sólo cuando se eligió uno que ya existía */
  alCambiar: (nombre: string, id: string | null) => void;
  opciones: Opcion[];
  /** el sustantivo en singular, para el cartel de alta: "proveedor" */
  queEs: string;
  placeholder?: string;
  autoFocus?: boolean;
  etiquetaAria?: string;
  /** el campo de marca de un producto puede quedar vacío y no crear nada */
  permitirCrear?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [caja, setCaja] = useState<{
    left: number;
    ancho: number;
    top: number | null;
    bottom: number | null;
  } | null>(null);

  const contenedor = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const buscado = normalizarNombre(valor);

  /*
   * El orden importa más que el filtro. Con "coca" escrito, "Coca-Cola 600 ml"
   * tiene que estar arriba de "Pack Coca-Cola", aunque las dos contengan la
   * palabra. Se ordena por qué tan al principio aparece lo que escribiste.
   */
  const { filtradas, sobran } = useMemo(() => {
    if (!buscado) {
      return {
        filtradas: opciones.slice(0, MAXIMO),
        sobran: Math.max(0, opciones.length - MAXIMO),
      };
    }

    const puntuadas: { opcion: Opcion; puntaje: number }[] = [];
    for (const opcion of opciones) {
      const nombre = normalizarNombre(opcion.nombre);
      if (nombre === buscado) puntuadas.push({ opcion, puntaje: 0 });
      else if (nombre.startsWith(buscado)) puntuadas.push({ opcion, puntaje: 1 });
      // Una palabra que arranca con lo escrito: "coca" encuentra "Lata coca".
      else if (nombre.includes(" " + buscado))
        puntuadas.push({ opcion, puntaje: 2 });
      else if (nombre.includes(buscado)) puntuadas.push({ opcion, puntaje: 3 });
    }

    puntuadas.sort(
      (a, b) =>
        a.puntaje - b.puntaje || a.opcion.nombre.localeCompare(b.opcion.nombre),
    );

    return {
      filtradas: puntuadas.slice(0, MAXIMO).map((p) => p.opcion),
      sobran: Math.max(0, puntuadas.length - MAXIMO),
    };
  }, [opciones, buscado]);

  // Que exista ya con otra escritura ("coca cola" contra "Coca-Cola") cuenta
  // como que existe: es exactamente lo que va a decidir el índice de la base.
  const yaExiste = useMemo(
    () => opciones.some((o) => normalizarNombre(o.nombre) === buscado),
    [opciones, buscado],
  );
  const puedeCrear = permitirCrear && buscado.length > 0 && !yaExiste;
  const filas = filtradas.length + (puedeCrear ? 1 : 0);

  /** Dónde dibujar la lista. Se mide cada vez porque la hoja se puede scrollear. */
  const medir = useCallback(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    const r = nodo.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom;
    // Si abajo no entra y arriba entra mejor, se abre para arriba. Pasa siempre
    // con el último campo de un formulario largo.
    const paraArriba = abajo < 200 && r.top > abajo;

    setCaja({
      left: r.left,
      ancho: r.width,
      top: paraArriba ? null : r.bottom + 4,
      bottom: paraArriba ? window.innerHeight - r.top + 4 : null,
    });
  }, []);

  useEffect(() => {
    if (!abierto) return;
    medir();

    // `true` para escuchar el scroll de la hoja, que no burbujea.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [abierto, medir]);

  // La lista vive en un portal, así que un click adentro NO es un click adentro
  // del contenedor: hay que preguntarle a los dos.
  useEffect(() => {
    if (!abierto) return;

    const alTocarAfuera = (e: MouseEvent) => {
      const destino = e.target as Node;
      if (contenedor.current?.contains(destino)) return;
      if (lista.current?.contains(destino)) return;
      setAbierto(false);
    };

    document.addEventListener("mousedown", alTocarAfuera);
    return () => document.removeEventListener("mousedown", alTocarAfuera);
  }, [abierto]);

  // Con el teclado, la fila marcada tiene que verse aunque esté fuera de vista.
  useEffect(() => {
    if (!abierto) return;
    lista.current
      ?.querySelector('[data-resaltada="si"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [resaltado, abierto]);

  const elegir = (opcion: Opcion) => {
    alCambiar(opcion.nombre, opcion.id);
    setAbierto(false);
    entrada.current?.focus();
  };

  const crear = () => {
    // Se guarda lo tecleado tal cual, con mayúsculas y acentos. Lo normalizado
    // es para comparar, no para mostrar: el cartel de la góndola dice
    // "Coca-Cola", no "coca cola".
    alCambiar(valor.trim(), null);
    setAbierto(false);
    entrada.current?.focus();
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setResaltado(0);
        return;
      }
      if (!filas) return;
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setResaltado((previo) => (previo + paso + filas) % filas);
      return;
    }

    if (e.key === "Enter") {
      if (!abierto || !filas) return;
      // Sin esto el Enter manda el formulario con la lista abierta.
      e.preventDefault();
      if (resaltado < filtradas.length) elegir(filtradas[resaltado]);
      else if (puedeCrear) crear();
      return;
    }

    if (e.key === "Escape" && abierto) {
      // No dejar que cierre además la hoja entera.
      e.stopPropagation();
      setAbierto(false);
      return;
    }

    if (e.key === "Tab") setAbierto(false);
  };

  const desplegable = abierto && caja && filas > 0 && (
    <ul
      ref={lista}
      id={idLista}
      role="listbox"
      style={{
        position: "fixed",
        left: caja.left,
        width: caja.ancho,
        ...(caja.top != null ? { top: caja.top } : { bottom: caja.bottom! }),
      }}
      className="z-[60] max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-linea bg-papel py-1 shadow-xl"
    >
      {filtradas.map((opcion, i) => (
        <li
          key={opcion.id}
          role="option"
          aria-selected={i === resaltado}
          data-resaltada={i === resaltado ? "si" : "no"}
          // `mousedown` en vez de `click`: el click llega después del blur, y
          // para entonces la lista ya se cerró y el item no existe.
          onMouseDown={(e) => {
            e.preventDefault();
            elegir(opcion);
          }}
          onMouseEnter={() => setResaltado(i)}
          className={
            "cursor-pointer px-3 py-2 text-sm " +
            (i === resaltado ? "bg-papel-hondo" : "")
          }
        >
          <span className="block truncate">{opcion.nombre}</span>
          {opcion.detalle && (
            <span className="block truncate text-xs text-tinta-suave">
              {opcion.detalle}
            </span>
          )}
        </li>
      ))}

      {sobran > 0 && (
        <li className="px-3 py-2 text-xs text-tinta-suave">
          y {sobran} más — seguí escribiendo
        </li>
      )}

      {puedeCrear && (
        <li
          role="option"
          aria-selected={resaltado === filtradas.length}
          data-resaltada={resaltado === filtradas.length ? "si" : "no"}
          onMouseDown={(e) => {
            e.preventDefault();
            crear();
          }}
          onMouseEnter={() => setResaltado(filtradas.length)}
          className={
            "cursor-pointer px-3 py-2 text-sm " +
            (filtradas.length ? "mt-1 border-t border-linea " : "") +
            (resaltado === filtradas.length ? "bg-papel-hondo" : "")
          }
        >
          <span className="block truncate">
            Crear <strong className="font-medium">{valor.trim()}</strong>
          </span>
          <span className="block text-xs text-tinta-suave">
            {queEs} nuevo, no estaba en la lista
          </span>
        </li>
      )}
    </ul>
  );

  return (
    <div ref={contenedor} className="relative">
      <input
        ref={entrada}
        value={valor}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={etiquetaAria}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          // Al escribir se suelta el id: lo que hay en el campo dejó de ser el
          // que estaba elegido. Sin esto queda apuntando a otro registro.
          alCambiar(e.target.value, null);
          setAbierto(true);
          setResaltado(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={alTeclear}
        className={
          className ??
          "w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        }
      />

      {/* Al body, porque la hoja tiene overflow-hidden y acá adentro se cortaría. */}
      {typeof document !== "undefined" &&
        desplegable &&
        createPortal(desplegable, document.body)}
    </div>
  );
}
