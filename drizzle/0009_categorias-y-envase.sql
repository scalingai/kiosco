CREATE TYPE "public"."tipo_envase" AS ENUM('botella', 'retornable', 'lata', 'tetra', 'otro');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"padre_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "categoria_id" uuid;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "envase" "tipo_envase";--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_nombre_normalizado_key" ON "categorias" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "categorias_padre_idx" ON "categorias" USING btree ("padre_id");--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;