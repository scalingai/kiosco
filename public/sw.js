/**
 * Service worker de El Osito.
 *
 * Regla de oro: los saldos NUNCA se sirven de caché. Un fiado viejo mostrado
 * como actual es peor que no mostrar nada. Sólo se cachean los assets estáticos
 * de Next (que llevan hash en el nombre, así que nunca quedan viejos) y una
 * página de cortesía para cuando no hay señal.
 */
const VERSION = "v1";
const CACHE_ESTATICO = `osito-estatico-${VERSION}`;
const CACHE_APP = `osito-app-${VERSION}`;
const SIN_CONEXION = "/sin-conexion";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) => cache.addAll([SIN_CONEXION]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n !== CACHE_ESTATICO && n !== CACHE_APP)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;

  // Todo lo que escribe (server actions, /api/voz) va derecho a la red.
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Assets con hash en el nombre: cachear es seguro y hace que abra al toque.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/iconos/")) {
    evento.respondWith(
      caches.open(CACHE_ESTATICO).then(async (cache) => {
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const respuesta = await fetch(pedido);
        if (respuesta.ok) cache.put(pedido, respuesta.clone());
        return respuesta;
      }),
    );
    return;
  }

  // Páginas: siempre de la red. Si no hay señal, la página de cortesía.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido).catch(async () => {
        const cache = await caches.open(CACHE_APP);
        const guardado = await cache.match(SIN_CONEXION);
        return (
          guardado ??
          new Response("Sin conexión", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
  }
});
