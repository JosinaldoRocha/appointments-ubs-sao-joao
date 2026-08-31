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
  const [user, setUser]       = useState(undefined);   // undefined = auth carregando
  const [perfil, setPerfil]   = useState(undefined);   // undefined = perfil carregando

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setPerfil(null);
        return;
      }
      setUser(firebaseUser);

      let dados = null;
      try {
        dados = await getUser(firebaseUser.uid);
      } catch {
        dados = null;
      }
      // Publica o perfil ANTES de qualquer efeito colateral (claim de sessão, updateSettings,
      // token de notificação). Assim a UI já renderiza com o papel certo e não pisca a versão
      // de agente antes de virar recepcionista.
      setPerfil(dados);

      if (dados && isRecepcaoPerfil(dados)) {
        try {
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
        } catch {
          /* claim/settings falhou — não bloqueia o carregamento da tela */
        }
      }

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

  // Ainda carregando enquanto o auth não resolveu OU (logado, mas) o perfil não chegou.
  const loading = user === undefined || (user !== null && perfil === undefined);

  return (
    <AuthContext.Provider value={{ user, perfil, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
