ALTER TABLE "productos" ADD COLUMN "codigo_barras" text;--> statement-breakpoint
CREATE UNIQUE INDEX "productos_codigo_barras_key" ON "productos" USING btree ("codigo_barras");