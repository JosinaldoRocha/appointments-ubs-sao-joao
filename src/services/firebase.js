// src/services/firebase.js
// ─────────────────────────────────────────────────────────────────
//  SUBSTITUA os valores abaixo pelos do seu projeto Firebase
//  Console: https://console.firebase.google.com → Configurações do projeto
// ─────────────────────────────────────────────────────────────────
import { initializeApp, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCQWcjqBbfJYGSRQirabrh6QJqU03yvZz8",
  authDomain: "ubs-appointments.firebaseapp.com",
  projectId: "ubs-appointments",
  storageBucket: "ubs-appointments.firebasestorage.app",
  messagingSenderId: "801438935493",
 //TODO: Colocar a chave vapidKey
  vapidKey: "COLE_AQUI_vapidKey", // Configurações do Cloud Messaging → Chave VAPID
};

const app = initializeApp(firebaseConfig);

/** App secundária só para `createUserWithEmailAndPassword` — não altera a sessão do app principal (recepcionista). */
const SECONDARY_NAME = "criacaoUsuario";
const secondaryApp = (() => {
  try {
    return getApp(SECONDARY_NAME);
  } catch {
    return initializeApp(firebaseConfig, SECONDARY_NAME);
  }
})();

export { app };
/** Cache persistente (IndexedDB): menos leituras ao reabrir o app e entre abas. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const auth = getAuth(app);
export const storage = getStorage(app);
/** Auth isolada: use apenas para criar contas na Config.; depois `signOut(secondaryAuth)`. */
export const secondaryAuth = getAuth(secondaryApp);

// Messaging pode falhar (navegador, SW não registrado, etc.) — não quebra o app
let messaging = null;
try {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    messaging = getMessaging(app);
  }
} catch {
  // ignora — app funciona sem notificações push
}
export { messaging };

// Mantém sessão salva mesmo fechando o app
setPersistence(auth, browserLocalPersistence);

// Solicita permissão e retorna o token de notificação push do dispositivo
export async function requestNotificationToken() {
  try {
    if (!messaging || firebaseConfig.vapidKey === "COLE_AQUI_vapidKey") return null;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey,
    });
    return token;
  } catch {
    return null;
  }
}

// Callback para notificações recebidas com o app aberto
export function onForegroundMessage(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
