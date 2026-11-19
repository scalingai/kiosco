ALTER TYPE "public"."categoria_gasto" ADD VALUE 'inversion' BEFORE 'alquiler';--> statement-breakpoint
CREATE TABLE "socios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"objetivo_centavos" bigint DEFAULT 0 NOT NULL,
	"posicion" integer DEFAULT 0 NOT NULL,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "socio_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "socios_nombre_normalizado_key" ON "socios" USING btree ("nombre_normalizado");--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_socio_id_socios_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."socios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gastos_socio_idx" ON "gastos" USING btree ("socio_id");