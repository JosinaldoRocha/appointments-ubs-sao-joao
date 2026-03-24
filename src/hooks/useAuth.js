// src/hooks/useAuth.js
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthChange } from "../services/auth";
import { getUser } from "../services/db";
import { requestNotificationToken, saveDeviceToken } from "../services/firebase";
import { saveDeviceToken as dbSaveToken } from "../services/db";

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
      setPerfil(dados);

      // Solicita permissão de notificação e salva token do dispositivo
      const token = await requestNotificationToken();
      if (token && dados) {
        await dbSaveToken(firebaseUser.uid, token);
      }
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, perfil, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
