// Upload de imagens da solicitação — Firebase Storage.
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

const UPLOAD_TIMEOUT_MS = 120000;

export async function uploadDocumentoPacienteSolicitacao(file) {
  const safe = (file.name || "doc").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const path = `solicitacoes-whatsapp/${id}_${safe}`;

  const tarefa = (async () => {
    const objectRef = ref(storage, path);
    try {
      await uploadBytes(objectRef, file, {
        contentType: file.type || "image/jpeg",
      });
    } catch (err) {
      const msg = String(err?.message || "");
      if (/storage\/unauthorized|permission/i.test(msg)) {
        throw new Error(
          "O Firebase Storage bloqueou o upload (sem permissão). Verifique as regras de Storage para permitir o envio de imagens de solicitação."
        );
      }
      if (/storage\/bucket-not-found/i.test(msg)) {
        throw new Error(
          "Bucket do Firebase Storage não encontrado. Confira o campo storageBucket na configuração do Firebase."
        );
      }
      if (/failed to fetch|network/i.test(msg)) {
        throw new Error(
          "Falha de conexão ao enviar para o Firebase Storage. Verifique sua internet e tente novamente."
        );
      }
      throw new Error(msg || "Falha ao enviar a imagem para o Firebase Storage.");
    }

    const publicUrl = await getDownloadURL(objectRef);
    if (!publicUrl) {
      throw new Error("Não foi possível obter o link público da imagem.");
    }
    return publicUrl;
  })();

  return Promise.race([
    tarefa,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Tempo esgotado ao enviar a imagem. Verifique a internet e o Firebase Storage."
            )
          ),
        UPLOAD_TIMEOUT_MS
      )
    ),
  ]);
}

/** Envia várias imagens da mesma solicitação (em paralelo). */
export async function uploadDocumentosPacienteSolicitacao(files) {
  const lista = Array.from(files || []).filter(Boolean);
  if (!lista.length) return [];
  return Promise.all(lista.map((file) => uploadDocumentoPacienteSolicitacao(file)));
}
