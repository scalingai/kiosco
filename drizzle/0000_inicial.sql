CREATE TYPE "public"."origen_movimiento" AS ENUM('audio', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('fiado', 'pago');--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"telefono" text,
	"nota" text,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio_unitario_centavos" bigint,
	"posicion" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"total_declarado" boolean DEFAULT true NOT NULL,
	"nota" text,
	"fecha" date NOT NULL,
	"origen" "origen_movimiento" DEFAULT 'manual' NOT NULL,
	"transcripcion" text,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_nombre_normalizado_key" ON "clientes" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "items_movimiento_idx" ON "items" USING btree ("movimiento_id");--> statement-breakpoint
CREATE INDEX "movimientos_cliente_idx" ON "movimientos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "movimientos_fecha_idx" ON "movimientos" USING btree ("fecha");