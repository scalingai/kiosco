"use client";

import Foto from "@/components/Foto";
import { useState } from "react";
import { BotonArchivar, BotonFalta } from "@/components/AccionesStock";
import FichaProducto from "@/components/FichaProducto";
import Hoja from "@/components/Hoja";
import { useSeleccion } from "@/components/SeleccionStock";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import { fechaCorta } from "@/lib/fechas";
import {
  calcularMargen,
  formatearContenidoCorto,
  formatearMultiplicador,
} from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import type { Envase, FilaStock, OpcionCategoria } from "@/lib/stock";

type Marca = { id: string; nombre: string };

/*
 * El reparto del ancho, definido UNA vez para todos los rubros.
 *
 * Cada rubro es su propia <table>, y con `table-layout: auto` cada una repartía
 * el ancho según SU contenido: el costo caía en un lugar en Aceites y en otro en
 * Aderezos, y la planilla dejaba de leerse por costumbre. Con `table-fixed` el
 * ancho sale de estas clases y no del contenido, así que todas caen en la misma x.
 * En ese modo el ancho se pone con `w-*` (un `min-w-*` lo ignora).
 *
 * «Producto» no lleva ancho: se queda con lo que sobra.
 */
const ANCHO = {
  envase: "w-20",
  proveedor: "w-28",
  costo: "w-24",
  precio: "w-24",
  margen: "w-40",
  ultima: "w-28",
} as const;

const ETIQUETA_ENVASE: Record<Envase, string> = {
  botella: "Botella",
  retornable: "Retornable",
  lata: "Lata",
  tetra: "Tetra",
  otro: "Otro",
};

/**
 * El catálogo como planilla, una tabla por rubro.
 *
 * Es la planilla que se mira de corrido: filas bajas, una sola línea por
 * producto, la plata a la derecha y en columna. Lo que explica el número va al
 * lado del número y no en un renglón de más: `+IVA` pegado al costo, `sug.`
 * pegado al precio que todavía nadie cargó.
 *
 * **El margen real y el sugerido no se mezclan.** Con precio de venta cargado,
 * el margen sale de ESE precio contra el costo de verdad (`calcularMargen`).
 * Sin precio, lo único honesto es el margen que daría el precio sugerido, y se
 * dibuja gris y con "sug." para que no se lea como una ganancia que ya existe.
 * Un margen inventado con la misma pinta que uno real es peor que una celda
 * vacía.
 */
export default function TablaStock({
  filas,
  marcas,
  categorias,
}: {
  filas: FilaStock[];
  marcas: Marca[];
  categorias: OpcionCategoria[];
}) {
  const [editando, setEditando] = useState<FilaStock | null>(null);
  const seleccion = useSeleccion();

  const columnas: Columna<FilaStock>[] = [
    {
      clave: "nombre",
      titulo: "Producto",
      // Sin ancho a propósito: es la que se queda con lo que sobra.
      celda: (f) => (
        <span className="flex items-center gap-2">
          {/*
            Sólo la foto del PRODUCTO. La del rubro vive una vez en el
            encabezado del grupo: repetirla en treinta filas no agrega nada.
          */}
          <Foto
            fuentes={[f.imagenUrl, f.imagenOrigenUrl]}
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded object-contain"
          >
            <span className="block h-6 w-6 shrink-0 rounded bg-papel-hondo" />
          </Foto>
          <span className="min-w-0 truncate">
            <span className="font-medium">{f.nombre}</span>
            {(f.marca || f.contenido != null) && (
              <span className="ml-1.5 text-[0.7rem] text-tinta-suave">
                {[
                  f.marca,
                  f.contenido != null && f.contenidoUnidad != null
                    ? formatearContenidoCorto(f.contenido, f.contenidoUnidad)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {f.falta && (
              <span className="ml-1.5 rounded bg-deuda-tenue px-1 py-px text-[0.6rem] font-medium text-deuda">
                falta
              </span>
            )}
          </span>
        </span>
      ),
      total: (filas) => (
        <span className="text-xs font-normal text-tinta-suave">
          {filas.length === 1 ? "1 producto" : `${filas.length} productos`}
        </span>
      ),
    },
    {
      clave: "envase",
      titulo: "Envase",
      ancho: ANCHO.envase,
      celda: (f) =>
        f.envase ? (
          <span className="text-tinta-suave">{ETIQUETA_ENVASE[f.envase]}</span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "proveedor",
      titulo: "Proveedor",
      ancho: ANCHO.proveedor,
      celda: (f) =>
        f.proveedor ? (
          <span className="block truncate">{f.proveedor}</span>
        ) : (
          <Nada />
        ),
    },
    {
      // Lo que sale de verdad cada unidad: con el IVA ya sumado si la última
      // compra fue en blanco. El importe de la factura NO es el costo.
      clave: "costo",
      titulo: "Costo",
      ancho: ANCHO.costo,
      ayuda: "por unidad",
      numerica: true,
      celda: (f) =>
        f.costoRealCentavos != null ? (
          <>
            <span className="font-medium">
              {formatearCentavos(f.costoRealCentavos)}
            </span>
            {f.enBlanco && (
              <span className="ml-1 text-[0.65rem] text-tinta-suave">+IVA</span>
            )}
          </>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "precio",
      titulo: "Precio",
      ancho: ANCHO.precio,
      ayuda: "de venta",
      numerica: true,
      celda: (f) =>
        f.precioVentaCentavos != null ? (
          <span className="font-medium">
            {formatearCentavos(f.precioVentaCentavos)}
          </span>
        ) : f.sugeridoCentavos != null ? (
          <span className="text-tinta-suave">
            {formatearCentavos(f.sugeridoCentavos)}
            <span className="ml-1 text-[0.65rem]">sug.</span>
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "margen",
      titulo: "Margen",
      ancho: ANCHO.margen,
      ayuda: "sobre lo que cobrás",
      numerica: true,
      celda: (f) => {
        // Con precio cargado: el margen real, ya calculado por el servidor.
        if (f.margen) {
          return (
            <span className={f.margen.porcentaje < 0 ? "text-deuda" : "text-pago"}>
              <span className="font-medium">
                {Math.round(f.margen.porcentaje)}%
              </span>
              <span className="ml-1 text-[0.65rem] text-tinta-suave">
                {formatearCentavos(f.margen.gananciaCentavos)} ·{" "}
                {formatearMultiplicador(f.margen.multiplicador)}
              </span>
            </span>
          );
        }
        // Sin precio: el que daría el sugerido, apagado y rotulado.
        const hipotetico =
          f.costoRealCentavos != null && f.sugeridoCentavos != null
            ? calcularMargen(f.costoRealCentavos, f.sugeridoCentavos)
            : null;
        return hipotetico ? (
          <span className="text-tinta-suave">
            {Math.round(hipotetico.porcentaje)}%
            <span className="ml-1 text-[0.65rem]">sug.</span>
          </span>
        ) : (
          <Nada />
        );
      },
      // El promedio sólo cuenta los márgenes REALES: mezclar los sugeridos
      // sería promediar contra un precio que nadie cobra.
      total: (filas) => {
        const reales = filas.filter((f) => f.margen);
        if (reales.length === 0) return null;
        const promedio =
          reales.reduce((t, f) => t + f.margen!.porcentaje, 0) / reales.length;
        return (
          <span className="text-xs font-normal text-tinta-suave">
            prom. {Math.round(promedio)}%
          </span>
        );
      },
    },
    {
      clave: "cuando",
      titulo: "Última compra",
      ancho: ANCHO.ultima,
      numerica: true,
      celda: (f) => (f.ultimaCompra ? fechaCorta(f.ultimaCompra) : <Nada />),
    },
  ];

  return (
    <>
      {/*
        El contenedor fuerza `table-fixed` (Tabla es compartida y no se toca),
        le da el MISMO ancho mínimo a todos los rubros —así el scroll de costado
        aparece en todos o en ninguno— y fija la columna de casillas, que no
        tiene `ancho` propio y si no se llevaría la mitad de lo que sobra.
      */}
      <div className="[&_table]:min-w-[58rem] [&_table]:table-fixed [&_thead_th:first-child]:w-9">
      <Tabla
        columnas={columnas}
        filas={filas}
        claveDe={(f) => f.id}
        alClickearFila={setEditando}
        seleccion={seleccion}
        vacio="Todavía no hay productos. La lista se llena sola: cada renglón con nombre de una compra entra acá con su último costo."
      />
      </div>

      <Hoja
        abierta={editando !== null}
        titulo={editando?.nombre ?? ""}
        onCerrar={() => setEditando(null)}
      >
        {editando && (
          <>
            {/* La cuenta abierta, para que el número de la tabla no sea magia. */}
            {editando.costoCentavos != null &&
              editando.costoRealCentavos != null && (
                <p className="text-xs text-tinta-suave">
                  Factura{" "}
                  <span className="cifra">
                    {formatearCentavos(editando.costoCentavos)}
                  </span>
                  {editando.enBlanco ? (
                    <>
                      {" + IVA = "}
                      <span className="cifra text-tinta">
                        {formatearCentavos(editando.costoRealCentavos)}
                      </span>{" "}
                      de costo
                    </>
                  ) : (
                    " · en negro, sin IVA"
                  )}
                  {editando.margen && (
                    <>
                      {" · vendiendo a "}
                      <span className="cifra">
                        {formatearCentavos(editando.precioVentaCentavos!)}
                      </span>{" "}
                      te queda{" "}
                      <span className="cifra text-pago">
                        {formatearCentavos(editando.margen.gananciaCentavos)}
                      </span>{" "}
                      por unidad
                    </>
                  )}
                </p>
              )}

            <FichaProducto
              id={editando.id}
              nombre={editando.nombre}
              marca={editando.marca}
              contenido={editando.contenido}
              contenidoUnidad={editando.contenidoUnidad}
              precioVentaCentavos={editando.precioVentaCentavos}
              sugeridoCentavos={editando.sugeridoCentavos}
              multiplicadorMilesimas={editando.multiplicadorMilesimas}
              recargoMilesimas={editando.recargoMilesimas}
              costoRealCentavos={editando.costoRealCentavos}
              categoriaId={editando.categoriaId}
              envase={editando.envase}
              codigoBarras={editando.codigoBarras}
              marcas={marcas}
              categoriasDisponibles={categorias}
            />

            {/* Marcar que falta y archivar viven acá adentro y no en una
                columna: la planilla es para leer, y cada columna de botones es
                ancho que le sacás a los números. */}
            <div className="mt-3 flex items-center gap-3 border-t border-linea pt-3">
              <BotonFalta id={editando.id} falta={editando.falta} />
              <BotonArchivar id={editando.id} />
            </div>
          </>
        )}
      </Hoja>
    </>
  );
}
