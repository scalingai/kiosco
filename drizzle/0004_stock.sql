CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"proveedor_id" uuid,
	"falta" boolean DEFAULT false NOT NULL,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compras_items" ADD COLUMN "producto_id" uuid;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "productos_nombre_normalizado_key" ON "productos" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "productos_falta_idx" ON "productos" USING btree ("falta");--> statement-breakpoint
ALTER TABLE "compras_items" ADD CONSTRAINT "compras_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;