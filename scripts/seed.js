// scripts/seed.js
// Popula o Firestore com os dados iniciais dos profissionais.
// Execute UMA VEZ após criar o projeto:
//   node scripts/seed.js

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore }        = require("firebase-admin/firestore");

// Coloque o caminho para o arquivo de credenciais baixado do Firebase Console
// Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Chaves iguais às de `scheduleConfig` (BASE_SCHEDULE / SPEC_META). */
const profissionais = {
  medico:         { nome: "Dr. Clínico",   role: "Médico(a)"                },
  dentFernando:   { nome: "Dr. Fernando",  role: "Cirurgião(ã)-Dentista"    },
  dentPatrick:    { nome: "Dr. Patrick",   role: "Cirurgião(ã)-Dentista"    },
  psicologa:      { nome: "Dra. Kauane",   role: "Psicólogo(a)"            },
  fisio:          { nome: "Dra. Aracele",  role: "Fisioterapeuta"          },
  enfermeira:     { nome: "Enfermeira",    role: "Enfermeiro(a)"           },
  nutricionista:  { nome: "Nutricionista", role: "Nutricionista"           },
};

async function seed() {
  const batch = db.batch();
  for (const [specKey, data] of Object.entries(profissionais)) {
    const ref = db.collection("profissionais").doc();
    batch.set(ref, { ...data, specKey });
  }
  await batch.commit();
  console.log("✅ Profissionais cadastrados no Firestore (IDs automáticos + campo specKey).");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
