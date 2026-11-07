CREATE TABLE "ventas_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" text,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"costo_unitario_centavos" bigint,
	"posicion" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas_pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"medio" "medio_pago" NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "total_declarado" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas_items" ADD CONSTRAINT "ventas_items_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_items" ADD CONSTRAINT "ventas_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_pagos" ADD CONSTRAINT "ventas_pagos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_items_venta_idx" ON "ventas_items" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "ventas_items_producto_idx" ON "ventas_items" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "ventas_pagos_venta_idx" ON "ventas_pagos" USING btree ("venta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_pagos_venta_medio_key" ON "ventas_pagos" USING btree ("venta_id","medio");