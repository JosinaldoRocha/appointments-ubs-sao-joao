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

const profissionais = {
  medico:       { nome: "Dr. Clínico",   role: "Clínico Geral"  },
  dentFernando: { nome: "Dr. Fernando",  role: "Odontologia"    },
  dentPatrick:  { nome: "Dr. Patrick",   role: "Odontologia"    },
  psicologa:    { nome: "Dra. Kauane",   role: "Psicologia"     },
  fisio:        { nome: "Dra. Aracele",  role: "Fisioterapia"   },
  enfermeira:   { nome: "Enfermeira",    role: "Enfermagem"     },
};

async function seed() {
  const batch = db.batch();
  for (const [id, data] of Object.entries(profissionais)) {
    batch.set(db.collection("profissionais").doc(id), data);
  }
  await batch.commit();
  console.log("✅ Profissionais cadastrados no Firestore.");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
