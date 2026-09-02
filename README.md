# El Osito — Fiado

El fiado del maxikiosco: quién debe, cuánto y desde cuándo. Se carga hablando —
grabás un audio, Groq lo transcribe, un segundo modelo lo desarma en clientes,
productos y montos, y vos confirmás antes de que se anote.

Instalable como app en Android y iPhone desde el navegador.

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # y pegá tu GROQ_API_KEY adentro
npm run dev
```

No hace falta instalar Postgres. Sin `DATABASE_URL`, la app levanta **PGlite**
(Postgres compilado a WASM) y guarda todo en `.data/pg`.

```bash
npm run db:semilla   # opcional: carga clientes de ejemplo
rm -rf .data         # vaciar la base y empezar de cero
```

Si borrás `.data` con el server prendido, **reinicialo**: mantiene abierta la
base vieja y todo tira error hasta que arranque de nuevo.

## Variables de entorno

Van en `.env.local` para desarrollo (ese archivo **no se commitea**) y en el
panel de EasyPanel para producción. Están todas listadas en `.env.example`.

| Variable | ¿Obligatoria? | Qué es |
|---|---|---|
| `PIN_ACCESO` | **Sí en producción** | El PIN que se pide al entrar. En local podés dejarlo vacío y no pide nada; en producción, si falta, la app devuelve 503 en todas las páginas a propósito. |
| `GROQ_API_KEY` | Para el audio | La clave de Groq. Se saca de [console.groq.com/keys](https://console.groq.com/keys). Sin ella la app anda igual, pero el micrófono devuelve un error y hay que cargar a mano. |
| `DATABASE_URL` | En producción | La conexión al Postgres. **Vacía en local**: sin ella usa PGlite en `.data/pg`. |
| `GROQ_MODELO_AUDIO` | No | Por defecto `whisper-large-v3-turbo`. |
| `GROQ_MODELO_TEXTO` | No | Por defecto `openai/gpt-oss-120b`. |

`.env.local` queda así:

```
GROQ_API_KEY=gsk_loquesea
```

Y nada más: `DATABASE_URL` se deja afuera a propósito para que use la base local,
y `PIN_ACCESO` vacío para no tener que tipearlo en cada recarga mientras trabajás.

## El PIN

Todo está detrás de un PIN que sale de `PIN_ACCESO`. El PIN **nunca sale del
servidor**: lo que se guarda en el navegador es una cookie `httpOnly` firmada con
HMAC-SHA256 usando el propio PIN como clave. No se puede fabricar sin conocerlo,
y si cambiás el PIN se caen todas las sesiones abiertas.

La sesión dura 30 días. Hay un botón **Salir** arriba a la derecha.

Después de 5 intentos fallidos desde la misma IP hay que esperar un minuto. Ese
contador vive en memoria del proceso: se reinicia con la app y no se comparte
entre réplicas. Para un contenedor solo alcanza; si algún día hay más de uno,
tiene que ir a la base.

Quedan públicos a propósito el manifest, los iconos y el service worker: sin eso
Android y iOS no pueden ofrecer instalar la app antes de que nadie ponga el PIN.

**Un PIN de cuatro dígitos son diez mil combinaciones.** Con el freno de
intentos alcanza para el uso real, pero no es una contraseña. Usá seis dígitos o
más, y no lo compartas por WhatsApp.

## Cómo está pensado

**El fiado es un libro mayor, no un saldo.** No existe una columna `saldo` que se
pise. Cada fiado y cada pago es una fila en `movimientos`, y el saldo de un
cliente es la suma. Cualquier número que muestre la pantalla se puede explicar
fila por fila, que es lo único que sirve cuando alguien discute cuánto debe.

Por lo mismo, los movimientos **no se borran: se anulan**. La fila queda con
`anulado_en` y deja de sumar.

**La plata se guarda en centavos enteros.** Nunca `float`: `0.1 + 0.2` no da
`0.3`, y con plata ajena eso no se negocia.

**Un movimiento tiene ítems, y el precio de cada ítem es opcional.** Los tres
casos del mostrador funcionan:

| Lo que decís | Qué pasa |
|---|---|
| "dos gaseosas y pan, tres mil quinientos" | Se anotan los ítems y la deuda sube $3.500 (el total lo dijiste vos) |
| "tres alfajores a ochocientos cada uno" | La deuda sube $2.400, sumado de los precios |
| "leche y fideos, después le pongo el precio" | Se anotan los ítems y la deuda **no sube** |

Ese último caso queda marcado en rojo con **"faltan precios"**, en la lista y en
la ficha del cliente. Un ítem sin precio no vale cero: vale *todavía no sabemos*,
y la app lo dice en vez de comerse la diferencia en silencio. Esos clientes nunca
se esconden de la lista aunque su saldo esté en cero.

**Un audio nunca escribe solo.** `/api/voz` transcribe, interpreta y devuelve una
*propuesta*. Recién se anota cuando la persona confirma en pantalla, con la
transcripción cruda a la vista y todo editable. Whisper escribe "Fernández"
cuando dijiste "Hernández" y "dos mil" cuando dijiste "doce mil".

Antes de crear un cliente nuevo, se busca el más parecido entre los que ya
existen (`src/lib/nombres.ts`), así una letra de diferencia no abre una segunda
cuenta corriente para la misma persona.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Genera la migración SQL a partir del schema |
| `npm run db:semilla` | Carga datos de ejemplo en la base local |
| `npm run db:studio` | Drizzle Studio |

Las migraciones viven en `drizzle/` y **se aplican solas al arrancar**, contra
PGlite o contra Postgres según corresponda.

## Estructura

```
src/db/schema.ts         clientes, movimientos, items
src/db/client.ts         elige PGlite o Postgres y corre las migraciones
src/lib/consultas.ts     saldos, altas, anulaciones
src/lib/movimiento.ts    tipos y conversiones que comparten server y pantallas
src/lib/voz.ts           Groq: transcripción e interpretación
src/lib/plata.ts         centavos ↔ pesos, parseo de "12.500,50"
src/lib/nombres.ts       normalización y matching de nombres
src/app/acciones.ts      server actions (todas las escrituras pasan por acá)
src/app/manifest.ts      el manifest de la PWA
public/sw.js             service worker
scripts/semilla.ts       datos de ejemplo
```

## La PWA

El manifest está en `src/app/manifest.ts` y los iconos salen del logo, recortado
al oso con la corona (`public/iconos/`).

El service worker (`public/sw.js`) cachea **sólo** `/_next/static` y `/iconos`,
que llevan hash en el nombre y por lo tanto nunca quedan viejos. **No toca la
navegación ni la API.** Antes interceptaba la navegación para mostrar una
pantalla propia sin señal, y terminó diciendo "sin conexión" con el servidor
perfectamente arriba. Un service worker que miente sobre el estado de la app es
peor que no tener ninguno; si no hay red, la pantalla de error la pone el
navegador.

Para instalarla:

- **Android (Chrome):** menú ⋮ → "Instalar aplicación".
- **iPhone (Safari):** compartir → "Agregar a inicio". Safari no ofrece prompt
  automático, hay que hacerlo a mano.

En los dos casos **hace falta HTTPS**. En `localhost` también anda para probar;
por IP o HTTP plano, no.

## Deploy en EasyPanel → kiosco.naviacloud.com

Hacen falta **dos servicios** en el mismo proyecto de EasyPanel.

### 1. Postgres

En EasyPanel: **+ Service → Postgres**.

- Nombre del servicio: `db`
- Base de datos: `kiosco`
- Usuario y contraseña: los que genere EasyPanel (guardalos)
- **Volumen:** dejá el que viene por defecto. Sin volumen, los datos se pierden
  en cada redeploy.

**Copiá la URL de conexión que muestra el propio panel**, no la escribas de
memoria. EasyPanel arma el hostname interno como `proyecto_servicio`, así que
con el proyecto `kiosco` y el servicio `db` queda:

```
postgres://postgres:LA_CLAVE@kiosco_db:5432/kiosco
```

Ese host sólo resuelve dentro de la red del proyecto, que es lo que querés: la
base **no** se expone a internet.

### 2. La app

**+ Service → App**, apuntando al repo `scalingai/kiosco`, rama `main`.

En **Compilación** elegí **Dockerfile** (el repo tiene uno en la raíz). Nixpacks
y Railpack adivinan cómo construir y con el modo standalone de Next arman una
imagen enorme o directamente rota.

Variables de entorno del servicio:

```
DATABASE_URL=postgres://postgres:LA_CLAVE@kiosco_db:5432/kiosco
GROQ_API_KEY=gsk_loquesea
PIN_ACCESO=EL_PIN_QUE_ELIJAS
NODE_ENV=production
```

Dominio: `kiosco.naviacloud.com`, con el certificado que EasyPanel saca solo.
El HTTPS no es opcional acá: sin él no anda ni el micrófono ni la instalación.

Las migraciones corren solas la primera vez que arranca, así que no hay ningún
paso manual sobre la base.

### Backups

Postgres corriendo en un contenedor con un volumen **no es un backup**. Si el
VPS se muere, el fiado se murió con él. EasyPanel tiene backups programados por
servicio: prendelos antes de cargar datos de verdad.

## Qué falta

- La entrada es un PIN compartido: no hay usuarios ni queda registro de quién
  anotó cada cosa. Alcanza para un kiosco de una persona; si mañana hay
  empleados y hace falta saber quién cargó qué, hay que meter usuarios.
- No hay CI. Por ahora se verifica corriendo `typecheck`, `lint` y `build`.
- `_legacy-vite/` es el prototipo anterior (Vite + Express + SQLite, con
  compras/ventas/proveedores). Queda de referencia; no lo usa nadie.
