CREATE TABLE "notas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcripcion" text NOT NULL,
	"aplicada" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "nota_id" uuid;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_nota_id_notas_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."notas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_nota_idx" ON "movimientos" USING btree ("nota_id");