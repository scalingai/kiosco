import type { Metadata } from "next";
import { FormProducto } from "@/components/AccionesStock";
import TablaStock from "@/components/TablaStock";
import {
  listarMarcas,
  listarStock,
  listarSubcategorias,
  type FilaStock,
} from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stock — El Osito" };

const SIN_RUBRO = "Sin rubro";

/**
 * Arma el árbol para dibujarlo: categoría › subcategoría › productos.
 *
 * Los que no tienen rubro no se esconden: van juntos al final, porque un
 * producto sin clasificar sigue siendo un producto que se vende y esconderlo
 * es la forma más rápida de que nunca se clasifique.
 */
function armarArbol(filas: FilaStock[]) {
  const arbol = new Map<string, Map<string, FilaStock[]>>();

  for (const fila of filas) {
    const categoria = fila.categoria ?? SIN_RUBRO;
    const subcategoria = fila.subcategoria ?? SIN_RUBRO;
    const subs = arbol.get(categoria) ?? new Map<string, FilaStock[]>();
    const lista = subs.get(subcategoria) ?? [];
    lista.push(fila);
    subs.set(subcategoria, lista);
    arbol.set(categoria, subs);
  }

  // Dentro de cada subcategoría: por marca y, adentro de la marca, del envase
  // más chico al más grande. Así los tamaños de lo mismo quedan uno abajo del
  // otro y se ve la escalera de precios.
  for (const subs of arbol.values()) {
    for (const lista of subs.values()) {
      lista.sort(
        (a, b) =>
          (a.marca ?? "").localeCompare(b.marca ?? "", "es") ||
          (a.contenido ?? 0) - (b.contenido ?? 0) ||
          a.nombre.localeCompare(b.nombre, "es"),
      );
    }
  }

  const ordenar = (a: string, b: string) =>
    a === SIN_RUBRO ? 1 : b === SIN_RUBRO ? -1 : a.localeCompare(b, "es");

  return [...arbol.entries()]
    .sort(([a], [b]) => ordenar(a, b))
    .map(([categoria, subs]) => ({
      categoria,
      subcategorias: [...subs.entries()]
        .sort(([a], [b]) => ordenar(a, b))
        .map(([subcategoria, productos]) => ({ subcategoria, productos })),
    }));
}

export default async function Stock() {
  const [filas, marcas, categorias] = await Promise.all([
    listarStock(),
    listarMarcas(),
    listarSubcategorias(),
  ]);

  const faltantes = filas.filter((f) => f.falta);
  const arbol = armarArbol(filas);

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
        arbol.map(({ categoria, subcategorias }) => (
          <section
            key={categoria}
            className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
          >
            <h2 className="font-display text-2xl leading-none">{categoria}</h2>

            {subcategorias.map(({ subcategoria, productos }) => (
              <div key={subcategoria} className="mt-4 first:mt-3">
                {/* La subcategoría no se repite cuando es la única y se llama
                    igual que su categoría: sería un título arriba del otro. */}
                {!(subcategorias.length === 1 && subcategoria === categoria) && (
                  <h3 className="text-xs uppercase tracking-[0.16em] text-tinta-suave">
                    {subcategoria}
                  </h3>
                )}
                <div className="mt-1">
                  <TablaStock
                    filas={productos}
                    marcas={marcas}
                    categorias={categorias}
                  />
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
