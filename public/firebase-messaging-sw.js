// public/firebase-messaging-sw.js
// Service Worker para notificações push via Firebase Cloud Messaging
// Este arquivo DEVE ficar na pasta public/ (raiz do site)

importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// ⚠️  Use os mesmos valores do src/services/firebase.js
firebase.initializeApp({
  apiKey: "AIzaSyCQWcjqBbfJYGSRQirabrh6QJqU03yvZz8",
  authDomain: "ubs-appointments.firebaseapp.com",
  projectId: "ubs-appointments",
  storageBucket: "ubs-appointments.firebasestorage.app",
  messagingSenderId: "801438935493",
});

const messaging = firebase.messaging();

// Notificação recebida com o app em segundo plano ou fechado
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "UBS Agendamentos", {
    body:  body  || "Atualização nas vagas.",
    icon:  icon  || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data:  payload.data,
    vibrate: [200, 100, 200],
  });
});

// Ao clicar na notificação, abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow("/");
    })
  );
});
