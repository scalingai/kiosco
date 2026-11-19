# Menú nuevo y las páginas que cuelgan de él

**Estado:** propuesto · **Fecha:** 2026-11-19 · **Autor:** Claude

## La idea en una línea

Hoy el menú tiene **11 entradas planas**, muchas de las cuales son la misma
pregunta mirada desde otro lado. Pasa a **5 secciones + una acción**, y cada
sección se convierte en una planilla densa tipo Excel que ocupa todo el ancho.

## El menú

| Hoy (11) | Pasa a ser |
|---|---|
| Inicio | **Inicio** |
| Ventas · Fiado · Historial | **Ventas** — la planilla de ventas; Fiado e Historial son solapas adentro |
| Stock · Compras · Reponer | **Stock** — el catálogo; Compras es el historial adentro, y Reponer pasa a ser *cargar una compra* |
| Pedidos | **Pedidos** — los de los clientes de la vidriera |
| Caja · Inversión | **Finanzas** — balance día/semana/mes, ganancia, inversión y reparto |
| Sucursales | *se va* |
| Nueva venta · Nueva compra · Anotar por audio | **Nueva venta** (sola) |

**Por qué se juntan así:** no es por gusto de ordenar. Fiado es *una venta que
todavía no se cobró* y Compras es *de dónde salió lo que hay en Stock*: hoy son
tres entradas que te obligan a saber de antemano en qué pantalla vive el dato
que buscás. Adentro de su sección, el dato está donde uno lo iría a buscar.

**Reponer deja de ser un concepto.** Es la misma planilla de cargar una compra,
empezada antes de que venga el proveedor y con los importes en blanco. El modelo
de datos ya lo soporta: `reposiciones_items.importe_bulto_centavos` es nullable
justamente porque "todavía no sabemos" no es cero. Cuando el proveedor canta los
precios, la misma pantalla la cierra como compra.

## El menú, cómo se ve

- Ícono **grande** adentro de un cuadrado de vidrio (`bg-white/12` +
  `backdrop-blur` + borde `white/15`), etiqueta **abajo**, no al costado.
- La columna pasa de `w-56` a `w-24`: 5 ítems entran sin scroll y se recupera
  ancho para la planilla, que es lo que se mira todo el día.
- Logo nuevo (el oso con la gorra) arriba, sin el texto "El Osito" al lado: el
  logo ya lo dice.
- El activo se marca con el cuadrado lleno, no con un fondo detrás del texto.

## El patrón de página (lo que se copia de AppGenda)

Las cuatro pantallas de datos comparten el MISMO esqueleto, en este orden:

1. **Barra de período** — `Día · Semana · Mes · Todo` con flechas ‹ › al lado
   del título. Es el control principal; todo lo de abajo responde a él.
2. **Tira de KPIs** — recuadros chicos y apretados con los conteos, y a la
   derecha el número grande que importa (lo que entró / lo que falta).
3. **Buscador + filtros** en una fila sola.
4. **La planilla**, densa, al ancho completo, con los totales en el pie.

Reglas de la planilla, que es lo que hace que se lea como Excel y no como una
lista de tarjetas:

- **Una columna por medio de pago**, no una columna "medio". Se ve toda la
  mezcla del día de un vistazo. `ventas_pagos` ya guarda el dato así.
- **Un vacío se escribe `—`**, nunca en blanco: en blanco no se distingue de un
  dato que no cargó.
- Números a la derecha, con cifras tabulares, sin cortar de renglón.
- Fila densa (`py-2`), tipografía chica, primera columna fija al hacer scroll.
- Totales en el `tfoot`, no arriba: arriba van los KPIs, que es otra cosa.
- Estado como pastilla con ícono.

Esto ya existe a medias en `src/components/Tabla.tsx` — tiene totales y columna
fija. Le falta la densidad, el `—` y la columna por medio.

## Lo que hay que construir primero (compartido)

Si esto lo hacen cuatro agentes a la vez, se pisan. Va primero y lo hago yo:

- `Menu.tsx` reescrito + logo nuevo en `public/`.
- `BarraPeriodo.tsx` — el selector día/semana/mes/todo, con la fecha en la URL.
- `Tira.tsx` — la tira de KPIs.
- `Pastilla.tsx` — el chip de estado.
- `Solapas.tsx` — las solapas de adentro de una sección.
- `Tabla.tsx` — densidad, `—`, alineación.
- `src/lib/periodo.ts` — resolver `?periodo=mes&fecha=…` a un rango, una sola
  vez y bien, porque las cuatro páginas lo necesitan igual.

## Las páginas (un agente cada una, en paralelo)

### Ventas — `/ventas`
Planilla de ventas al estilo del primer pantallazo de AppGenda: Nº, hora,
cliente, detalle, total, descuento, **una columna por medio**, estado, acción.
KPIs: cantidad, ticket promedio, pendientes de QR, anuladas; a la derecha, lo
cobrado del período. Solapas: **Ventas · Fiado · Historial**.
Fiado conserva `TablaDeudores`; Historial, el movimiento por movimiento.

### Stock — `/stock`
El catálogo como planilla: foto, producto, rubro, costo, precio, margen real,
última compra. Solapas: **Catálogo · Compras · Cargar compra**.
Compras = el historial que hoy vive en `/compras` con sus cuatro cortes.
Cargar compra = lo que hoy es `/reponer`, con la planilla de renglones.

### Finanzas — `/finanzas`
La más nueva. Tres bloques:
1. **Balance del período** — ventas, compras, gastos, **ganancia**. La ganancia
   sale de `ventas_items.costo_unitario_centavos`, que se congela al vender.
   ⚠️ Las ventas cargadas como total suelto (`total_declarado = true`) no tienen
   ítems y por lo tanto **no tienen costo**: la página dice sobre qué porcentaje
   de las ventas está calculada la ganancia, en vez de mostrar un número que
   parece exacto y no lo es.
2. **Inversión inicial** — lo que ya existe, movido acá adentro.
3. **Reparto** — la ganancia queda en el negocio hasta que se retira. Cuando se
   retira, se divide 50/50. No hace falta tabla nueva: los retiros ya son
   `gastos.categoria = 'retiro'` y ahora tienen `socio_id`. La pantalla muestra
   ganancia acumulada, cuánto se llevó cada uno y cuánto le tocaría.

### Inicio y Pedidos
Inicio: las tres o cuatro cifras del día y los accesos. Pedidos: la planilla de
los pedidos de la vidriera, mismo patrón.

## Lo que NO se hace

- No se toca el modelo de datos. Todo lo de arriba sale de lo que ya hay.
- No se borra `/api/voz`: el micrófono sale del menú y queda adentro de Nueva
  venta, que es donde sirve (anotar con las manos ocupadas).
- No se borran rutas viejas de golpe: redirigen, así un link guardado no muere.
