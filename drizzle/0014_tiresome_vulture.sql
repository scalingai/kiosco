ALTER TABLE "compras" ADD COLUMN "descuento_centavos" bigint;--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "descuento_nota" text;--> statement-breakpoint
ALTER TABLE "compras_items" ADD COLUMN "descuento_centavos" bigint;--> statement-breakpoint
ALTER TABLE "compras_items" ADD COLUMN "descuento_nota" text;