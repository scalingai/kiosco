# Imagen de El Osito. Next 16 en modo standalone: el build deja en
# .next/standalone un server.js con sólo las dependencias que de verdad usa,
# así que la imagen final no lleva ni node_modules completo ni el código fuente.

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencias ────────────────────────────────────────────────────────────
FROM base AS dependencias
WORKDIR /app

# El lockfile lo genera npm 11. Que la imagen traiga otro npm es una diferencia
# que no aporta nada y sí puede romper `npm ci`, así que se fija.
RUN npm install -g npm@11.6.1

COPY package.json package-lock.json ./

# Si `npm ci` falla, BuildKit muestra sólo el final de la salida y el mensaje
# concreto de npm queda arriba, fuera de pantalla. Escupir el log de debug acá
# lo deja como últimas líneas, que es lo que se ve.
RUN node -v && npm -v \
 && ( npm ci --no-audit --no-fund \
      || ( echo "######## ERROR REAL DE npm ci ########" \
        && tail -n 60 /root/.npm/_logs/*-debug-0.log \
        && echo "######################################" \
        && exit 1 ) )

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
