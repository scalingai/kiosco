/**
 * Service worker de El Osito.
 *
 * Hace UNA sola cosa: cachear los assets estáticos de Next, que llevan hash en
 * el nombre y por lo tanto nunca quedan viejos. Nada más.
 *
 * En particular NO toca la navegación. Antes la interceptaba para mostrar una
 * página propia cuando no había señal, y el resultado fue que la app decía
 * "sin conexión" estando el servidor perfectamente arriba. Un service worker
 * que miente sobre el estado de la app es peor que no tener ninguno: acá se
 * maneja plata y el que está del otro lado necesita saber si lo que ve es real.
 * Si no hay red, que la pantalla de error la ponga el navegador, que no se
 * equivoca.
 */
const VERSION = "v2";
const CACHE_ESTATICO = `osito-estatico-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((n) => n !== CACHE_ESTATICO).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Sólo lo inmutable. Todo lo demás —páginas, saldos, la API— va directo a la
  // red sin que este archivo se meta en el medio.
  const inmutable =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/iconos/");
  if (!inmutable) return;

  evento.respondWith(
    caches.open(CACHE_ESTATICO).then(async (cache) => {
      const guardado = await cache.match(pedido);
      if (guardado) return guardado;
      const respuesta = await fetch(pedido);
      if (respuesta.ok) cache.put(pedido, respuesta.clone());
      return respuesta;
    }),
  );
});
