import Link from "next/link";
import type { Metadata } from "next";
import AvisoCobertura, { textoCobertura } from "@/components/AvisoCobertura";
import CabeceraFinanzas from "@/components/CabeceraFinanzas";
import CargaDelDia from "@/components/CargaDelDia";
import TablaBalance from "@/components/TablaBalance";
import Tira from "@/components/Tira";
import { listarProveedores } from "@/lib/caja";
import { hoyLocal } from "@/lib/fechas";
import { planillaDelPeriodo, totalesDelPeriodo } from "@/lib/finanzas";
import { listarSocios } from "@/lib/inversion";
import { leerFecha, leerPeriodo, resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import { listarNombresDeProductos } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Finanzas — El Osito" };

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Balance: lo que entró, lo que salió y lo que se ganó en el período.
 *
 * La ganancia es lo delicado y lo que más cuesta de leer bien: sólo se sabe de
 * las ventas que tienen costo. La pantalla dice sobre qué parte de las ventas
 * está calculada, en el KPI grande y en un aviso, en vez de mostrar un número
 * que parece exacto. Ver el comentario de `src/lib/finanzas.ts`.
 */
export default async function Finanzas({ searchParams }: PageProps<"/finanzas">) {
  const params = await searchParams;
  const rango = resolverRango(
    leerPeriodo(uno(params.periodo)),
    leerFecha(uno(params.fecha)),
  );

  const [totales, planilla, proveedores, productos, socios] = await Promise.all([
    totalesDelPeriodo(rango),
    planillaDelPeriodo(rango),
    listarProveedores(),
    listarNombresDeProductos(),
    listarSocios(),
  ]);

  const ganancia = totales.gananciaCentavos;
  const hayVentas = totales.coberturaPorcentaje !== null;

  // Los botones de carga anotan en el día que se está mirando; si el período
  // es una semana o un mes, en hoy: cargar "el lunes del mes pasado" por
  // accidente es peor que no poder elegir.
  const fechaDeCarga = rango.periodo === "dia" ? rango.fecha : hoyLocal();

  return (
    <div className="space-y-3">
      <CabeceraFinanzas
        activa="/finanzas"
        rango={rango}
        acciones={
          <div className="w-full sm:w-80">
            <CargaDelDia
              fecha={fechaDeCarga}
              proveedores={proveedores}
              productos={productos}
              socios={socios}
            />
          </div>
        }
      />

      <Tira
        datos={[
          {
            etiqueta: "Ventas",
            valor: formatearCentavos(totales.ventasCentavos),
            tono: "pago",
            pie: `${totales.ventasCantidad} cobradas`,
          },
          {
            etiqueta: "Compras pagadas",
            valor: formatearCentavos(totales.comprasCentavos),
            tono: "deuda",
            pie: "mercadería",
          },
          {
            etiqueta: "Gastos",
            valor: formatearCentavos(totales.gastosCentavos),
            tono: "deuda",
            pie: "sin retiros ni inversión",
          },
          {
            etiqueta: "Ventas con costo",
            valor: hayVentas
              ? `${totales.coberturaCompleta ? 100 : Math.min(99, Math.floor(totales.coberturaPorcentaje!))}%`
              : "—",
            tono: totales.coberturaCompleta || !hayVentas ? "suave" : "normal",
            pie: "base de la ganancia",
          },
          {
            etiqueta: "Fiado cobrado",
            valor: formatearCentavos(totales.fiadoCobradoCentavos),
            tono: "suave",
            pie: "no entra en la ganancia",
          },
        ]}
        destacado={{
          etiqueta: `Ganancia · ${rango.titulo}`,
          valor: `${ganancia < 0 ? "−" : ""}${formatearCentavos(Math.abs(ganancia))}`,
          tono: ganancia >= 0 ? "pago" : "deuda",
          pie: hayVentas
            ? `${textoCobertura(totales.coberturaPorcentaje, totales.coberturaCompleta)}, menos gastos`
            : "sin ventas en el período",
        }}
      />

      <AvisoCobertura
        porcentaje={totales.coberturaPorcentaje}
        completa={totales.coberturaCompleta}
        ventasCentavos={totales.ventasCentavos}
        ventasConCostoCentavos={totales.ventasConCostoCentavos}
      />

      <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
        <TablaBalance filas={planilla.filas} totales={totales} />
        <div className="space-y-1 border-t border-linea py-2 text-xs text-tinta-suave">
          {planilla.recortada && (
            <p>
              Se muestran los últimos {planilla.filas.length} movimientos de{" "}
              {planilla.totalFilas}; los totales del pie y de arriba cuentan el
              período entero.
            </p>
          )}
          <p>
            Las compras cuentan el día que se pagaron, no el que llegó la
            mercadería. <sup>*</sup> Ganancia parcial: la venta tiene una parte
            sin costo conocido. Un guión es que no se sabe, no que sea cero.
          </p>
        </div>
      </section>

      {/* Lo que salió del bolsillo de los socios o fue hacia ellos no es el
          costo de tener abierto, pero tampoco desaparece: se dice dónde está. */}
      {(totales.retirosCentavos > 0 || totales.inversionCentavos > 0) && (
        <p className="px-1 text-xs text-tinta-suave">
          Aparte del balance:{" "}
          {totales.inversionCentavos > 0 && (
            <>
              <span className="cifra">
                {formatearCentavos(totales.inversionCentavos)}
              </span>{" "}
              de inversión inicial (
              <Link href="/inversion" className="underline underline-offset-4">
                ver
              </Link>
              )
            </>
          )}
          {totales.inversionCentavos > 0 && totales.retirosCentavos > 0 && " · "}
          {totales.retirosCentavos > 0 && (
            <>
              <span className="cifra">
                {formatearCentavos(totales.retirosCentavos)}
              </span>{" "}
              de retiros (
              <Link
                href="/finanzas/reparto"
                className="underline underline-offset-4"
              >
                ver el reparto
              </Link>
              )
            </>
          )}
          . No restan de la ganancia.
        </p>
      )}
    </div>
  );
}
