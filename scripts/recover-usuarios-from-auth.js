/**
 * Reconstrói documentos `usuarios/{uid}` no Firestore a partir do Firebase Authentication.
 *
 * Padrão:
 * - dry-run (não grava)
 * - cria apenas documentos ausentes
 * - perfil inicial: "agente"
 *
 * Uso:
 *   node scripts/recover-usuarios-from-auth.js
 *   node scripts/recover-usuarios-from-auth.js --execute
 *   node scripts/recover-usuarios-from-auth.js --execute --default-rule recepcao
 *   node scripts/recover-usuarios-from-auth.js --execute --overwrite
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");
const VALID_RULES = new Set(["agente", "recepcao", "diretor"]);

function parseArgs() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const overwrite = argv.includes("--overwrite");
  const ruleIdx = argv.indexOf("--default-rule");
  const defaultRule = ruleIdx >= 0 && argv[ruleIdx + 1] ? String(argv[ruleIdx + 1]).trim().toLowerCase() : "agente";
  if (!VALID_RULES.has(defaultRule)) {
    throw new Error(`--default-rule inválido: "${defaultRule}". Use: agente | recepcao | diretor`);
  }
  return { execute, overwrite, defaultRule };
}

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function inferCpfFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "";
  const digits = sanitizeDigits(localPart);
  return digits.length === 11 ? digits : "";
}

function inferNome(authUser) {
  const dn = String(authUser.displayName || "").trim();
  if (dn) return dn.slice(0, 120);
  const email = String(authUser.email || "").trim();
  if (!email) return "Usuário";
  const local = email.split("@")[0] || "";
  const normalized = local.replace(/[._-]+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : "Usuário";
}

async function listAllAuthUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  const { execute, overwrite, defaultRule } = parseArgs();
  const { auth, db } = initAdmin();

  const authUsers = await listAllAuthUsers(auth);
  if (authUsers.length === 0) {
    console.log("Nenhum usuário encontrado no Authentication.");
    return;
  }

  let missingDocs = 0;
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  const errors = [];

  for (const user of authUsers) {
    const uid = user.uid;
    const ref = db.collection("usuarios").doc(uid);
    const snap = await ref.get();

    const email = String(user.email || "").trim().toLowerCase();
    const cpf = inferCpfFromEmail(email);
    const nome = inferNome(user);

    if (!snap.exists) {
      missingDocs += 1;
      toCreate += 1;
      if (execute) {
        try {
          await ref.set({
            nome,
            cpf,
            email,
            rule: defaultRule,
            criadoEm: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp(),
          });
        } catch (err) {
          errors.push({ uid, error: err.message || String(err) });
        }
      }
      continue;
    }

    if (!overwrite) {
      unchanged += 1;
      continue;
    }

    const existing = snap.data() || {};
    const patch = { atualizadoEm: FieldValue.serverTimestamp() };
    let changed = false;

    if (!existing.nome && nome) {
      patch.nome = nome;
      changed = true;
    }
    if (!existing.email && email) {
      patch.email = email;
      changed = true;
    }
    if (!existing.cpf && cpf) {
      patch.cpf = cpf;
      changed = true;
    }
    if (!existing.rule && !existing.role) {
      patch.rule = defaultRule;
      changed = true;
    }

    if (!changed) {
      unchanged += 1;
      continue;
    }

    toUpdate += 1;
    if (execute) {
      try {
        await ref.set(patch, { merge: true });
      } catch (err) {
        errors.push({ uid, error: err.message || String(err) });
      }
    }
  }

  console.log(`Usuários no Authentication: ${authUsers.length}`);
  console.log(`Docs ausentes em usuarios: ${missingDocs}`);
  console.log(`A criar: ${toCreate}`);
  console.log(`A complementar (--overwrite): ${toUpdate}`);
  console.log(`Sem alteração: ${unchanged}`);

  if (errors.length > 0) {
    console.log(`Falhas: ${errors.length}`);
    errors.slice(0, 20).forEach((e) => {
      console.log(` - ${e.uid}: ${e.error}`);
    });
  }

  if (!execute) {
    console.log("\nModo simulação (dry-run). Nada foi gravado.");
    console.log("Rode com --execute para aplicar.");
  } else {
    console.log("\n✅ Reconstrução de usuarios finalizada.");
  }
}

main().catch((err) => {
  console.error("❌ Erro ao reconstruir usuarios:", err.message || err);
  process.exit(1);
});
