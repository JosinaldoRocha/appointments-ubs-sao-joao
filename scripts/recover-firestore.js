/**
 * Recupera estrutura mínima do Firestore para o app voltar a funcionar.
 *
 * Cria/atualiza:
 * - settings/ubs
 * - settings/sessaoRecepcao
 * - profissionais (por specKey, sem duplicar)
 *
 * Uso:
 *   node scripts/recover-firestore.js
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

const PROFESSIONALS_DEFAULT = {
  medico: { nome: "Dr. Clínico", role: "Clínico Geral" },
  dentFernando: { nome: "Dr. Fernando", role: "Odontologia" },
  dentPatrick: { nome: "Dr. Patrick", role: "Odontologia" },
  psicologa: { nome: "Dra. Kauane", role: "Psicologia" },
  fisio: { nome: "Dra. Aracele", role: "Fisioterapia" },
  enfermeira: { nome: "Enfermeira", role: "Enfermagem" },
  nutricionista: { nome: "Nutricionista", role: "Nutrição" },
};

const SETTINGS_DEFAULT = {
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

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

async function ensureSettings(db) {
  await db.collection("settings").doc("ubs").set(
    {
      ...SETTINGS_DEFAULT,
      atualizadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection("settings").doc("sessaoRecepcao").set(
    {
      uidAtivo: null,
      atualizadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureProfessionals(db) {
  for (const [specKey, profile] of Object.entries(PROFESSIONALS_DEFAULT)) {
    const snap = await db
      .collection("profissionais")
      .where("specKey", "==", specKey)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.set(
        {
          ...profile,
          specKey,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      continue;
    }

    await db.collection("profissionais").add({
      ...profile,
      specKey,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  }
}

async function main() {
  const db = initAdmin();

  await ensureSettings(db);
  await ensureProfessionals(db);

  console.log("✅ Estrutura mínima do Firestore recuperada.");
  console.log("Coleções atendidas: settings, profissionais.");
  console.log("Coleções operacionais (vagas/listaEspera/notificacoesPendentes) serão criadas automaticamente pelo uso.");
}

main().catch((err) => {
  console.error("❌ Falha ao recuperar Firestore:", err.message || err);
  process.exit(1);
});
