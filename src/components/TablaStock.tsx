"use client";

import { useState } from "react";
import { BotonArchivar, BotonFalta } from "@/components/AccionesStock";
import FichaProducto from "@/components/FichaProducto";
import Hoja from "@/components/Hoja";
import Tabla, { type Columna } from "@/components/Tabla";
import { fechaCorta } from "@/lib/fechas";
import {
  formatearContenidoCorto,
  formatearMultiplicador,
} from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import type { FilaStock } from "@/lib/stock";

type Marca = { id: string; nombre: string };

const SIN = <span className="text-tinta-suave">—</span>;

/**
 * El catálogo como planilla.
 *
 * El orden de las columnas es el del razonamiento: primero qué es —el nombre y
 * el tamaño juntos, porque "gaseosa" y "gaseosa de 2,25 L" no son la misma
 * cosa— después de dónde viene, después cómo viene, y recién al final la plata, que se lee de
 * izquierda a derecha como la cuenta que es —factura, costo, precio, margen—.
 * Los números no se explican solos: se explican porque están al lado del
 * anterior.
 *
 * No hay columna de marca: la lista va siempre agrupada por marca y el título
 * de cada grupo ya la dice. Repetirla en cada fila es ancho que le sacás a los
 * números.
 */
export default function TablaStock({
  filas,
  marcas,
}: {
  filas: FilaStock[];
  marcas: Marca[];
}) {
  const [editando, setEditando] = useState<FilaStock | null>(null);

  const columnas: Columna<FilaStock>[] = [
    {
      clave: "nombre",
      titulo: "Producto",
      ancho: "min-w-36",
      celda: (f) => (
        <span className="block">
          <span className="font-medium">{f.nombre}</span>
          {f.falta && (
            <span className="ml-2 rounded-full bg-deuda-tenue px-1.5 py-0.5 text-[0.65rem] text-deuda">
              falta
            </span>
          )}
        </span>
      ),
    },
    {
      clave: "contenido",
      titulo: "Contenido",
      ayuda: "por unidad",
      numerica: true,
      celda: (f) =>
        f.contenido != null && f.contenidoUnidad != null
          ? formatearContenidoCorto(f.contenido, f.contenidoUnidad)
          : SIN,
    },
    {
      clave: "proveedor",
      titulo: "Proveedor",
      ancho: "min-w-24",
      celda: (f) => f.proveedor ?? SIN,
    },
    {
      clave: "bulto",
      titulo: "Bulto",
      ayuda: "última compra",
      ancho: "min-w-24",
      celda: (f) =>
        f.cantidad != null && f.unidadesPorBulto != null && f.unidad != null ? (
          <span className="cifra">
            {f.cantidad} × {formatearContenidoCorto(f.unidadesPorBulto, f.unidad)}
          </span>
        ) : (
          SIN
        ),
    },
    {
      // Acá NO va un número de unidades en existencia: la app no las cuenta.
      // Lo que sí dice es de cuándo es el costo, que es lo que decide si el
      // número de al lado todavía sirve.
      clave: "cuando",
      titulo: "Comprado",
      numerica: true,
      celda: (f) => (f.ultimaCompra ? fechaCorta(f.ultimaCompra) : SIN),
    },
    {
      // El IVA va acá abajo y no en su propia columna: es un dato de la
      // factura, no un número que se compare en columna, y una columna menos
      // es el ancho que necesitan los nombres para no partirse al medio.
      clave: "factura",
      titulo: "Factura",
      ayuda: "sin IVA",
      numerica: true,
      celda: (f) => {
        if (f.costoCentavos == null) return SIN;
        const iva =
          f.costoRealCentavos != null && f.enBlanco
            ? f.costoRealCentavos - f.costoCentavos
            : null;
        return (
          <span className="block">
            {formatearCentavos(f.costoCentavos)}
            {iva != null && (
              <span className="block text-[0.65rem] text-tinta-suave">
                +{formatearCentavos(iva)} IVA
              </span>
            )}
          </span>
        );
      },
    },
    {
      clave: "costo",
      titulo: "Costo",
      ayuda: "lo que sale",
      numerica: true,
      celda: (f) =>
        f.costoRealCentavos != null ? (
          <span className="font-medium">
            {formatearCentavos(f.costoRealCentavos)}
          </span>
        ) : (
          SIN
        ),
    },
    {
      clave: "precio",
      titulo: "Precio",
      ayuda: "a cuánto vendés",
      numerica: true,
      celda: (f) =>
        f.precioVentaCentavos != null ? (
          <span className="font-medium">
            {formatearCentavos(f.precioVentaCentavos)}
          </span>
        ) : f.sugeridoCentavos != null ? (
          <span className="text-tinta-suave">
            {formatearCentavos(f.sugeridoCentavos)}
            <span className="block text-[0.65rem]">sugerido</span>
          </span>
        ) : (
          SIN
        ),
    },
    {
      clave: "margen",
      titulo: "Margen",
      ayuda: "de lo que cobrás",
      numerica: true,
      celda: (f) =>
        f.margen ? (
          <span className="block text-pago">
            {Math.round(f.margen.porcentaje)}%
            {/* El porcentaje solo no alcanza: 19% de $4.500 son $870, y esa
                es la plata que de verdad entra por cada unidad vendida. */}
            <span className="block text-[0.65rem]">
              {formatearCentavos(f.margen.gananciaCentavos)} ·{" "}
              {formatearMultiplicador(f.margen.multiplicador)}
            </span>
          </span>
        ) : (
          SIN
        ),
    },
  ];

  return (
    <>
      <Tabla
        columnas={columnas}
        filas={filas}
        claveDe={(f) => f.id}
        alClickearFila={setEditando}
        vacio="Todavía no hay productos. La lista se llena sola: cada renglón con nombre de una compra entra acá con su último costo."
      />

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
              marcas={marcas}
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
