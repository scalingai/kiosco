CREATE TYPE "public"."unidad_medida" AS ENUM('un', 'gr', 'ml');--> statement-breakpoint
ALTER TABLE "compras_items" ADD COLUMN "unidad" "unidad_medida" DEFAULT 'un' NOT NULL;