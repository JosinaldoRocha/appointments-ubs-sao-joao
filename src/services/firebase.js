// src/services/firebase.js
// ─────────────────────────────────────────────────────────────────
//  SUBSTITUA os valores abaixo pelos do seu projeto Firebase
//  Console: https://console.firebase.google.com → Configurações do projeto
// ─────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
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

export const db = getFirestore(app);
export const auth = getAuth(app);

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
