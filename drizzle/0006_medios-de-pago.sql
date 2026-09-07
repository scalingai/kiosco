CREATE TYPE "public"."medio_pago" AS ENUM('efectivo', 'mercadopago', 'banco');--> statement-breakpoint
ALTER TABLE "compras" ADD COLUMN "medio" "medio_pago";--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN "medio" "medio_pago" DEFAULT 'efectivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "medio" "medio_pago" DEFAULT 'efectivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "medio" "medio_pago" DEFAULT 'efectivo' NOT NULL;