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
import { normalizeFeriadosList } from "./scheduleConfig";

const SETTINGS_ID = "ubs";
/** Sessão única de recepcionista: `settings/sessaoRecepcao` — só um `uid` ativo por vez. */
const SESSAO_RECEPCAO_ID = "sessaoRecepcao";

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

// ── CONFIGURAÇÃO GLOBAL (feriados, pontos facultativos, Fernando, PCCU) ─
export function listenSettings(callback) {
  return onSnapshot(doc(db, "settings", SETTINGS_ID), (snap) => {
    if (!snap.exists()) {
      callback({
        feriados: [],
        pontosFacultativos: [],
        pccuTotal: 15,
        dentQuartaVisitaDomiciliarDesde: "",
        recepcionistaAtivoWhatsapp: "",
        recepcionistaAtivoNome: "",
        ultimoRecepcionistaWhatsapp: "",
        ultimoRecepcionistaNome: "",
        atendimentoEncerradoPorSpecData: {},
      });
      return;
    }
    const d = snap.data();
    const encMap = d.atendimentoEncerradoPorSpecData;
    callback({
      feriados: normalizeFeriadosList(Array.isArray(d.feriados) ? d.feriados : []),
      pontosFacultativos: normalizeFeriadosList(
        Array.isArray(d.pontosFacultativos) ? d.pontosFacultativos : []
      ),
      pccuTotal: typeof d.pccuTotal === "number" ? d.pccuTotal : 15,
      dentQuartaVisitaDomiciliarDesde:
        typeof d.dentQuartaVisitaDomiciliarDesde === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.dentQuartaVisitaDomiciliarDesde.trim())
          ? d.dentQuartaVisitaDomiciliarDesde.trim()
          : "",
      recepcionistaAtivoWhatsapp:
        typeof d.recepcionistaAtivoWhatsapp === "string" ? d.recepcionistaAtivoWhatsapp : "",
      recepcionistaAtivoNome:
        typeof d.recepcionistaAtivoNome === "string" ? d.recepcionistaAtivoNome : "",
      ultimoRecepcionistaWhatsapp:
        typeof d.ultimoRecepcionistaWhatsapp === "string" ? d.ultimoRecepcionistaWhatsapp : "",
      ultimoRecepcionistaNome:
        typeof d.ultimoRecepcionistaNome === "string" ? d.ultimoRecepcionistaNome : "",
      atendimentoEncerradoPorSpecData:
        encMap && typeof encMap === "object" && !Array.isArray(encMap) ? { ...encMap } : {},
    });
  });
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

