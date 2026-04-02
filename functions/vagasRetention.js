/**
 * Regra de retenção dos documentos `vagas/{id}`:
 * excluir 24h após o fim do dia local da data de atendimento (campo `atendimentoDate`,
 * legado `data`, ou prefixo YYYY-MM-DD no ID). Vale para qualquer antecedência de agendamento.
 */

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;

function extractDateFromVagaDoc(id, data) {
  if (data && typeof data.atendimentoDate === "string" && ISO_YMD.test(data.atendimentoDate)) {
    return data.atendimentoDate;
  }
  if (data && typeof data.data === "string" && ISO_YMD.test(data.data)) {
    return data.data;
  }
  const m = /^(\d{4}-\d{2}-\d{2})_/.exec(String(id || ""));
  return m ? m[1] : null;
}

/** Fim do dia local (23:59:59.999) para uma data AAAA-MM-DD. */
function endOfLocalDayMs(isoYmd) {
  const [y, mo, d] = isoYmd.split("-").map(Number);
  return new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Instant em que o registro pode ser apagado: 24h após o fim do dia de atendimento (local).
 */
function vagaDeleteNotBeforeMs(isoYmd) {
  return endOfLocalDayMs(isoYmd) + 24 * 60 * 60 * 1000;
}

/**
 * @param {string} isoYmd
 * @param {number} [nowMs] — default: Date.now()
 */
function vagaDocShouldBeDeleted(isoYmd, nowMs = Date.now()) {
  return nowMs > vagaDeleteNotBeforeMs(isoYmd);
}

const BATCH = 450;

/**
 * Apaga em `vagas` os documentos cuja data de atendimento já passou da janela de retenção.
 * @returns {number} quantidade removida
 */
async function deleteExpiredVagasInFirestore(db, nowMs = Date.now()) {
  const snap = await db.collection("vagas").get();
  const refs = [];
  snap.forEach((doc) => {
    const iso = extractDateFromVagaDoc(doc.id, doc.data());
    if (iso && vagaDocShouldBeDeleted(iso, nowMs)) refs.push(doc.ref);
  });
  if (refs.length === 0) return 0;
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
  return refs.length;
}

module.exports = {
  extractDateFromVagaDoc,
  vagaDeleteNotBeforeMs,
  vagaDocShouldBeDeleted,
  deleteExpiredVagasInFirestore,
};
