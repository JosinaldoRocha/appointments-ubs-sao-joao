// src/services/db.js
// Todas as operações com o Firestore ficam aqui.
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeFeriadosList, reservaSolicitacaoAtiva } from "./scheduleConfig";

const SETTINGS_ID = "ubs";
/** Sessão única de recepcionista: `settings/sessaoRecepcao` — só um `uid` ativo por vez. */
const SESSAO_RECEPCAO_ID = "sessaoRecepcao";
const EMPTY_SETTINGS = {
  feriados: [],
  pontosFacultativos: [],
  pccuTotal: 15,
  dentQuartaVisitaDomiciliarDesde: "",
  recepcionistaAtivoWhatsapp: "",
  recepcionistaAtivoNome: "",
  ultimoRecepcionistaWhatsapp: "",
  ultimoRecepcionistaNome: "",
  atendimentoEncerradoPorSpecData: {},
};

function toMillisSafe(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const asNum = Number(value);
  return Number.isFinite(asNum) ? asNum : 0;
}

function normalizeSettingsData(raw = {}) {
  const d = raw || {};
  const encMap = d.atendimentoEncerradoPorSpecData;
  return {
    feriados: normalizeFeriadosList(Array.isArray(d.feriados) ? d.feriados : []),
    pontosFacultativos: normalizeFeriadosList(Array.isArray(d.pontosFacultativos) ? d.pontosFacultativos : []),
    pccuTotal: typeof d.pccuTotal === "number" ? d.pccuTotal : 15,
    dentQuartaVisitaDomiciliarDesde:
      typeof d.dentQuartaVisitaDomiciliarDesde === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.dentQuartaVisitaDomiciliarDesde.trim())
        ? d.dentQuartaVisitaDomiciliarDesde.trim()
        : "",
    recepcionistaAtivoWhatsapp:
      typeof d.recepcionistaAtivoWhatsapp === "string" ? d.recepcionistaAtivoWhatsapp : "",
    recepcionistaAtivoNome: typeof d.recepcionistaAtivoNome === "string" ? d.recepcionistaAtivoNome : "",
    ultimoRecepcionistaWhatsapp:
      typeof d.ultimoRecepcionistaWhatsapp === "string" ? d.ultimoRecepcionistaWhatsapp : "",
    ultimoRecepcionistaNome:
      typeof d.ultimoRecepcionistaNome === "string" ? d.ultimoRecepcionistaNome : "",
    atendimentoEncerradoPorSpecData:
      encMap && typeof encMap === "object" && !Array.isArray(encMap) ? { ...encMap } : {},
  };
}

// ── USUÁRIOS ────────────────────────────────────────────────────
export async function getUser(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Cria documento em `usuarios/{uid}` (perfil no Firestore). O login em si é criado no Authentication. */
export async function createUser(uid, data) {
  await setDoc(doc(db, "usuarios", uid), {
    ...data,
    criadoEm: serverTimestamp(),
  });
}

export async function updateUser(uid, data) {
  await updateDoc(doc(db, "usuarios", uid), data);
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, "usuarios", uid));
}

// Salva o token FCM do dispositivo para notificações push
export async function saveDeviceToken(uid, token) {
  await updateDoc(doc(db, "usuarios", uid), {
    fcmTokens: arrayUnion(token),
  });
}

export async function removeDeviceToken(uid, token) {
  await updateDoc(doc(db, "usuarios", uid), {
    fcmTokens: arrayRemove(token),
  });
}

// ── PROFISSIONAIS ───────────────────────────────────────────────
/** Cada doc: { nome, role, specKey? }. `specKey` amarra à grade (medico, dentFernando, …). */
export function listenProfissionais(callback) {
  return onSnapshot(collection(db, "profissionais"), (snap) => {
    const data = {};
    snap.docs.forEach((d) => (data[d.id] = { id: d.id, ...d.data() }));
    callback(data);
  });
}

export async function updateProfissional(id, data) {
  await updateDoc(doc(db, "profissionais", id), { ...data, atualizadoEm: serverTimestamp() });
}

/** Cria documento em `profissionais` (nome, specKey, role, …). */
export async function createProfissional(data) {
  await addDoc(collection(db, "profissionais"), {
    ...data,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}

export async function deleteProfissional(id) {
  await deleteDoc(doc(db, "profissionais", id));
}

// ── CONFIGURAÇÃO GLOBAL (feriados, pontos facultativos, Fernando, PCCU) ─
export function listenSettings(callback) {
  return onSnapshot(doc(db, "settings", SETTINGS_ID), (snap) => {
    if (!snap.exists()) {
      callback({ ...EMPTY_SETTINGS });
      return;
    }
    callback(normalizeSettingsData(snap.data()));
  });
}

export async function getSettingsSnapshot() {
  const snap = await getDoc(doc(db, "settings", SETTINGS_ID));
  if (!snap.exists()) return { ...EMPTY_SETTINGS, _syncUpdatedAt: 0 };
  const data = snap.data();
  return {
    ...normalizeSettingsData(data),
    _syncUpdatedAt: toMillisSafe(data.atualizadoEm),
  };
}

/**
 * WhatsApp para pedidos de agendamento: recepcionista com sessão ativa no app;
 * se ninguém estiver com sessão ativa, usa o último recepcionista que fez login (cadastro em Usuários).
 */
export function digitosWhatsappRecepcaoParaSolicitacao(settings) {
  if (!settings) return "";
  const ativo = String(settings.recepcionistaAtivoWhatsapp || "").replace(/\D/g, "");
  if (ativo.length >= 10) return ativo;
  const ultimo = String(settings.ultimoRecepcionistaWhatsapp || "").replace(/\D/g, "");
  if (ultimo.length >= 10) return ultimo;
  return "";
}

export async function updateSettings(partial) {
  await setDoc(
    doc(db, "settings", SETTINGS_ID),
    { ...partial, atualizadoEm: serverTimestamp() },
    { merge: true }
  );
}

// ── SESSÃO ÚNICA RECEPCIONISTA ───────────────────────────────────
export async function claimRecepcaoSession(uid) {
  await setDoc(
    doc(db, "settings", SESSAO_RECEPCAO_ID),
    { uidAtivo: uid, atualizadoEm: serverTimestamp() },
    { merge: true }
  );
}

/** Libera a sessão só se ainda for este usuário (evita apagar a sessão de outro após troca forçada). Retorna true se a sessão foi liberada. */
export async function releaseRecepcaoSession(uid) {
  const ref = doc(db, "settings", SESSAO_RECEPCAO_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const ativo = snap.data().uidAtivo;
  if (ativo === uid) {
    await setDoc(ref, { uidAtivo: null, atualizadoEm: serverTimestamp() }, { merge: true });
    return true;
  }
  return false;
}

export function listenRecepcaoSession(callback) {
  return onSnapshot(doc(db, "settings", SESSAO_RECEPCAO_ID), (snap) => {
    if (!snap.exists()) {
      callback({ uidAtivo: null });
      return;
    }
    const d = snap.data();
    const uidAtivo = d.uidAtivo != null ? String(d.uidAtivo) : null;
    callback({ uidAtivo });
  });
}

/**
 * Chave para aviso “atendimento encerrado” (spec + data).
 * Com `turno` `"manha"` ou `"tarde"`: profissional com atendimento nos dois turnos no mesmo dia.
 */
export function atendimentoEncerradoKey(specKey, atendimentoDate, turno) {
  const base = `${specKey}_${atendimentoDate}`;
  if (turno === "manha" || turno === "tarde") return `${base}_${turno}`;
  return base;
}

/**
 * Marca ou remove o aviso de atendimento encerrado.
 * `turno`: opcional; `"manha"` | `"tarde"` quando o card tem os dois turnos.
 * Usa `deleteField` no mapa aninhado para a remoção ser aplicada no Firestore com merge.
 */
export async function setAtendimentoEncerradoFlag(specKey, atendimentoDate, encerrar, turno) {
  const key = atendimentoEncerradoKey(specKey, atendimentoDate, turno);
  await setDoc(
    doc(db, "settings", SETTINGS_ID),
    {
      atualizadoEm: serverTimestamp(),
      atendimentoEncerradoPorSpecData: encerrar
        ? { [key]: true }
        : { [key]: deleteField() },
    },
    { merge: true }
  );
}

// ── VAGAS ────────────────────────────────────────────────────────
// ID do documento: "YYYY-MM-DD_specKey_sessIdx" (campo atendimentoDate).
// Retenção no Firestore: documentos são removidos 24h após o fim do dia local da data de atendimento
// (Cloud Function `expirarDocumentosVagas` — ver functions/vagasRetention.js).
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function listenVagasByAtendimentoDates(datesArray, callback) {
  const unique = [...new Set(datesArray)].filter(Boolean);
  if (unique.length === 0) {
    callback({});
    return () => {};
  }
  const chunks = chunkArray(unique, 10);
  const partials = chunks.map(() => ({}));
  const mergeAndEmit = () => {
    const data = {};
    partials.forEach((p) => {
      Object.assign(data, p);
    });
    callback(data);
  };
  const unsubs = chunks.map((chunkDates, idx) => {
    const q = query(
      collection(db, "vagas"),
      where("atendimentoDate", "in", chunkDates)
    );
    return onSnapshot(q, (snap) => {
      const next = {};
      snap.docs.forEach((d) => {
        next[d.id] = { id: d.id, ...d.data() };
      });
      partials[idx] = next;
      mergeAndEmit();
    });
  });
  return () => unsubs.forEach((u) => u());
}

export async function getVagasByAtendimentoDates(datesArray) {
  const unique = [...new Set(datesArray)].filter(Boolean);
  if (unique.length === 0) return { data: {}, maxUpdatedAt: 0 };
  const chunks = chunkArray(unique, 10);
  const allData = {};
  let maxUpdatedAt = 0;
  for (const chunkDates of chunks) {
    const q = query(collection(db, "vagas"), where("atendimentoDate", "in", chunkDates));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      allData[d.id] = { id: d.id, ...data };
      maxUpdatedAt = Math.max(maxUpdatedAt, toMillisSafe(data.atualizadoEm));
    });
  }
  return { data: allData, maxUpdatedAt };
}

export function listenVagasChangesByAtendimentoDatesSince(datesArray, sinceMs, callback, onError) {
  const unique = [...new Set(datesArray)].filter(Boolean);
  if (unique.length === 0) return () => {};
  const sinceTs = Timestamp.fromMillis(Math.max(0, Number(sinceMs) || 0));
  const chunks = chunkArray(unique, 10);
  const unsubs = chunks.map((chunkDates) => {
    const q = query(
      collection(db, "vagas"),
      where("atendimentoDate", "in", chunkDates),
      where("atualizadoEm", ">", sinceTs)
    );
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) return;
        const data = {};
        let maxUpdatedAt = Math.max(0, Number(sinceMs) || 0);
        snap.docs.forEach((d) => {
          const payload = d.data();
          data[d.id] = { id: d.id, ...payload };
          maxUpdatedAt = Math.max(maxUpdatedAt, toMillisSafe(payload.atualizadoEm));
        });
        callback({ data, maxUpdatedAt });
      },
      (err) => onError?.(err)
    );
  });
  return () => unsubs.forEach((u) => u());
}

/** @deprecated prefer listenVagasByAtendimentoDates com atendimentoDate */
export function listenVagas(dateStr, callback) {
  const q = query(collection(db, "vagas"), where("data", "==", dateStr));
  return onSnapshot(q, (snap) => {
    const data = {};
    snap.docs.forEach((d) => (data[d.id] = { id: d.id, ...d.data() }));
    callback(data);
  });
}

export async function setVaga(id, data) {
  await setDoc(doc(db, "vagas", id), { ...data, atualizadoEm: serverTimestamp() }, { merge: true });
}

/**
 * Última vaga (livre === 1): grava reserva no Firestore para todos verem.
 * @returns {{ aplicouReserva: boolean }}
 */
export async function tryReservaSolicitacaoAgente(id, meta, { nome, uid }) {
  const { atendimentoDate, specKey, sessIdx, dayKey, total } = meta;
  if (!total || total <= 0) return { aplicouReserva: false };
  const nomeTrim = String(nome || "").trim().slice(0, 120) || "Usuário";

  return runTransaction(db, async (transaction) => {
    const ref = doc(db, "vagas", id);
    const snap = await transaction.get(ref);
    const v = snap.exists() ? snap.data() : {};
    const used = Number(v.used) || 0;
    const reserved = Number(v.reserved) || 0;
    const livre = total - used - reserved;

    if (livre !== 1) {
      return { aplicouReserva: false };
    }

    const rs = v.reservaSolicitacao;
    const ativa = rs && reservaSolicitacaoAtiva(v);
    if (ativa && rs.uid && rs.uid !== uid) {
      const err = new Error("RESERVADA_OUTRO");
      err.code = "RESERVADA_OUTRO";
      err.outroNome = rs.nome || "outro profissional";
      throw err;
    }

    transaction.set(
      ref,
      {
        atendimentoDate,
        specKey,
        sessIdx,
        dayKey,
        total,
        used,
        reserved,
        reservaSolicitacao: {
          uid,
          nome: nomeTrim,
          criadoEm: serverTimestamp(),
        },
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );
    return { aplicouReserva: true };
  });
}

export async function liberarReservaSolicitacaoAgente(id, uid) {
  if (!id || !uid) return;
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "vagas", id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const rs = snap.data().reservaSolicitacao;
    if (!rs || rs.uid !== uid) return;
    transaction.set(
      ref,
      {
        reservaSolicitacao: deleteField(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Confirma envio da solicitação: incrementa `used` e remove `reservaSolicitacao` se for o titular.
 */
export async function confirmarSolicitacaoOcupaVaga(id, meta, uid) {
  const { atendimentoDate, specKey, sessIdx, dayKey, total } = meta;
  return runTransaction(db, async (transaction) => {
    const ref = doc(db, "vagas", id);
    const snap = await transaction.get(ref);
    const v = snap.exists() ? snap.data() : {};
    let used = Number(v.used) || 0;
    let reserved = Number(v.reserved) || 0;
    const livre = total - used - reserved;
    const rs = v.reservaSolicitacao;
    const ativa = rs && reservaSolicitacaoAtiva(v);

    if (ativa && rs.uid !== uid) {
      const err = new Error("RESERVADA_OUTRO");
      err.code = "RESERVADA_OUTRO";
      err.outroNome = rs.nome || "outro profissional";
      throw err;
    }
    if (ativa && rs.uid === uid) {
      used += 1;
    } else {
      if (livre <= 0) {
        const err = new Error("Esta vaga não está mais disponível.");
        err.code = "VAGA_INDISPONIVEL";
        throw err;
      }
      used += 1;
    }

    while (used + reserved > total) {
      if (reserved > 0) reserved -= 1;
      else used -= 1;
    }

    transaction.set(
      ref,
      {
        atendimentoDate,
        specKey,
        sessIdx,
        dayKey,
        total,
        used,
        reserved,
        reservaSolicitacao: deleteField(),
        atualizadoEm: serverTimestamp(),
      },
      { merge: true }
    );
    const esgotou = used + reserved >= total;
    return { used, reserved, total, esgotou };
  });
}

export async function getProfissionaisSnapshot() {
  const snap = await getDocs(collection(db, "profissionais"));
  const data = {};
  let maxUpdatedAt = 0;
  snap.docs.forEach((d) => {
    const payload = d.data();
    data[d.id] = { id: d.id, ...payload };
    maxUpdatedAt = Math.max(maxUpdatedAt, toMillisSafe(payload.atualizadoEm));
  });
  return { data, maxUpdatedAt };
}

export function listenProfissionaisChangesSince(sinceMs, callback, onError) {
  const sinceTs = Timestamp.fromMillis(Math.max(0, Number(sinceMs) || 0));
  const q = query(collection(db, "profissionais"), where("atualizadoEm", ">", sinceTs));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) return;
      const data = {};
      let maxUpdatedAt = Math.max(0, Number(sinceMs) || 0);
      snap.docs.forEach((d) => {
        const payload = d.data();
        data[d.id] = { id: d.id, ...payload };
        maxUpdatedAt = Math.max(maxUpdatedAt, toMillisSafe(payload.atualizadoEm));
      });
      callback({ data, maxUpdatedAt });
    },
    (err) => onError?.(err)
  );
}

export function listenSettingsChangesSince(sinceMs, callback, onError) {
  const since = Math.max(0, Number(sinceMs) || 0);
  return onSnapshot(
    doc(db, "settings", SETTINGS_ID),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const updatedAt = toMillisSafe(d.atualizadoEm);
      if (updatedAt <= since) return;
      callback({
        data: normalizeSettingsData(d),
        maxUpdatedAt: updatedAt,
      });
    },
    (err) => onError?.(err)
  );
}

export async function getVaga(id) {
  const snap = await getDoc(doc(db, "vagas", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── LISTA DE ESPERA ──────────────────────────────────────────────
export function listenListaEspera(callback) {
  const q = query(
    collection(db, "listaEspera"),
    orderBy("criadoEm", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function adicionarEspera(data) {
  return addDoc(collection(db, "listaEspera"), {
    ...data,
    criadoEm: serverTimestamp(),
  });
}

export async function removerEspera(id) {
  await deleteDoc(doc(db, "listaEspera", id));
}

// ── NOTIFICAÇÕES (disparo via Cloud Function) ────────────────────
export async function registrarNotificacaoVagasEsgotadas(specKey, specNome) {
  await addDoc(collection(db, "notificacoesPendentes"), {
    tipo: "vagas_esgotadas",
    specKey,
    specNome,
    criadoEm: serverTimestamp(),
    processado: false,
  });
}

