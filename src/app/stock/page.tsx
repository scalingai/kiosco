import Link from "next/link";
import type { Metadata } from "next";
import { FormProducto } from "@/components/AccionesStock";
import TablaStock from "@/components/TablaStock";
import { listarMarcas, listarStock, type FilaStock } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stock — El Osito" };

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

  // Los que tienen marca se agrupan; los sueltos van juntos al final, porque
  // el pan no tiene marca y no por eso deja de estar en la lista.
  const porNombreDeMarca = new Map<string, FilaStock[]>();
  const sinMarca: FilaStock[] = [];
  if (porMarca) {
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
          Qué se vende, a quién se le compra, a cuánto sale y cuánto deja. No
          lleva la cuenta de cuántas unidades quedan: lo que se marca a mano es
          lo que falta. Tocá una fila para editarla.
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
          <p className="mt-2 text-sm">
            {faltantes.map((f) => f.nombre).join(" · ")}
          </p>
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

      {porMarca ? (
        <>
          {[...porNombreDeMarca.entries()].map(([marca, lista]) => {
            const barato = idMasBarato(lista);
            return (
              <section
                key={marca}
                className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl leading-none">{marca}</h2>
                  {barato && (
                    <span className="text-xs text-pago">
                      el más barato por medida:{" "}
                      {lista.find((f) => f.id === barato)!.nombre}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <TablaStock filas={lista} marcas={marcas} />
                </div>
              </section>
            );
          })}

          {sinMarca.length > 0 && (
            <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
              <h2 className="font-display text-xl leading-none">Sin marca</h2>
              <p className="mt-1 text-xs text-tinta-suave">
                Tocá uno y ponele la marca para que se agrupe.
              </p>
              <div className="mt-2">
                <TablaStock filas={sinMarca} marcas={marcas} />
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
          <h2 className="font-display text-xl leading-none">Productos</h2>
          <div className="mt-2">
            <TablaStock filas={filas} marcas={marcas} />
          </div>
        </section>
      )}
    </div>
  );
}
