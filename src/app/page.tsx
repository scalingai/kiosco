import TablaDeudores from "@/components/TablaDeudores";
import { listarClientes } from "@/lib/consultas";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const filas = await listarClientes();

  const totalFiado = filas.reduce(
    (total, f) => total + Math.max(f.saldoCentavos, 0),
    0,
  );
  const deudores = filas.filter((f) => f.saldoCentavos > 0).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-6">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Fiado en la calle
        </p>
        <p className="cifra mt-1 text-4xl font-medium text-deuda sm:text-5xl">
          {formatearCentavos(totalFiado)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {deudores === 0
            ? "Nadie debe nada."
            : deudores === 1
              ? "1 cliente con deuda abierta"
              : deudores + " clientes con deuda abierta"}
        </p>
      </section>

      <TablaDeudores filas={filas} />
    </div>
  );
}
