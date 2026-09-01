import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae un .wasm y un .data que el bundler no debe tocar.
  serverExternalPackages: ["@electric-sql/pglite"],
  output: "standalone",
  // Sin esto Turbopack sube buscando un lockfile y agarra uno suelto del home.
  turbopack: { root: __dirname },
};

export default nextConfig;
