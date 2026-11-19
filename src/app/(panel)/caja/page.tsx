import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Caja pasó a ser el Balance de Finanzas.
 *
 * La ruta no se borra: hay links guardados (`/caja?f=2026-11-05`, el de las
 * ventas por día) y un favorito que muere de golpe es un favorito que nadie
 * vuelve a abrir. Redirige conservando el día, que ahora es el período "Día".
 */
export default async function Caja({ searchParams }: PageProps<"/caja">) {
  const params = await searchParams;
  const pedida = Array.isArray(params.f) ? params.f[0] : params.f;

  if (pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida)) {
    redirect(`/finanzas?periodo=dia&fecha=${pedida}`);
  }
  redirect("/finanzas?periodo=dia");
}
