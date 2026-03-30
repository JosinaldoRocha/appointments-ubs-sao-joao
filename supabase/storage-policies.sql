-- =============================================================================
-- Corrige: "new row violates row-level security policy" ao enviar imagem
-- Rode no Supabase: SQL Editor → New query → Colar → Run
-- =============================================================================
-- O bucket DEVE existir e o id DEVE ser exatamente: whatsapp-agenda-docs
-- (Storage → Create bucket → mesmo nome do código em src/services/storageUpload.js)
-- Marque o bucket como "Public" para o link abrir no WhatsApp.
-- =============================================================================

-- Remove políticas antigas deste guia (ignore erro se não existirem)
DROP POLICY IF EXISTS "Public read whatsapp agenda" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload whatsapp agenda" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads whatsapp-agenda-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read whatsapp-agenda-docs" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_whatsapp_agenda_docs" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_whatsapp_agenda_docs" ON storage.objects;
DROP POLICY IF EXISTS "public_select_whatsapp_agenda_docs" ON storage.objects;

-- Leitura: qualquer um pode gerar URL pública (bucket marcado como público)
CREATE POLICY "public_select_whatsapp_agenda_docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-agenda-docs');

-- Upload: o app usa a chave ANON (role "anon" no Postgres)
CREATE POLICY "anon_insert_whatsapp_agenda_docs"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'whatsapp-agenda-docs');

-- Reforço: role PUBLIC (alguns ambientes só aplicam esta)
CREATE POLICY "public_insert_whatsapp_agenda_docs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'whatsapp-agenda-docs');
