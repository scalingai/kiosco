"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { salir } from "@/app/entrar/acciones";

export default function BotonSalir() {
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, empezar] = useTransition();

  // En el propio portón no tiene sentido ofrecer salir.
  if (ruta === "/entrar") return null;

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          await salir();
          router.replace("/entrar");
          router.refresh();
        })
      }
      className="text-xs text-tinta-suave underline underline-offset-4 disabled:opacity-45"
    >
      Salir
    </button>
  );
}
