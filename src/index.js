// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Registra o Service Worker para notificações push e PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<React.StrictMode><App /></React.StrictMode>);
