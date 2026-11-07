CREATE TYPE "public"."estado_pedido" AS ENUM('nuevo', 'preparando', 'listo', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_entrega" AS ENUM('retiro', 'envio');--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "pedidos_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"entrega" "tipo_entrega" DEFAULT 'retiro' NOT NULL,
	"direccion" text,
	"nota" text,
	"total_centavos" bigint NOT NULL,
	"estado" "estado_pedido" DEFAULT 'nuevo' NOT NULL,
	"venta_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"posicion" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_items" ADD CONSTRAINT "pedidos_items_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_items" ADD CONSTRAINT "pedidos_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_estado_idx" ON "pedidos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "pedidos_creado_idx" ON "pedidos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "pedidos_items_pedido_idx" ON "pedidos_items" USING btree ("pedido_id");