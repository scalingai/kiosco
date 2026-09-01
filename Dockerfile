# Imagen de El Osito. Next 16 en modo standalone: el build deja en
# .next/standalone un server.js con sólo las dependencias que de verdad usa,
# así que la imagen final no lleva ni node_modules completo ni el código fuente.

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencias ────────────────────────────────────────────────────────────
FROM base AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
# El build no toca la base: todas las páginas son dinámicas.
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 osito \
 && useradd --system --uid 1001 --gid osito osito

COPY --from=build --chown=osito:osito /app/public ./public
COPY --from=build --chown=osito:osito /app/.next/standalone ./
COPY --from=build --chown=osito:osito /app/.next/static ./.next/static
# Las migraciones se aplican solas al arrancar, así que el SQL tiene que estar
# en la imagen. Se copia explícito y no se confía en el trace de Next.
COPY --from=build --chown=osito:osito /app/drizzle ./drizzle

USER osito
EXPOSE 3000

CMD ["node", "server.js"]
