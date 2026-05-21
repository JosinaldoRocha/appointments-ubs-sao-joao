/**
 * Remove suspensões vencidas em `settings/ubs`:
 * - período: após o último dia (`ate`, inclusivo) cadastrado;
 * - pontual: datas anteriores ao dia local de referência.
 */

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;
const RE_SLOT_SUSPENSAO = /^(.+)_(\d{4}-\d{2}-\d{2})_(dia|manha|tarde)$/;

function todayYmdSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function suspensaoRegistroNaoExpirado(entry, todayStr) {
  if (!entry || typeof entry.desde !== "string" || !ISO_YMD.test(entry.desde.trim())) return false;
  if (entry.indefinido === true) return true;
  const ate = typeof entry.ate === "string" ? entry.ate.trim() : "";
  if (!ISO_YMD.test(ate)) return true;
  return todayStr <= ate;
}

function specTemRegistroSuspensao(specKey, map) {
  const e = map?.[specKey];
  return !!(e && typeof e.desde === "string" && ISO_YMD.test(e.desde.trim()));
}

function parseAtendimentoSuspensoSlotKey(key) {
  if (typeof key !== "string") return null;
  const m = key.trim().match(RE_SLOT_SUSPENSAO);
  if (!m) return null;
  return { specKey: m[1], data: m[2], escopo: m[3] };
}

function coletarLimpezaSuspensoesExpiradas(atendimentoSuspensoPorSpec, atendimentoSuspensoSlots, todayStr) {
  const periodoSpecKeys = [];
  for (const [specKey, entry] of Object.entries(atendimentoSuspensoPorSpec || {})) {
    if (!specTemRegistroSuspensao(specKey, atendimentoSuspensoPorSpec)) continue;
    if (!suspensaoRegistroNaoExpirado(entry, todayStr)) periodoSpecKeys.push(specKey);
  }
  const slotKeys = [];
  for (const key of Object.keys(atendimentoSuspensoSlots || {})) {
    const p = parseAtendimentoSuspensoSlotKey(key);
    if (!p) continue;
    if (p.data < todayStr) slotKeys.push(key);
  }
  return { periodoSpecKeys, slotKeys };
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} [hoje] — AAAA-MM-DD (padrão: hoje em America/Sao_Paulo)
 * @returns {number} quantidade de chaves removidas (período + slots)
 */
async function limparSuspensoesExpiradasNoFirestore(db, hoje = todayYmdSaoPaulo()) {
  const { FieldValue } = require("firebase-admin/firestore");
  const ref = db.collection("settings").doc("ubs");
  const snap = await ref.get();
  if (!snap.exists) return 0;

  const data = snap.data() || {};
  const { periodoSpecKeys, slotKeys } = coletarLimpezaSuspensoesExpiradas(
    data.atendimentoSuspensoPorSpec,
    data.atendimentoSuspensoSlots,
    hoje
  );
  if (!periodoSpecKeys.length && !slotKeys.length) return 0;

  const atendimentoSuspensoPorSpec = {};
  for (const sk of periodoSpecKeys) atendimentoSuspensoPorSpec[sk] = FieldValue.delete();
  const atendimentoSuspensoSlots = {};
  for (const k of slotKeys) atendimentoSuspensoSlots[k] = FieldValue.delete();

  await ref.set(
    {
      atualizadoEm: FieldValue.serverTimestamp(),
      atendimentoSuspensoPorSpec,
      atendimentoSuspensoSlots,
    },
    { merge: true }
  );
  return periodoSpecKeys.length + slotKeys.length;
}

module.exports = {
  todayYmdSaoPaulo,
  coletarLimpezaSuspensoesExpiradas,
  limparSuspensoesExpiradasNoFirestore,
};
