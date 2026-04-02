// functions/index.js
// Cloud Function: notificações push quando vagas esgotam; expiração de documentos em `vagas`
// Deploy: firebase deploy --only functions

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { deleteExpiredVagasInFirestore } = require("./vagasRetention");

initializeApp();
const db = getFirestore();

exports.notificarVagasEsgotadas = onDocumentCreated(
  "notificacoesPendentes/{docId}",
  async (event) => {
    const data = event.data.data();
    if (!data || data.processado) return;

    // Marca como processado imediatamente para não reprocessar
    await event.data.ref.update({ processado: true });

    const { specNome } = data;

    // Busca todos os tokens dos agentes e diretores
    const snap = await db.collection("usuarios")
      .where("rule", "in", ["agente", "diretor"])
      .get();

    const tokens = [];
    snap.forEach((doc) => {
      const fcmTokens = doc.data().fcmTokens || [];
      tokens.push(...fcmTokens);
    });

    if (tokens.length === 0) return;

    // Envia em lotes de 500 (limite do FCM)
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      await getMessaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: "Vagas esgotadas",
          body:  `${specNome} — todas as vagas foram preenchidas.`,
        },
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "ubs_vagas" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });
    }
  }
);

/** Remove `vagas` 24h após o fim do dia local do atendimento (roda a cada 6h, TZ São Paulo). */
exports.expirarDocumentosVagas = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Sao_Paulo",
    memory: "256MiB",
  },
  async () => {
    const n = await deleteExpiredVagasInFirestore(db);
    if (n > 0) console.log(`expirarDocumentosVagas: removidos ${n} documento(s).`);
  }
);
