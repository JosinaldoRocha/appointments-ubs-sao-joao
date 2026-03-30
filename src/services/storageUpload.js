// Upload de imagens da solicitação — Supabase Storage (substitui Firebase Storage).
import { getSupabaseBrowser } from "./supabaseClient";

/** Nome do bucket no painel do Supabase (Storage → criar bucket com este id). */
export const SUPABASE_STORAGE_BUCKET = "whatsapp-agenda-docs";

const UPLOAD_TIMEOUT_MS = 120000;

export async function uploadDocumentoPacienteSolicitacao(file) {
  const safe = (file.name || "doc").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const path = `${id}_${safe}`;

  const supabase = getSupabaseBrowser();

  const tarefa = (async () => {
    const { error: upErr } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) {
      const msg = upErr.message || "";
      if (/row-level security|RLS|violates/i.test(msg)) {
        throw new Error(
          "O Supabase Storage bloqueou o upload (políticas RLS). No painel: SQL Editor → rode o arquivo supabase/storage-policies.sql. Confira se o bucket se chama exatamente whatsapp-agenda-docs."
        );
      }
      throw new Error(msg || "Falha ao enviar a imagem para o Supabase Storage.");
    }

    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error("Não foi possível obter o link público da imagem.");
    }
    return data.publicUrl;
  })();

  return Promise.race([
    tarefa,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Tempo esgotado ao enviar a imagem. Verifique a internet e o Supabase Storage."
            )
          ),
        UPLOAD_TIMEOUT_MS
      )
    ),
  ]);
}
