ALTER TABLE "compras" ADD COLUMN "en_blanco" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "precio_venta_centavos" bigint;