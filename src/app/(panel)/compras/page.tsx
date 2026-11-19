import Link from "next/link";
import type { Metadata } from "next";
import CabeceraStock, {
  colaDelPeriodo,
  rangoDeLaUrl,
} from "@/components/CabeceraStock";
import Pastilla from "@/components/Pastilla";
import Planilla, { Corte } from "@/components/Planilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import Tira from "@/components/Tira";
import {
  agruparPorFecha,
  agruparPorMedio,
  agruparPorProducto,
  agruparPorProveedor,
  historialDeCompras,
  totalDesglosado,
  type GrupoDeCompras,
  type GrupoDeProducto,
} from "@/lib/compras";
import { fechaCorta } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";
import { contarPedidosAbiertos } from "@/lib/reposicion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compras — El Osito" };

const CORTES = [
  { clave: "proveedor", etiqueta: "Proveedores" },
  { clave: "fecha", etiqueta: "Días" },
  { clave: "producto", etiqueta: "Productos" },
  { clave: "medio", etiqueta: "Medios" },
] as const;

type Corte = (typeof CORTES)[number]["clave"];

/** Lo que se le debe, en rojo; si no se debe nada, el guión. */
function Debe({ centavos }: { centavos: number }) {
  return centavos > 0 ? (
    <span className="text-deuda">{formatearCentavos(centavos)}</span>
  ) : (
    <Nada />
  );
}

/** Qué parte del total es esta fila, en por ciento. */
function Parte({ centavos, total }: { centavos: number; total: number }) {
  if (total <= 0) return <Nada />;
  const porciento = (centavos / total) * 100;
  return (
    <span className="text-tinta-suave">
      {porciento < 1 ? "<1" : Math.round(porciento)}%
    </span>
  );
}

export default async function Compras({ searchParams }: PageProps<"/compras">) {
  const params = await searchParams;
  const leer = (clave: string) => {
    const valor = params[clave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  // `impagas=1` viene de un link del inicio: «lo que se debe» no tiene fecha,
  // una factura sin pagar de hace tres meses sigue debiéndose. Por eso sin
  // período explícito mira TODO y no sólo el mes.
  const soloImpagas = leer("impagas") === "1";
  const rango = rangoDeLaUrl(params, soloImpagas ? "todo" : "mes");

  const pedido = leer("por");
  const corte: Corte = CORTES.some((c) => c.clave === pedido)
    ? (pedido as Corte)
    : "proveedor";

  const [lista, pedidosAbiertos] = await Promise.all([
    historialDeCompras({
      desde: rango.desde ?? undefined,
      hasta: rango.hasta ?? undefined,
      soloImpagas,
    }),
    contarPedidosAbiertos(),
  ]);

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const impago = lista.reduce(
    (t, c) => t + (c.pagadoEn ? 0 : c.montoCentavos),
    0,
  );
  const proveedoresDistintos = new Set(lista.map((c) => c.proveedorId)).size;
  const sinPrecios = lista.filter((c) => c.faltanPrecios).length;

  const cola = colaDelPeriodo(rango);
  const enlace = (c: Corte) =>
    `/compras?${cola}${c === "proveedor" ? "" : `&por=${c}`}${soloImpagas ? "&impagas=1" : ""}`;

  /* ── Las planillas de cada corte ─────────────────────────────────────── */

  const sumar = (grupos: GrupoDeCompras[], f: (g: GrupoDeCompras) => number) =>
    grupos.reduce((t, g) => t + f(g), 0);

  /** Las columnas que todos los cortes que agrupan COMPRAS comparten. */
  const columnasComunes = (): Columna<GrupoDeCompras>[] => [
    {
      clave: "compras",
      titulo: "Compras",
      numerica: true,
      celda: (g) => g.compras.length,
      total: (gs) => sumar(gs, (g) => g.compras.length),
    },
    {
      clave: "impago",
      titulo: "Sin pagar",
      numerica: true,
      celda: (g) => <Debe centavos={g.impagoCentavos} />,
      total: (gs) => <Debe centavos={sumar(gs, (g) => g.impagoCentavos)} />,
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (g) => (
        <span className="font-medium">{formatearCentavos(g.totalCentavos)}</span>
      ),
      total: (gs) => formatearCentavos(sumar(gs, (g) => g.totalCentavos)),
    },
    {
      clave: "parte",
      titulo: "Parte",
      numerica: true,
      celda: (g) => <Parte centavos={g.totalCentavos} total={total} />,
    },
  ];

  const avisoPrecios = (g: GrupoDeCompras) =>
    g.faltanPrecios ? (
      <span className="ml-2">
        <Pastilla tono="espera">faltan precios</Pastilla>
      </span>
    ) : null;

  const porProveedor: Columna<GrupoDeCompras>[] = [
    {
      clave: "proveedor",
      titulo: "Proveedor",
      ancho: "min-w-44",
      celda: (g) => (
        <>
          <Link
            href={`/compras/proveedor/${g.clave}?${cola}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {g.titulo}
          </Link>
          {avisoPrecios(g)}
        </>
      ),
      total: (gs) => (
        <span className="text-xs font-normal text-tinta-suave">
          {gs.length === 1 ? "1 proveedor" : `${gs.length} proveedores`}
        </span>
      ),
    },
    {
      clave: "ultima",
      titulo: "Última",
      numerica: true,
      celda: (g) => fechaCorta(g.ultimaFecha),
    },
    ...columnasComunes(),
  ];

  const porDia: Columna<GrupoDeCompras>[] = [
    {
      clave: "dia",
      titulo: "Día",
      ancho: "min-w-32",
      celda: (g) => (
        <>
          <Link
            href={`/compras/dia/${g.clave}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {fechaCorta(g.clave)}
          </Link>
          {avisoPrecios(g)}
        </>
      ),
      total: (gs) => (
        <span className="text-xs font-normal text-tinta-suave">
          {gs.length === 1 ? "1 día" : `${gs.length} días`}
        </span>
      ),
    },
    {
      clave: "quien",
      titulo: "Proveedores",
      celda: (g) => g.detalle,
    },
    ...columnasComunes(),
  ];

  const porMedio: Columna<GrupoDeCompras>[] = [
    {
      clave: "medio",
      titulo: "Medio",
      ancho: "min-w-32",
      celda: (g) =>
        g.clave === "sin-pagar" ? (
          <Pastilla tono="deuda">Sin pagar</Pastilla>
        ) : (
          <span className="font-medium">{g.titulo}</span>
        ),
      total: (gs) => (
        <span className="text-xs font-normal text-tinta-suave">
          {gs.length === 1 ? "1 medio" : `${gs.length} medios`}
        </span>
      ),
    },
    // «Sin pagar» acá sería la misma cifra que el total del grupo impago, y en
    // las filas pagadas siempre cero: la columna no dice nada, se la saca.
    ...columnasComunes().filter((c) => c.clave !== "impago"),
  ];

  const gruposProducto: GrupoDeProducto[] =
    corte === "producto" ? agruparPorProducto(lista) : [];
  const desglosado = corte === "producto" ? totalDesglosado(lista) : 0;

  const porProducto: Columna<GrupoDeProducto>[] = [
    {
      clave: "producto",
      titulo: "Producto",
      ancho: "min-w-44",
      celda: (p) => <span className="font-medium">{p.nombre}</span>,
      total: (ps) => (
        <span className="text-xs font-normal text-tinta-suave">
          {ps.length === 1 ? "1 producto" : `${ps.length} productos`}
        </span>
      ),
    },
    {
      clave: "veces",
      titulo: "Compras",
      numerica: true,
      celda: (p) => p.veces,
      total: (ps) => ps.reduce((t, p) => t + p.veces, 0),
    },
    {
      // El importe de la factura dividido por las unidades: ES el costo por
      // unidad de esa compra, sin IVA. El IVA se suma recién en el catálogo.
      clave: "ultimo",
      titulo: "Último costo",
      ayuda: "de factura",
      numerica: true,
      celda: (p) =>
        p.ultimoCosto?.costoCentavos != null ? (
          <>
            {formatearCentavos(p.ultimoCosto.costoCentavos)}
            <span className="ml-1 text-[0.65rem] text-tinta-suave">
              {p.ultimoCosto.porCada}
            </span>
          </>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "variacion",
      titulo: "Variación",
      ayuda: "en el período",
      numerica: true,
      celda: (p) =>
        p.variacion != null && p.variacion !== 0 ? (
          <span className={p.variacion > 0 ? "text-deuda" : "text-pago"}>
            {p.variacion > 0 ? "+" : ""}
            {p.variacion}%
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (p) => (
        <span className="font-medium">{formatearCentavos(p.totalCentavos)}</span>
      ),
      total: (ps) => formatearCentavos(ps.reduce((t, p) => t + p.totalCentavos, 0)),
    },
  ];

  const vacio = (
    <>
      No hay compras en {rango.titulo.toLowerCase()}. Se cargan desde{" "}
      <Link
        href="/reponer?nueva=compra"
        className="underline underline-offset-4"
      >
        Cargar compra
      </Link>
      .
    </>
  );

  return (
    <div className="space-y-3">
      <CabeceraStock
        activa="compras"
        rango={rango}
        base="/compras"
        extra={{
          por: corte === "proveedor" ? undefined : corte,
          impagas: soloImpagas ? "1" : undefined,
        }}
        pedidosAbiertos={pedidosAbiertos}
      />

      <Tira
        datos={[
          { etiqueta: "Compras", valor: lista.length },
          { etiqueta: "Proveedores", valor: proveedoresDistintos },
          {
            etiqueta: "Pagado",
            valor: formatearCentavos(total - impago),
            tono: "pago",
          },
          {
            etiqueta: "Sin pagar",
            valor: formatearCentavos(impago),
            tono: impago > 0 ? "deuda" : "suave",
          },
          {
            etiqueta: "Faltan precios",
            valor: sinPrecios,
            tono: sinPrecios > 0 ? "deuda" : "suave",
            pie: sinPrecios > 0 ? "compras con el total incompleto" : undefined,
          },
        ]}
        destacado={{
          etiqueta: soloImpagas ? "Lo que se debe" : "Comprado",
          valor: formatearCentavos(soloImpagas ? impago : total),
          tono: "normal",
          pie: soloImpagas ? "facturas sin pagar" : rango.titulo,
        }}
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1.5">
          {CORTES.map((c) => (
            <Corte key={c.clave} href={enlace(c.clave)} activo={c.clave === corte}>
              {c.etiqueta}
            </Corte>
          ))}
          {soloImpagas && (
            <Link
              href={`/compras?${cola}${corte === "proveedor" ? "" : `&por=${corte}`}`}
              className="ml-1 shrink-0 text-xs text-tinta-suave underline underline-offset-4"
            >
              ver también las pagadas
            </Link>
          )}
        </div>
      </div>

      {corte === "proveedor" ? (
        <Planilla>
          <Tabla
            columnas={porProveedor}
            filas={agruparPorProveedor(lista)}
            claveDe={(g) => g.clave}
            vacio={vacio}
          />
        </Planilla>
      ) : corte === "fecha" ? (
        <Planilla>
          <Tabla
            columnas={porDia}
            filas={agruparPorFecha(lista)}
            claveDe={(g) => g.clave}
            vacio={vacio}
          />
        </Planilla>
      ) : corte === "medio" ? (
        <Planilla>
          <Tabla
            columnas={porMedio}
            filas={agruparPorMedio(lista)}
            claveDe={(g) => g.clave}
            vacio={vacio}
          />
        </Planilla>
      ) : (
        <>
          {/*
            Acá se agrupan renglones y no facturas, así que la suma de los
            grupos NO da el total de arriba. Decirlo es la diferencia entre una
            pantalla que se entiende y una que parece tener un error de cuentas.
          */}
          {lista.length > 0 && (
            <p className="rounded-lg bg-papel-hondo px-3 py-1.5 text-xs text-tinta-suave">
              Este corte suma renglones, no facturas. De{" "}
              <span className="cifra">{formatearCentavos(total)}</span> comprados,{" "}
              <span className="cifra">{formatearCentavos(desglosado)}</span> están
              detallados por producto; el resto entró como total de factura sin
              desglose.
            </p>
          )}
          <Planilla>
            <Tabla
              columnas={porProducto}
              filas={gruposProducto}
              claveDe={(p) => p.clave}
              vacio={vacio}
            />
          </Planilla>
        </>
      )}
    </div>
  );
}
