import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae un .wasm y un .data que el bundler no debe tocar.
  serverExternalPackages: ["@electric-sql/pglite"],
  output: "standalone",
  // Las únicas imágenes de la app son el logo del oso, a 36 y 88px: optimizarlas
  // no gana nada y evita meter sharp en la imagen del contenedor.
  // Si algún día se suben fotos de productos, sacá esta línea y agregá `sharp`
  // a las dependencias.
  images: { unoptimized: true },
  // Sin esto Turbopack sube buscando un lockfile y agarra uno suelto del home.
  turbopack: { root: __dirname },
};

export default nextConfig;
