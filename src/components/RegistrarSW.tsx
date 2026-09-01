"use client";

import { useEffect } from "react";

/**
 * Registra el service worker. Sin esto Android no ofrece "Instalar app".
 * En desarrollo no se registra: el caché de assets confunde el hot reload.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Si falla, la app anda igual: sólo se pierde el instalar y el offline.
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
