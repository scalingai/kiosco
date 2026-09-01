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
