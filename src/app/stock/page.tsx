import Link from "next/link";
import type { Metadata } from "next";
import {
  BotonArchivar,
  BotonFalta,
  FormProducto,
} from "@/components/AccionesStock";
import FichaProducto from "@/components/FichaProducto";
import { fechaCorta } from "@/lib/fechas";
import { formatearContenido } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import { listarMarcas, listarStock, type FilaStock } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stock — El Osito" };

type Marca = { id: string; nombre: string };

/**
 * De quién es y a quién se le compra. La marca y el proveedor se llaman igual
 * más seguido de lo que parece —Coca-Cola fabrica y también reparte—, y
 * escribirlo dos veces no agrega nada.
 */
function procedencia(fila: FilaStock): string {
  const proveedor = fila.proveedor ?? "sin proveedor";
  if (!fila.marca || fila.marca === fila.proveedor) return proveedor;
  return `${fila.marca} · ${proveedor}`;
}

/**
 * Una fila del catálogo. Se abre para editar la marca y el contenido, que son
 * los dos datos que la app no puede sacar sola de una factura.
 */
function Producto({
  fila,
  marcas,
  masBarato,
}: {
  fila: FilaStock;
  marcas: Marca[];
  /** dentro de su marca, es el que sale más barato por litro o por kilo */
  masBarato?: boolean;
}) {
  return (
    <details className="py-2.5">
      <summary className="cursor-pointer list-none">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {fila.nombre}
              {fila.contenido != null && fila.contenidoUnidad != null && (
                <span className="ml-2 text-xs font-normal text-tinta-suave">
                  {formatearContenido(fila.contenido, fila.contenidoUnidad)}
                </span>
              )}
            </span>
            <span className="text-xs text-tinta-suave">
              {procedencia(fila)}
              {fila.ultimaCompra && ` · ${fechaCorta(fila.ultimaCompra)}`}
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span className="cifra block text-sm">
              {fila.costoCentavos != null ? (
                <>
                  {formatearCentavos(fila.costoCentavos)}{" "}
                  <span className="text-xs font-normal text-tinta-suave">
                    {fila.porCada}
                  </span>
                </>
              ) : (
                "—"
              )}
            </span>
            {/* El precio por litro es el único con el que se comparan dos
                tamaños; por eso va al lado del precio por botella y no en vez de. */}
            {fila.porContenidoCentavos != null && (
              <span className="cifra block text-xs text-tinta-suave">
                {formatearCentavos(fila.porContenidoCentavos)}{" "}
                {fila.porContenido}
              </span>
            )}
          </span>
        </span>

        {masBarato && (
          <span className="mt-1 inline-block rounded-full bg-pago-tenue px-2 py-0.5 text-xs text-pago">
            el más barato por {fila.porContenido?.replace("el ", "")} de la marca
          </span>
        )}
      </summary>

      <div className="border-l border-linea pl-3">
        <FichaProducto
          id={fila.id}
          nombre={fila.nombre}
          marca={fila.marca}
          contenido={fila.contenido}
          contenidoUnidad={fila.contenidoUnidad}
          marcas={marcas}
        />
        <div className="mt-2 flex items-center gap-3">
          <BotonFalta id={fila.id} falta={fila.falta} />
          <BotonArchivar id={fila.id} />
        </div>
      </div>
    </details>
  );
}

/**
 * Marca el más barato por litro o kilo dentro de un conjunto. Sólo compara los
 * que se miden igual: poner en la misma carrera "$X el litro" y "$X el kilo"
 * daría un ganador inventado.
 */
function idMasBarato(filas: FilaStock[]): string | null {
  const comparables = filas.filter((f) => f.porContenidoCentavos != null);
  if (comparables.length < 2) return null;
  const unidad = comparables[0].porContenido;
  if (comparables.some((f) => f.porContenido !== unidad)) return null;
  return comparables.reduce((mejor, f) =>
    f.porContenidoCentavos! < mejor.porContenidoCentavos! ? f : mejor,
  ).id;
}

export default async function Stock({ searchParams }: PageProps<"/stock">) {
  const params = await searchParams;
  const valor = params.por;
  const porMarca = (Array.isArray(valor) ? valor[0] : valor) === "marca";

  const [filas, marcas] = await Promise.all([listarStock(), listarMarcas()]);
  const faltantes = filas.filter((f) => f.falta);
  const resto = filas.filter((f) => !f.falta);

  // Los que tienen marca se agrupan; los sueltos van juntos al final, porque
  // el pan no tiene marca y no por eso deja de estar en la lista.
  const porNombreDeMarca = new Map<string, FilaStock[]>();
  const sinMarca: FilaStock[] = [];
  if (porMarca) {
    // Acá van TODOS, faltantes incluidos: el que falta es justo el que se
    // quiere comparar con los otros tamaños antes de salir a comprarlo. El
    // panel de arriba sigue siendo la lista corta de lo accionable.
    for (const fila of filas) {
      if (!fila.marca) {
        sinMarca.push(fila);
        continue;
      }
      const lista = porNombreDeMarca.get(fila.marca) ?? [];
      lista.push(fila);
      porNombreDeMarca.set(fila.marca, lista);
    }
    // Dentro de la marca, del envase más chico al más grande: así se ve la
    // escalera de tamaños y cuál conviene.
    for (const lista of porNombreDeMarca.values()) {
      lista.sort((a, b) => (a.contenido ?? 0) - (b.contenido ?? 0));
    }
  }

  const chip = (activo: boolean) =>
    "rounded-full border px-3 py-1.5 text-xs " +
    (activo
      ? "border-acento bg-acento text-white"
      : "border-linea bg-white/70 text-tinta");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Stock</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Qué se vende, a quién se le compra y a cuánto salió la última vez. No
          lleva la cuenta de cuántas unidades quedan: lo que se marca a mano es
          lo que falta.
        </p>
      </div>

      <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
        <FormProducto />
      </section>

      {faltantes.length > 0 && (
        <section className="rounded-2xl border border-linea bg-deuda-tenue px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl leading-none text-deuda">
              Falta comprar
            </h2>
            <span className="text-sm text-deuda">
              {faltantes.length === 1
                ? "1 producto"
                : faltantes.length + " productos"}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-linea">
            {faltantes.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {f.nombre}
                    {f.contenido != null && f.contenidoUnidad != null && (
                      <span className="ml-2 text-xs font-normal text-tinta-suave">
                        {formatearContenido(f.contenido, f.contenidoUnidad)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-tinta-suave">
                    {procedencia(f)}
                    {f.costoCentavos != null && (
                      <>
                        {" · "}
                        <span className="cifra">
                          {formatearCentavos(f.costoCentavos)}
                        </span>{" "}
                        {f.porCada}
                      </>
                    )}
                  </span>
                </span>
                <BotonFalta id={f.id} falta />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <Link href="/stock" className={chip(!porMarca)}>
          Sin agrupar
        </Link>
        <Link href="/stock?por=marca" className={chip(porMarca)}>
          Por marca
        </Link>
      </div>

      {(porMarca ? filas : resto).length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay nada. La lista se llena sola: cada renglón con nombre de
          una compra entra acá con su último costo.
        </p>
      ) : porMarca ? (
        <>
          {[...porNombreDeMarca.entries()].map(([marca, lista]) => {
            const barato = idMasBarato(lista);
            return (
              <section
                key={marca}
                className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
              >
                <h2 className="font-display text-xl leading-none">{marca}</h2>
                <p className="mt-1 text-xs text-tinta-suave">
                  {lista.length === 1
                    ? "1 producto"
                    : `${lista.length} productos`}
                </p>
                <div className="mt-2 divide-y divide-linea border-t border-linea">
                  {lista.map((fila) => (
                    <Producto
                      key={fila.id}
                      fila={fila}
                      marcas={marcas}
                      masBarato={fila.id === barato}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {sinMarca.length > 0 && (
            <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
              <h2 className="font-display text-xl leading-none">Sin marca</h2>
              <p className="mt-1 text-xs text-tinta-suave">
                Abrí uno y ponele la marca para que se agrupe.
              </p>
              <div className="mt-2 divide-y divide-linea border-t border-linea">
                {sinMarca.map((fila) => (
                  <Producto key={fila.id} fila={fila} marcas={marcas} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
          <h2 className="font-display text-xl leading-none">
            {faltantes.length > 0 ? "El resto" : "Productos"}
          </h2>
          <div className="mt-2 divide-y divide-linea border-t border-linea">
            {resto.map((fila) => (
              <Producto key={fila.id} fila={fila} marcas={marcas} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
