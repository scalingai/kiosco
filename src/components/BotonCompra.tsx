"use client";

import { useState } from "react";
import FormCompra from "@/components/FormCompra";
import Hoja from "@/components/Hoja";

type Proveedor = { id: string; nombre: string };
type Producto = {
  id: string;
  nombre: string;
  precioVentaCentavos: number | null;
  multiplicadorMilesimas: number | null;
};

/**
 * Cargar una compra desde donde se están mirando las compras.
 *
 * Antes esto vivía sólo en la caja del día, y era el único lugar: se entraba a
 * Compras a mirar el historial y no había con qué anotar la que acababa de
 * llegar. La pantalla donde mirás algo tiene que ser la pantalla donde lo
 * cargás.
 */
export default function BotonCompra({
  fecha,
  proveedores,
  productos,
  proveedorInicial,
}: {
  fecha: string;
  proveedores: Proveedor[];
  productos: Producto[];
  /** en la ficha de un proveedor ya sabemos de quién es la compra */
  proveedorInicial?: string;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="w-full rounded-xl border border-linea bg-white/70 px-3 py-3 text-sm font-medium active:scale-[0.99]"
      >
        + Anotar una compra
        {proveedorInicial ? ` de ${proveedorInicial}` : ""}
      </button>

      <Hoja
        abierta={abierta}
        titulo="Anotar compra"
        ancha
        onCerrar={() => setAbierta(false)}
      >
        <FormCompra
          fecha={fecha}
          proveedores={proveedores}
          productos={productos}
          proveedorInicial={proveedorInicial}
          alGuardar={() => setAbierta(false)}
        />
      </Hoja>
    </>
  );
}
