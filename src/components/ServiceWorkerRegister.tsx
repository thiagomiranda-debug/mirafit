"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Em desenvolvimento, desregistra o SW para evitar cache de assets do Turbopack
    if (process.env.NODE_ENV === "development") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((r) => r.unregister());
      });
      // Limpa todos os caches em dev
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      return;
    }

    // Em produção, registra normalmente e força atualização
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Verifica atualizações do SW a cada 30 minutos
        setInterval(() => reg.update(), 30 * 60 * 1000);
      })
      .catch((err) => console.warn("[SW] Registro falhou:", err));
  }, []);

  return null;
}
