import Image from "next/image";
import type { Metadata } from "next";
import FormPin from "@/components/FormPin";
import { destinoSeguro } from "@/lib/sesion";

export const metadata: Metadata = { title: "Entrar — El Osito" };

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { volver } = await searchParams;
  const destino = destinoSeguro(typeof volver === "string" ? volver : null);

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Image src="/oso.png" alt="" width={88} height={88} priority />
      <h1 className="font-display mt-5 text-3xl leading-none">El Osito</h1>
      <p className="mt-2 text-sm text-tinta-suave">Poné el PIN para entrar.</p>
      <FormPin destino={destino} />
    </div>
  );
}
