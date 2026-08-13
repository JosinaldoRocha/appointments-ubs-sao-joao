// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import RecuperarSenha from "./pages/RecuperarSenha";
import Dashboard from "./pages/Dashboard";
import PainelVagas from "./pages/PainelVagas";

const APP_VERSION = process.env.REACT_APP_VERSION || "1.0.0";
const VERSION_LABEL = `v${APP_VERSION}`;

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <p style={{ color: "#64748B", fontSize: 14 }}>Carregando...</p>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <div style={styles.appWrap}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/recuperar-senha" element={<RecuperarSenha />} />
            <Route path="/painel-vagas" element={<PainelVagas />} />
            <Route path="/" element={<Guard><Dashboard /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <span style={styles.versionBadge} title="Versão do aplicativo">
          {VERSION_LABEL}
        </span>
      </div>
    </AuthProvider>
  );
}

const styles = {
  appWrap: { minHeight: "100vh" },
  versionBadge: {
    position: "fixed",
    right: 10,
    bottom: 10,
    zIndex: 9999,
    fontSize: 11,
    color: "#475569",
    background: "rgba(255,255,255,0.92)",
    border: "1px solid #CBD5E1",
    borderRadius: 999,
    padding: "4px 8px",
    pointerEvents: "none",
    userSelect: "none",
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
  },
};
