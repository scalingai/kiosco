CREATE TABLE "sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"mp_access_token" text,
	"mp_refresh_token" text,
	"mp_token_vence_en" timestamp with time zone,
	"mp_user_id" text,
	"mp_store_id" text,
	"mp_pos_id" text,
	"mp_external_pos_id" text,
	"mp_qr_imagen" text,
	"archivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "sucursal_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "pendiente_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "mp_order_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sucursales_nombre_normalizado_key" ON "sucursales" USING btree ("nombre_normalizado");--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_pendiente_idx" ON "ventas" USING btree ("pendiente_en");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_mp_order_key" ON "ventas" USING btree ("mp_order_id");