CREATE TABLE "marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "marca_id" uuid;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "contenido" integer;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "contenido_unidad" "unidad_medida";--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_nombre_normalizado_key" ON "marcas" USING btree ("nombre_normalizado");--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE set null ON UPDATE no action;