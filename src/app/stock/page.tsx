import type { Metadata } from "next";
import { FormProducto } from "@/components/AccionesStock";
import TablaStock from "@/components/TablaStock";
import { listarMarcas, listarStock, type FilaStock } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stock — El Osito" };

export default async function Stock() {
  const [filas, marcas] = await Promise.all([listarStock(), listarMarcas()]);
  const faltantes = filas.filter((f) => f.falta);

  // Siempre agrupado por marca: es como se compra y como se piensa la góndola.
  // Los que no tienen van juntos al final, porque el pan no tiene marca y no
  // por eso deja de estar en la lista.
  const porNombreDeMarca = new Map<string, FilaStock[]>();
  const sinMarca: FilaStock[] = [];
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
  // escalera de tamaños uno abajo del otro.
  for (const lista of porNombreDeMarca.values()) {
    lista.sort((a, b) => (a.contenido ?? 0) - (b.contenido ?? 0));
  }

  const marcasOrdenadas = [...porNombreDeMarca.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "es"),
  );

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

      {filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay productos. La lista se llena sola: cada renglón con
          nombre de una compra entra acá con su último costo.
        </p>
      ) : (
        <>
          {marcasOrdenadas.map(([marca, lista]) => (
            <section
              key={marca}
              className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
            >
              <h2 className="font-display text-xl leading-none">{marca}</h2>
              <div className="mt-2">
                <TablaStock filas={lista} marcas={marcas} />
              </div>
            </section>
          ))}

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
      )}
    </div>
  );
}
