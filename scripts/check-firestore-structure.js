const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

const REQUIRED_COLLECTIONS = [
  "usuarios",
  "profissionais",
  "settings",
  "vagas",
  "listaEspera",
  "notificacoesPendentes",
];

const REQUIRED_DOCS = [
  ["settings", "ubs"],
  ["settings", "sessaoRecepcao"],
];

async function main() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  const rootCols = await db.listCollections();
  const rootNames = rootCols.map((c) => c.id).sort();
  const missingCollections = REQUIRED_COLLECTIONS.filter((c) => !rootNames.includes(c));

  console.log("Colecoes encontradas na raiz:", rootNames.join(", ") || "(nenhuma)");
  console.log(
    "Colecoes obrigatorias faltando:",
    missingCollections.length ? missingCollections.join(", ") : "nenhuma"
  );

  for (const [collectionName, docId] of REQUIRED_DOCS) {
    const snap = await db.collection(collectionName).doc(docId).get();
    console.log(
      `Documento obrigatorio ${collectionName}/${docId}:`,
      snap.exists ? "OK" : "FALTANDO"
    );
  }

  for (const collectionName of REQUIRED_COLLECTIONS) {
    const sample = await db.collection(collectionName).limit(1).get();
    console.log(
      `Colecao ${collectionName} tem ao menos 1 documento:`,
      sample.empty ? "NAO" : "SIM"
    );
  }
}

main().catch((err) => {
  console.error("Falha na checagem do Firestore:", err.message || err);
  process.exit(1);
});
