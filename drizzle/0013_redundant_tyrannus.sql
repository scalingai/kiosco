CREATE TABLE "compras_pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"medio" "medio_pago" NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compras_pagos" ADD CONSTRAINT "compras_pagos_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_pagos_compra_idx" ON "compras_pagos" USING btree ("compra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compras_pagos_compra_medio_key" ON "compras_pagos" USING btree ("compra_id","medio");