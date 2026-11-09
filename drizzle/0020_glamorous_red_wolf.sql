CREATE TABLE "reposiciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"en_blanco" boolean DEFAULT false NOT NULL,
	"nota" text,
	"cerrada_en" timestamp with time zone,
	"archivada_en" timestamp with time zone,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reposiciones_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reposicion_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"unidades_por_bulto" integer DEFAULT 1 NOT NULL,
	"importe_bulto_centavos" bigint,
	"posicion" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reposiciones" ADD CONSTRAINT "reposiciones_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposiciones_items" ADD CONSTRAINT "reposiciones_items_reposicion_id_reposiciones_id_fk" FOREIGN KEY ("reposicion_id") REFERENCES "public"."reposiciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposiciones_items" ADD CONSTRAINT "reposiciones_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reposiciones_proveedor_idx" ON "reposiciones" USING btree ("proveedor_id");--> statement-breakpoint
CREATE INDEX "reposiciones_items_reposicion_idx" ON "reposiciones_items" USING btree ("reposicion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reposiciones_items_unico" ON "reposiciones_items" USING btree ("reposicion_id","producto_id");