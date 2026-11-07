ALTER TABLE "ventas" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_cliente_idx" ON "ventas" USING btree ("cliente_id");