-- Trigram search for fast "contains" customer name search (pg_trgm is a trusted extension).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "customers_whatsapp_idx" ON "customers"("whatsapp");

-- CreateIndex
CREATE INDEX "customers_name_trgm_idx" ON "customers" USING GIN ("name" gin_trgm_ops);
