CREATE TYPE "public"."categoria_gasto" AS ENUM('alquiler', 'servicios', 'sueldos', 'impuestos', 'fletes', 'mantenimiento', 'retiro', 'otros');--> statement-breakpoint
CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"total_declarado" boolean DEFAULT true NOT NULL,
	"fecha" date NOT NULL,
	"pagado_en" date,
	"comprobante" text,
	"nota" text,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"descripcion" text,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"unidades_por_bulto" integer DEFAULT 1 NOT NULL,
	"importe_centavos" bigint,
	"posicion" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria" "categoria_gasto" DEFAULT 'otros' NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"descripcion" text,
	"fecha" date NOT NULL,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"telefono" text,
	"nota" text,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"nota" text,
	"fecha" date NOT NULL,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_proveedor_idx" ON "compras" USING btree ("proveedor_id");--> statement-breakpoint
CREATE INDEX "compras_fecha_idx" ON "compras" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "compras_pagado_idx" ON "compras" USING btree ("pagado_en");--> statement-breakpoint
CREATE INDEX "compras_items_compra_idx" ON "compras_items" USING btree ("compra_id");--> statement-breakpoint
CREATE INDEX "gastos_fecha_idx" ON "gastos" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "proveedores_nombre_normalizado_key" ON "proveedores" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha");