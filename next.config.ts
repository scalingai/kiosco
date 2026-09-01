import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae un .wasm y un .data que el bundler no debe tocar.
  serverExternalPackages: ["@electric-sql/pglite"],
  output: "standalone",
  // Las únicas imágenes son el logo del oso, a 36 y 88px. Optimizarlas no gana
  // nada y arrastra sharp, que en el build standalone se queda sin
  // @emnapi/runtime y tira el server abajo.
  images: { unoptimized: true },
  // Sin esto Turbopack sube buscando un lockfile y agarra uno suelto del home.
  turbopack: { root: __dirname },
};

export default nextConfig;
