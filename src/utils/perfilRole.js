// Normaliza o papel do usuário a partir do documento Firestore `usuarios/{uid}`.
// Campo canônico: `rule`. Aceita `role` só para documentos antigos.

export function rulePerfil(perfil) {
  if (!perfil) return null;
  const raw = perfil.rule != null ? perfil.rule : perfil.role;
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  if (t === "recepcionista") return "recepcao";
  if (t === "recepção" || t === "recepcao") return "recepcao";
  if (t === "direção" || t === "diretor") return "diretor";
  if (t === "agente") return "agente";
  return t;
}

export function isRecepcaoPerfil(perfil) {
  return rulePerfil(perfil) === "recepcao";
}

export function isDiretorPerfil(perfil) {
  return rulePerfil(perfil) === "diretor";
}
