import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión — El Osito" };

/**
 * La sirve el service worker cuando no hay red. No muestra ningún saldo a
 * propósito: un número viejo presentado como actual es peor que no mostrar nada.
 */
export default function SinConexion() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Image
        src="/oso.png"
        alt=""
        width={96}
        height={96}
        className="opacity-40"
        priority
      />
      <h1 className="font-display mt-6 text-3xl leading-none">Sin conexión</h1>
      <p className="mt-3 max-w-xs text-sm text-tinta-suave">
        Los saldos se leen del servidor y no se guardan en el teléfono, así que
        no te muestro números viejos. Anotá el fiado en un papel y cargalo cuando
        vuelva la señal.
      </p>
    </div>
  );
}
