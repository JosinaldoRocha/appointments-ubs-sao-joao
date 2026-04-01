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
} from "firebase/firestore";
import { db } from "./firebase";

const SETTINGS_ID = "ubs";

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
  await updateDoc(doc(db, "profissionais", id), data);
}

/** Cria documento em `profissionais` (nome, specKey, role, …). */
export async function createProfissional(data) {
  await addDoc(collection(db, "profissionais"), data);
}

export async function deleteProfissional(id) {
  await deleteDoc(doc(db, "profissionais", id));
}

// ── CONFIGURAÇÃO GLOBAL (feriados, Fernando, PCCU) ────────────────
export function listenSettings(callback) {
  return onSnapshot(doc(db, "settings", SETTINGS_ID), (snap) => {
    if (!snap.exists()) {
      callback({
        feriados: [],
        fernandoForaUnidade: false,
        pccuTotal: 15,
        recepcionistaAtivoWhatsapp: "",
        recepcionistaAtivoNome: "",
        atendimentoEncerradoPorSpecData: {},
      });
      return;
    }
    const d = snap.data();
    const encMap = d.atendimentoEncerradoPorSpecData;
    callback({
      feriados: Array.isArray(d.feriados) ? d.feriados : [],
      fernandoForaUnidade: Boolean(d.fernandoForaUnidade),
      pccuTotal: typeof d.pccuTotal === "number" ? d.pccuTotal : 15,
      recepcionistaAtivoWhatsapp:
        typeof d.recepcionistaAtivoWhatsapp === "string" ? d.recepcionistaAtivoWhatsapp : "",
      recepcionistaAtivoNome:
        typeof d.recepcionistaAtivoNome === "string" ? d.recepcionistaAtivoNome : "",
      atendimentoEncerradoPorSpecData:
        encMap && typeof encMap === "object" && !Array.isArray(encMap) ? { ...encMap } : {},
    });
  });
}

export async function updateSettings(partial) {
  await setDoc(
    doc(db, "settings", SETTINGS_ID),
    { ...partial, atualizadoEm: serverTimestamp() },
    { merge: true }
  );
}

/** Chave única para aviso “atendimento encerrado” no card (spec + data de atendimento). */
export function atendimentoEncerradoKey(specKey, atendimentoDate) {
  return `${specKey}_${atendimentoDate}`;
}

/**
 * Marca ou remove o aviso de atendimento encerrado.
 * Usa `deleteField` no mapa aninhado para a remoção ser aplicada no Firestore com merge.
 */
export async function setAtendimentoEncerradoFlag(specKey, atendimentoDate, encerrar) {
  const key = atendimentoEncerradoKey(specKey, atendimentoDate);
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
// ID do documento: "YYYY-MM-DD_specKey_sessIdx" (campo atendimentoDate)
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
  await setDoc(doc(db, "vagas", id), data, { merge: true });
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

