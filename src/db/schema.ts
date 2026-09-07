import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * El fiado se lleva como libro mayor: no existe un campo "saldo" que se pise.
 * El saldo de un cliente es siempre la suma de sus movimientos, así cualquier
 * número que muestre la app se puede explicar fila por fila.
 */

export const tipoMovimiento = pgEnum("tipo_movimiento", ["fiado", "pago"]);
export const origenMovimiento = pgEnum("origen_movimiento", ["audio", "manual"]);

/**
 * Cada audio deja su nota, se confirme o no. Si dictaste algo y después
 * descartaste la propuesta, lo que dijiste sigue estando: es el papelito del
 * mostrador, y perderlo es perder la única prueba de qué se anotó.
 */
export const notas = pgTable("notas", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** lo que devolvió Whisper, crudo */
  transcripcion: text("transcripcion").notNull(),
  /** quedó en true cuando de esa nota salió al menos un movimiento */
  aplicada: boolean("aplicada").notNull().default(false),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    /** nombre normalizado (sin acentos, minúsculas) para buscar y deduplicar */
    nombreNormalizado: text("nombre_normalizado").notNull(),
    telefono: text("telefono"),
    nota: text("nota"),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("clientes_nombre_normalizado_key").on(t.nombreNormalizado)],
);

export const movimientos = pgTable(
  "movimientos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    tipo: tipoMovimiento("tipo").notNull(),
    /**
     * Siempre positivo y en centavos. Entero, nunca float: 0.1 + 0.2 no da 0.3
     * y con plata ajena eso no se negocia. El signo lo da `tipo`.
     */
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    /**
     * `true` cuando alguien dijo el total ("le fié tres mil"). `false` cuando el
     * total salió de sumar los ítems. La diferencia importa: si el total lo dijo
     * una persona, un ítem sin precio ya está cubierto; si no, esa línea no está
     * cobrada y hay que avisarlo.
     */
    totalDeclarado: boolean("total_declarado").notNull().default(true),
    nota: text("nota"),
    fecha: date("fecha").notNull(),
    origen: origenMovimiento("origen").notNull().default("manual"),
    /** la nota de voz de la que salió este movimiento */
    notaId: uuid("nota_id").references(() => notas.id, { onDelete: "set null" }),
    /**
     * @deprecated La transcripción vive en `notas`. Esta columna queda por los
     * movimientos cargados antes de que existiera esa tabla; no se escribe más.
     */
    transcripcion: text("transcripcion"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movimientos_cliente_idx").on(t.clienteId),
    index("movimientos_fecha_idx").on(t.fecha),
    index("movimientos_nota_idx").on(t.notaId),
  ],
);

/**
 * Lo que se llevó, línea por línea. El precio es opcional a propósito: en el
 * mostrador muchas veces se anota "dos gaseosas y pan" y el precio se pone
 * después, o nunca porque ya se dijo el total.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    movimientoId: uuid("movimiento_id")
      .notNull()
      .references(() => movimientos.id, { onDelete: "cascade" }),
    /**
     * Puede faltar: en el mostrador a veces se anota sólo el monto, sin decir
     * qué se llevó. Descartar ese renglón sería perder plata en silencio.
     */
    descripcion: text("descripcion"),
    cantidad: integer("cantidad").notNull().default(1),
    precioUnitarioCentavos: bigint("precio_unitario_centavos", {
      mode: "number",
    }),
    /** para conservar el orden en que se dictaron */
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [index("items_movimiento_idx").on(t.movimientoId)],
);

export type Nota = typeof notas.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type NuevoMovimiento = typeof movimientos.$inferInsert;
export type Item = typeof items.$inferSelect;

/* ────────────────────────────────────────────────────────────────────────────
 * El otro libro: la plata del negocio.
 *
 * El fiado de arriba responde "quién me debe". Esto responde "cómo me fue hoy":
 * lo que vendí, lo que compré, lo que gasté. Son dos libros separados a
 * propósito —un fiado no es plata que entró, es plata que salió a la calle—
 * pero se cruzan en la pantalla del día, porque cuando un cliente paga su
 * cuenta esa plata sí entra a la caja.
 *
 * Mismas reglas que el fiado, sin excepciones: centavos enteros en `bigint`,
 * nada se borra (`anulado_en`), y ningún total se guarda: se suma al leer.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * En qué se va la plata que no es mercadería. `retiro` es lo que saca el dueño
 * para él: no es un gasto del kiosco, pero si no se anota el día nunca cierra y
 * uno termina buscando un faltante que no existe.
 */
export const categoriaGasto = pgEnum("categoria_gasto", [
  "alquiler",
  "servicios",
  "sueldos",
  "impuestos",
  "fletes",
  "mantenimiento",
  "retiro",
  "otros",
]);

export const proveedores = pgTable(
  "proveedores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    /** mismo truco que en clientes: sin acentos y en minúsculas, para no duplicar */
    nombreNormalizado: text("nombre_normalizado").notNull(),
    telefono: text("telefono"),
    nota: text("nota"),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("proveedores_nombre_normalizado_key").on(t.nombreNormalizado),
  ],
);

/**
 * Lo que entró de mercadería. Dos fechas distintas a propósito:
 *
 * - `fecha` es cuándo llegó el pedido.
 * - `pagadoEn` es cuándo saliste la plata. Si está en null, esa compra todavía
 *   se la debés al proveedor y NO toca la caja de ningún día.
 *
 * Separarlas es lo que hace que el balance del día diga la verdad: la mercadería
 * que te dejaron el martes y pagás el viernes es plata que sale el viernes.
 */
export const compras = pgTable(
  "compras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proveedorId: uuid("proveedor_id")
      .notNull()
      .references(() => proveedores.id, { onDelete: "restrict" }),
    /** Siempre positivo y en centavos, igual que en movimientos. */
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    /**
     * `true` cuando el total lo dice la factura. `false` cuando salió de sumar
     * los renglones. Misma distinción que en el fiado: con `false` y renglones
     * sin precio, ese total todavía no es el total.
     */
    totalDeclarado: boolean("total_declarado").notNull().default(true),
    fecha: date("fecha").notNull(),
    /** null = impaga, se le debe al proveedor */
    pagadoEn: date("pagado_en"),
    /** número de factura o remito, para poder buscar el papel */
    comprobante: text("comprobante"),
    nota: text("nota"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compras_proveedor_idx").on(t.proveedorId),
    index("compras_fecha_idx").on(t.fecha),
    index("compras_pagado_idx").on(t.pagadoEn),
  ],
);

/**
 * El detalle de una compra, renglón por renglón.
 *
 * Acá el fiado y la compra se parecen pero NO son lo mismo, y por eso el
 * renglón se guarda distinto. Al cliente le vendés una unidad y sabés el precio
 * de esa unidad. Al proveedor le comprás un pack: la factura dice "3 packs de
 * gaseosa, $36.000", y el precio por unidad no está escrito en ningún lado.
 *
 * Entonces lo que se guarda es lo que dice el papel —cuántos bultos, cuántas
 * unidades trae cada uno, y cuánta plata— y el costo por unidad se CALCULA al
 * mostrarlo. Guardarlo redondeado sería peor que no tenerlo: $36.000 entre 3
 * packs de 6 da $2.000, pero entre 7 unidades no da un número redondo, y ese
 * resto multiplicado por la cantidad deja de sumar lo que de verdad pagaste.
 *
 * `unidadesPorBulto` es además lo que va a necesitar el stock cuando exista:
 * un pack que entra son N unidades para vender.
 */
export const comprasItems = pgTable(
  "compras_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compraId: uuid("compra_id")
      .notNull()
      .references(() => compras.id, { onDelete: "cascade" }),
    descripcion: text("descripcion"),
    /**
     * Con qué producto del catálogo engancha este renglón. Es lo que hace que
     * la lista de reposición se llene sola: si falta, el renglón igual vale
     * como plata, sólo que no alimenta el catálogo.
     */
    productoId: uuid("producto_id").references(() => productos.id, {
      onDelete: "set null",
    }),
    /** cuántos bultos entraron (packs, cajas, bolsas… o unidades sueltas) */
    cantidad: integer("cantidad").notNull().default(1),
    /** cuántas unidades de venta trae cada bulto; 1 si se compra suelto */
    unidadesPorBulto: integer("unidades_por_bulto").notNull().default(1),
    /**
     * Lo que se pagó por TODO el renglón, en centavos. Puede faltar: a veces
     * llega el remito sin precios y la factura viene después.
     */
    importeCentavos: bigint("importe_centavos", { mode: "number" }),
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [index("compras_items_compra_idx").on(t.compraId)],
);

export const gastos = pgTable(
  "gastos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoria: categoriaGasto("categoria").notNull().default("otros"),
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    descripcion: text("descripcion"),
    fecha: date("fecha").notNull(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("gastos_fecha_idx").on(t.fecha)],
);

/**
 * Lo que se vendió. Hoy es un renglón por carga —el total del turno o del día—
 * y no uno por ticket. Que sea un libro mayor y no una fila por fecha es lo que
 * permite anotar mañana y tarde por separado, corregir anulando en vez de
 * pisar, y el día que se carguen las ventas una por una, que entren en esta
 * misma tabla sin migrar nada: el total del día sigue siendo la suma.
 */
export const ventas = pgTable(
  "ventas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    nota: text("nota"),
    fecha: date("fecha").notNull(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ventas_fecha_idx").on(t.fecha)],
);

export type Proveedor = typeof proveedores.$inferSelect;
export type Compra = typeof compras.$inferSelect;
export type CompraItem = typeof comprasItems.$inferSelect;
export type Gasto = typeof gastos.$inferSelect;
export type Venta = typeof ventas.$inferSelect;
export type CategoriaGasto = (typeof categoriaGasto.enumValues)[number];

/**
 * El catálogo de lo que se vende. NO es un inventario: no lleva cuántas
 * unidades hay, porque para eso habría que cargar cada venta una por una y una
 * cuenta que nadie actualiza miente peor que no tenerla.
 *
 * Lo que sí lleva es lo que se usa para reponer: a quién se le compra, a cuánto
 * salió la última vez, y si falta. Y se llena solo: cada renglón de compra que
 * tenga nombre engancha con su producto, así la lista aparece sin que nadie se
 * siente a cargarla.
 */
export const productos = pgTable(
  "productos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),
    /** a quién se le suele comprar; lo escribe la última compra */
    proveedorId: uuid("proveedor_id").references(() => proveedores.id, {
      onDelete: "set null",
    }),
    /** marcado a mano cuando se ve el hueco en la góndola */
    falta: boolean("falta").notNull().default(false),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("productos_nombre_normalizado_key").on(t.nombreNormalizado),
    index("productos_falta_idx").on(t.falta),
  ],
);

export type Producto = typeof productos.$inferSelect;
