// src/hooks/useAuth.js
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthChange, logout } from "../services/auth";
import { getUser, claimRecepcaoSession, listenRecepcaoSession, updateSettings } from "../services/db";
import { requestNotificationToken, saveDeviceToken } from "../services/firebase";
import { saveDeviceToken as dbSaveToken } from "../services/db";
import { isRecepcaoPerfil } from "../utils/perfilRole";

/** Login mostra aviso se outro recepcionista assumiu a sessão. */
export const STORAGE_LOGOUT_SESSAO_RECEPCAO = "ubsLogoutSessaoRecepcao";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(undefined); // undefined = carregando
  const [perfil, setPerfil]   = useState(null);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setPerfil(null);
        return;
      }
      setUser(firebaseUser);
      const dados = await getUser(firebaseUser.uid);
      if (dados && isRecepcaoPerfil(dados)) {
        await claimRecepcaoSession(firebaseUser.uid);
        const digits = String(dados.telefoneWhatsapp || "").replace(/\D/g, "");
        if (digits.length >= 10) {
          const first = dados.nome?.trim().split(/\s+/)[0] || "Recepção";
          await updateSettings({
            ultimoRecepcionistaWhatsapp: digits,
            ultimoRecepcionistaNome: first,
            recepcionistaAtivoWhatsapp: digits,
            recepcionistaAtivoNome: first,
          }).catch(() => {});
        }
      }
      setPerfil(dados);

      // Solicita permissão de notificação e salva token do dispositivo
      const token = await requestNotificationToken();
      if (token && dados) {
        await dbSaveToken(firebaseUser.uid, token);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (user === undefined || user === null || !perfil || !isRecepcaoPerfil(perfil)) {
      return undefined;
    }
    const myUid = user.uid;
    const unsub = listenRecepcaoSession((sess) => {
      if (sess.uidAtivo != null && sess.uidAtivo !== myUid) {
        try {
          sessionStorage.setItem(STORAGE_LOGOUT_SESSAO_RECEPCAO, "1");
        } catch {
          /* ignore */
        }
        logout();
      }
    });
    return unsub;
  }, [user, perfil]);

  return (
    <AuthContext.Provider value={{ user, perfil, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
