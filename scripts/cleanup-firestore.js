/**
 * Limpeza segura do Firestore — remove apenas dados operacionais antigos/obsoletos.
 *
 * NÃO altera: usuarios, profissionais, settings (incl. feriados e sessão recepção).
 *
 * Remove (com --execute):
 *   - vagas: mesma regra do app — 24h após o fim do dia local da data de atendimento
 *     (independe de quantos dias à frente o slot foi reservado; ver functions/vagasRetention.js)
 *   - notificacoesPendentes: documentos já processados pela Cloud Function
 *
 * Opcional:
 *   --clear-lista-espera       apaga toda a coleção listaEspera
 *   --clear-vagas-all          apaga toda a coleção vagas (inclui vagas futuras)
 *   --clear-notificacoes-all   apaga toda a coleção notificacoesPendentes
 *   --reset-settings-operacionais
 *      limpa apenas campos operacionais em settings/ubs:
 *      recepcionistaAtivoWhatsapp, recepcionistaAtivoNome e atendimentoEncerradoPorSpecData
 *
 * Uso:
 *   node scripts/cleanup-firestore.js              # dry-run (só lista)
 *   node scripts/cleanup-firestore.js --execute  # aplica
 *
 * Credenciais: mesmo arquivo que scripts/seed.js (scripts/serviceAccountKey.json)
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  deleteExpiredVagasInFirestore,
  extractDateFromVagaDoc,
  vagaDocShouldBeDeleted,
} = require("../functions/vagasRetention");

const KNOWN_ROOT_COLLECTIONS = new Set([
  "usuarios",
  "profissionais",
  "settings",
  "vagas",
  "listaEspera",
  "notificacoesPendentes",
]);

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    execute: argv.includes("--execute"),
    clearListaEspera: argv.includes("--clear-lista-espera"),
    clearVagasAll: argv.includes("--clear-vagas-all"),
    clearNotificacoesAll: argv.includes("--clear-notificacoes-all"),
    resetSettingsOperacionais: argv.includes("--reset-settings-operacionais"),
  };
}

async function deleteInBatches(db, refs) {
  const chunkSize = 450;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + chunkSize)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

async function listCollectionRefs(db, col) {
  const snap = await db.collection(col).get();
  return snap.docs.map((d) => d.ref);
}

async function main() {
  const {
    execute,
    clearListaEspera,
    clearVagasAll,
    clearNotificacoesAll,
    resetSettingsOperacionais,
  } = parseArgs();

  let serviceAccount;
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch {
    console.error(
      "Coloque scripts/serviceAccountKey.json (Conta de serviço do Firebase), como no seed."
    );
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const collections = await db.listCollections();
  const names = collections.map((c) => c.id);
  const unknown = names.filter((n) => !KNOWN_ROOT_COLLECTIONS.has(n));
  if (unknown.length) {
    console.warn(
      "\n⚠ Coleções na raiz que este app não usa no código (revise no Console e apague manualmente se forem testes):\n",
      unknown.join(", ")
    );
  }

  // ── vagas ───────────────────────────────────────────────────────
  if (clearVagasAll) {
    const refs = await listCollectionRefs(db, "vagas");
    console.log(`\n[vagas] Total de documentos: ${refs.length}`);
    if (refs.length && !execute) {
      console.log("  (dry-run — use --execute para apagar todos)");
    } else if (refs.length && execute) {
      await deleteInBatches(db, refs);
      console.log("  ✅ Coleção vagas zerada.");
    }
  } else {
    const vagasSnap = await db.collection("vagas").get();
    const now = Date.now();
    let vagasEligible = 0;
    vagasSnap.forEach((doc) => {
      const iso = extractDateFromVagaDoc(doc.id, doc.data());
      if (iso && vagaDocShouldBeDeleted(iso, now)) vagasEligible += 1;
    });
    console.log(
      `\n[vagas] Documentos elegíveis à exclusão (24h após o dia do atendimento): ${vagasEligible}`
    );
    if (vagasEligible && !execute) {
      console.log("  (dry-run — use --execute para apagar)");
    } else if (vagasEligible && execute) {
      const removed = await deleteExpiredVagasInFirestore(db, now);
      console.log(`  ✅ Apagados: ${removed}.`);
    }
  }

  // ── notificações pendentes ──────────────────────────────────────
  if (clearNotificacoesAll) {
    const refs = await listCollectionRefs(db, "notificacoesPendentes");
    console.log(`\n[notificacoesPendentes] Total de documentos: ${refs.length}`);
    if (refs.length && !execute) {
      console.log("  (dry-run — use --execute para apagar todos)");
    } else if (refs.length && execute) {
      await deleteInBatches(db, refs);
      console.log("  ✅ Coleção notificacoesPendentes zerada.");
    }
  } else {
    const notSnap = await db.collection("notificacoesPendentes").get();
    const notToDelete = [];
    notSnap.forEach((doc) => {
      if (doc.data().processado === true) notToDelete.push(doc.ref);
    });
    console.log(
      `\n[notificacoesPendentes] Docs com processado=true: ${notToDelete.length}`
    );
    if (notToDelete.length && !execute) {
      console.log("  (dry-run — use --execute para apagar)");
    } else if (notToDelete.length && execute) {
      await deleteInBatches(db, notToDelete);
      console.log("  ✅ Apagados.");
    }
  }

  // ── lista de espera (opcional) ────────────────────────────────
  if (clearListaEspera) {
    const leSnap = await db.collection("listaEspera").get();
    const leRefs = leSnap.docs.map((d) => d.ref);
    console.log(`\n[listaEspera] Total de documentos: ${leRefs.length}`);
    if (!execute) {
      console.log("  (dry-run — use --execute para apagar todos)");
    } else if (leRefs.length) {
      await deleteInBatches(db, leRefs);
      console.log("  ✅ Lista de espera zerada.");
    }
  } else {
    console.log(
      "\n[listaEspera] Não alterado. Para apagar todos: --clear-lista-espera --execute"
    );
  }

  // ── settings operacionais (sem mexer em feriados/regras) ───────
  if (resetSettingsOperacionais) {
    console.log(
      "\n[settings/ubs] Campos operacionais alvo: recepcionistaAtivoWhatsapp, recepcionistaAtivoNome, atendimentoEncerradoPorSpecData"
    );
    if (!execute) {
      console.log("  (dry-run — use --execute para aplicar)");
    } else {
      await db.collection("settings").doc("ubs").set(
        {
          recepcionistaAtivoWhatsapp: "",
          recepcionistaAtivoNome: "",
          atendimentoEncerradoPorSpecData: {},
        },
        { merge: true }
      );
      console.log("  ✅ Campos operacionais resetados.");
    }
  } else {
    console.log(
      "\n[settings/ubs] Não alterado. Para resetar campos operacionais: --reset-settings-operacionais --execute"
    );
  }

  if (!execute) {
    console.log(
      "\n--- Modo simulação. Nada foi gravado. Rode com --execute para aplicar. ---\n"
    );
  } else {
    console.log("\n--- Limpeza concluída. ---\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
