"use client";

import { useState } from "react";
import FormCompra from "@/components/FormCompra";
import FormGasto from "@/components/FormGasto";
import FormVenta from "@/components/FormVenta";
import Hoja from "@/components/Hoja";

type Proveedor = { id: string; nombre: string };
type Producto = { id: string; nombre: string };

type Cual = "venta" | "compra" | "gasto";

const TITULO: Record<Cual, string> = {
  venta: "Anotar venta",
  compra: "Anotar compra",
  gasto: "Anotar gasto",
};

/**
 * Los tres botones de carga del día. Cada uno abre su hoja: en el mostrador la
 * pantalla es chica y lo que tiene que verse es el número, no el formulario.
 */
export default function CargaDelDia({
  fecha,
  proveedores,
  productos,
}: {
  fecha: string;
  proveedores: Proveedor[];
  productos: Producto[];
}) {
  const [abierta, setAbierta] = useState<Cual | null>(null);
  const cerrar = () => setAbierta(null);

  const boton =
    "flex-1 rounded-xl border border-linea bg-white/70 px-3 py-3 text-sm font-medium active:scale-[0.98]";

  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierta("venta")} className={boton}>
          + Venta
        </button>
        <button type="button" onClick={() => setAbierta("compra")} className={boton}>
          + Compra
        </button>
        <button type="button" onClick={() => setAbierta("gasto")} className={boton}>
          + Gasto
        </button>
      </div>

      <Hoja
        abierta={abierta !== null}
        titulo={abierta ? TITULO[abierta] : ""}
        // La compra trae una tabla adentro; la venta y el gasto son dos campos.
        ancha={abierta === "compra"}
        onCerrar={cerrar}
      >
        {abierta === "venta" && <FormVenta fecha={fecha} alGuardar={cerrar} />}
        {abierta === "compra" && (
          <FormCompra
            fecha={fecha}
            proveedores={proveedores}
            productos={productos}
            alGuardar={cerrar}
          />
        )}
        {abierta === "gasto" && <FormGasto fecha={fecha} alGuardar={cerrar} />}
      </Hoja>
    </>
  );
}
