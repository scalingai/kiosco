import type { Metadata } from "next";
import CabeceraStock, { rangoDeLaUrl } from "@/components/CabeceraStock";
import Foto from "@/components/Foto";
import { FormProducto } from "@/components/AccionesStock";
import SeleccionStock from "@/components/SeleccionStock";
import TablaStock from "@/components/TablaStock";
import Tira from "@/components/Tira";
import { formatearCentavos } from "@/lib/plata";
import { contarPedidosAbiertos } from "@/lib/reposicion";
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

  /*
   * Dentro de cada subcategoría se ordena por CONTENIDO y después por marca.
   *
   * Así todas las de 2,25 L quedan una abajo de la otra sin importar la marca,
   * que es la comparación que sirve: con costo, precio y margen en columnas, la
   * pregunta es cuál de las gaseosas de 2,25 conviene tener.
   *
   * Se ordena en vez de agrupar a propósito. Agrupar por tamaño metería un
   * tercer nivel de títulos —categoría, subcategoría, tamaño— y la pantalla
   * pasaría a ser más títulos que datos. Ordenando queda el mismo bloque sin
   * ese costo, porque la columna de contenido está pegada al nombre.
   *
   * Lo que se pierde es ver junta toda una marca; para eso está la ficha del
   * proveedor en Compras.
   */
  for (const subs of arbol.values()) {
    for (const lista of subs.values()) {
      lista.sort(
        (a, b) =>
          (a.contenido ?? 0) - (b.contenido ?? 0) ||
          (a.marca ?? "").localeCompare(b.marca ?? "", "es") ||
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
        .map(([subcategoria, productos]) => ({
          subcategoria,
          productos,
          // Todas las filas del grupo comparten rubro, así que la foto es la
          // misma para todas: alcanza con mirar la primera.
          imagen: productos[0]?.imagenRubroUrl ?? null,
        })),
    }));
}

export default async function Stock({ searchParams }: PageProps<"/stock">) {
  const rango = rangoDeLaUrl(await searchParams);

  const [filas, marcas, categorias, pedidosAbiertos] = await Promise.all([
    listarStock(),
    listarMarcas(),
    listarSubcategorias(),
    contarPedidosAbiertos(),
  ]);

  const arbol = armarArbol(filas);
  const faltantes = filas.filter((f) => f.falta);

  const conPrecio = filas.filter((f) => f.precioVentaCentavos != null).length;
  const sinPrecio = filas.length - conPrecio;
  const sinFoto = filas.filter((f) => !f.imagenUrl && !f.imagenOrigenUrl).length;
  const sinCosto = filas.filter((f) => f.costoRealCentavos == null).length;

  // Comprados en el período: la compra más reciente de cada producto cae
  // adentro del rango. Con "todo" alcanza con haberse comprado alguna vez.
  const compradosEnElPeriodo = filas.filter(
    (f) =>
      f.ultimaCompra != null &&
      (rango.desde == null || f.ultimaCompra >= rango.desde) &&
      (rango.hasta == null || f.ultimaCompra <= rango.hasta),
  ).length;

  /*
   * El número grande es el margen real promedio y NO el valor del catálogo a
   * costo. Ese valor sería costo × existencias, y la app no lleva existencias
   * (ver CLAUDE.md: lo único que se marca a mano es lo que falta). Sumar el
   * costo de una unidad de cada producto daría una cifra con pinta de
   * inventario que no lo es.
   *
   * Es un promedio SIMPLE entre los productos que tienen precio y costo; no
   * está ponderado por ventas y la pantalla lo dice.
   */
  const reales = filas.filter((f) => f.margen);
  const margenPromedio =
    reales.length > 0
      ? reales.reduce((t, f) => t + f.margen!.porcentaje, 0) / reales.length
      : null;
  const gananciaMedia =
    reales.length > 0
      ? Math.round(
          reales.reduce((t, f) => t + f.margen!.gananciaCentavos, 0) /
            reales.length,
        )
      : null;

  return (
    <SeleccionStock>
      <div className="space-y-3">
        <CabeceraStock
          activa="catalogo"
          rango={rango}
          base="/stock"
          pedidosAbiertos={pedidosAbiertos}
        >
          <div className="w-64">
            <FormProducto />
          </div>
        </CabeceraStock>

        <Tira
          datos={[
            { etiqueta: "Productos", valor: filas.length, pie: "activos" },
            { etiqueta: "Con precio", valor: conPrecio, tono: "pago" },
            {
              etiqueta: "Sin precio",
              valor: sinPrecio,
              tono: sinPrecio > 0 ? "deuda" : "suave",
              pie: "no se pueden vender",
            },
            {
              etiqueta: "Sin costo",
              valor: sinCosto,
              tono: sinCosto > 0 ? "deuda" : "suave",
              pie: "nunca se compraron",
            },
            {
              etiqueta: "Sin foto",
              valor: sinFoto,
              tono: sinFoto > 0 ? "deuda" : "suave",
            },
            {
              etiqueta: "Comprados",
              valor: compradosEnElPeriodo,
              pie: rango.titulo.toLowerCase(),
            },
          ]}
          destacado={
            margenPromedio != null
              ? {
                  etiqueta: "Margen real promedio",
                  valor: Math.round(margenPromedio) + "%",
                  tono: "pago",
                  pie:
                    "deja " +
                    formatearCentavos(gananciaMedia ?? 0) +
                    " por unidad · promedio simple de " +
                    reales.length +
                    " productos con precio y costo",
                }
              : undefined
          }
        />

        {faltantes.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-linea bg-deuda-tenue px-4 py-2.5 text-sm">
            <span className="font-medium text-deuda">
              Falta comprar ({faltantes.length})
            </span>
            <span className="min-w-0">
              {faltantes.map((f) => f.nombre).join(" · ")}
            </span>
          </div>
        )}

        {filas.length === 0 ? (
          <p className="rounded-xl border border-linea bg-tarjeta px-4 py-6 text-center text-sm text-tinta-suave">
            Todavía no hay productos. La lista se llena sola: cada renglón con
            nombre de una compra entra acá con su último costo.
          </p>
        ) : (
          arbol.flatMap(({ categoria, subcategorias }) =>
            subcategorias.map(({ subcategoria, productos, imagen }) => (
              <section
                key={categoria + "/" + subcategoria}
                className="overflow-hidden rounded-xl border border-linea bg-tarjeta"
              >
                {/*
                  El encabezado del grupo: foto del rubro una sola vez, y
                  "Bebidas › Gaseosas" cuando la subcategoría no se llama igual
                  que su categoría.
                */}
                <h2 className="flex items-center gap-2 border-b border-linea bg-papel-hondo/50 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-tinta-suave">
                  {imagen && (
                    <Foto
                      fuentes={[imagen]}
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-linea"
                    />
                  )}
                  <span className="font-medium text-tinta">
                    {subcategoria === categoria
                      ? categoria
                      : categoria + " › " + subcategoria}
                  </span>
                  <span className="cifra normal-case tracking-normal">
                    {productos.length}
                  </span>
                </h2>
                <div className="px-4 pb-1">
                  <TablaStock
                    filas={productos}
                    marcas={marcas}
                    categorias={categorias}
                  />
                </div>
              </section>
            )),
          )
        )}
      </div>
    </SeleccionStock>
  );
}
