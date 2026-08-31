import { useMemo, useState, useEffect } from "react";
import {
  SPEC_META,
  DAY_LABEL,
  DEFAULT_PROF_NAMES,
  toDateStr,
  specTemSessaoNoTurno,
  suspensaoRegistroNaoExpirado,
  specSuspensaoAfetaAgenda,
  parseAtendimentoSuspensoSlotKey,
  suspensaoPontualSlotVisivelParaAgente,
  normalizeFeriadosList,
  shouldShowAvisoVisitaDomiciliarAmanha,
  avisoSemAtendimentoUbAmanha,
  addDaysLocal,
  varianteVisitaDomiciliarNoCard,
  estaDentroAlgumaJanelaSolicitacaoAgendamento,
  MSG_FORA_EXPEDIENTE_UBS,
  agenteOcultarCardPorEncerrado,
  specKeyEstaDesativado,
  ORDEM_DIA_SEMANA_GRADE,
  diasAtendimentoDefaultParaSpec,
  turnosDefaultParaSpecNoDia,
  normalizeAtendimentoDiasTurnosParaSpec,
} from "../services/scheduleConfig";

function dataHojeIso() {
  return toDateStr(new Date());
}

function dataSuspensaoPosteriorAHoje(isoStr, hojeStr) {
  return typeof isoStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoStr.trim()) && isoStr.trim() > hojeStr;
}

function proximaAberturaAgendamento(agora, feriadosLista) {
  const holidaySet = new Set(normalizeFeriadosList(feriadosLista));
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const hojeStr = toDateStr(agora);
  const dow = agora.getDay();
  const ehDiaUtilHoje = dow >= 1 && dow <= 5 && !holidaySet.has(hojeStr);

  if (ehDiaUtilHoje && totalMin < 7 * 60) {
    return "Hoje · a partir das 7h";
  }

  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const cursor = new Date(base);
  cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    const d = cursor.getDay();
    const s = toDateStr(cursor);
    if (d >= 1 && d <= 5 && !holidaySet.has(s)) {
      const diffDias = Math.round((cursor - base) / 86400000);
      if (diffDias === 1) {
        return "Amanhã · a partir das 13h30";
      }
      const dataPorExtenso = cursor.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const dataCap = dataPorExtenso.charAt(0).toUpperCase() + dataPorExtenso.slice(1);
      return `${dataCap} · a partir das 13h30`;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

function formatDataLonga(isoDateStr) {
  return new Date(`${isoDateStr}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function nomeProfissional(specKey, profissionaisMap) {
  const p = Object.values(profissionaisMap || {}).find((x) => x.specKey === specKey || x.id === specKey);
  const n = typeof p?.nome === "string" ? p.nome.trim() : "";
  if (n) return n;
  return DEFAULT_PROF_NAMES[specKey] || specKey;
}

function profissionalDocPorSpecKey(profissionaisMap, specKey) {
  return (
    Object.values(profissionaisMap || {}).find((p) => p.specKey === specKey || p.id === specKey) || null
  );
}

function labelEscopoSuspensaoPontual(escopo) {
  if (escopo === "dia") return "Dia inteiro";
  if (escopo === "manha") return "Manhã";
  if (escopo === "tarde") return "Tarde";
  return escopo;
}

function listaAvisosManuais(avisosManuais, hojeStr) {
  const m = avisosManuais && typeof avisosManuais === "object" ? avisosManuais : {};
  const out = [];
  for (const [id, v] of Object.entries(m)) {
    if (!v || typeof v !== "object") continue;
    const texto = typeof v.texto === "string" ? v.texto.trim() : "";
    if (!texto) continue;
    const ate = typeof v.ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.ate.trim()) ? v.ate.trim() : "";
    if (ate && ate < hojeStr) continue;
    const tone = v.tone === "warn" || v.tone === "danger" || v.tone === "info" ? v.tone : "info";
    const titulo = typeof v.titulo === "string" ? v.titulo.trim() : "";
    const criadoEm = typeof v.criadoEm === "number" && Number.isFinite(v.criadoEm) ? v.criadoEm : 0;
    out.push({ id, texto, tone, titulo, ate, criadoEm });
  }
  out.sort((a, b) => b.criadoEm - a.criadoEm || a.id.localeCompare(b.id));
  return out;
}

function hasAnyVacancy(specs) {
  return specs.some((spec) =>
    spec.sessions.some((s) => {
      if (s.waitlistEnabled) return true;
      const tot = s.total ?? 0;
      if (tot <= 0) return false;
      return (s.used ?? 0) + (s.reserved ?? 0) < tot;
    })
  );
}

function listaAvisosEncerrado(specs, atendimentoEncerradoMap) {
  const map = atendimentoEncerradoMap || {};
  const out = [];
  for (const spec of specs) {
    const d = spec.atendimentoDate;
    if (typeof d !== "string" || !d) continue;
    const base = `${spec.key}_${d}`;
    const hasM = specTemSessaoNoTurno(spec, "manha");
    const hasT = specTemSessaoNoTurno(spec, "tarde");
    if (map[base]) {
      out.push({ spec, turno: null });
      continue;
    }
    if (hasM && hasT) {
      if (map[`${base}_manha`]) out.push({ spec, turno: "manha" });
      if (map[`${base}_tarde`]) out.push({ spec, turno: "tarde" });
    } else if (hasM && map[`${base}_manha`]) out.push({ spec, turno: "manha" });
    else if (hasT && map[`${base}_tarde`]) out.push({ spec, turno: "tarde" });
  }
  return out;
}

const TONE = {
  danger: {
    bg: "linear-gradient(160deg, #FEF2F2 0%, #FFF1F2 100%)",
    border: "#FECACA",
    accent: "#EF4444",
    text: "#7F1D1D",
  },
  warn: {
    bg: "linear-gradient(160deg, #FFFBEB 0%, #FEF3C7 100%)",
    border: "#FCD34D",
    accent: "#F59E0B",
    text: "#78350F",
  },
  info: {
    bg: "linear-gradient(160deg, #EEF2FF 0%, #E0E7FF 100%)",
    border: "#A5B4FC",
    accent: "#6366F1",
    text: "#1E1B4B",
  },
  calendario: {
    bg: "linear-gradient(160deg, #F5F3FF 0%, #EDE9FE 100%)",
    border: "#C4B5FD",
    accent: "#7C3AED",
    text: "#2E1065",
  },
  muted: {
    bg: "#F8FAFC",
    border: "#CBD5E1",
    accent: "#64748B",
    text: "#1E293B",
  },
  neutral: {
    bg: "#fff",
    border: "#E2E8F0",
    accent: "#334155",
    text: "#334155",
  },
};

function NoticeCard({ tone, badge, title, subject, role, details = [], note, children }) {
  const colors = TONE[tone] || TONE.neutral;
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.accent}`,
        background: colors.bg,
        padding: "12px 14px 14px",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
      }}
      role="status"
    >
      <span
        style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          padding: "3px 9px",
          borderRadius: 6,
          background: colors.accent,
          color: "#fff",
          marginBottom: 8,
        }}
      >
        {badge}
      </span>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: colors.text }}>
        {title}
      </p>
      {subject && (
        <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.4, color: colors.text }}>
          <strong>{subject}</strong>
          {role ? <span style={{ fontWeight: 400, opacity: 0.7 }}> · {role}</span> : null}
        </p>
      )}
      {details.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {details.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.4, color: colors.text }}>
              <span style={{ fontWeight: 700, opacity: 0.55, minWidth: 64, flexShrink: 0 }}>{d.label}</span>
              <span style={{ fontWeight: 500 }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
      {note && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: colors.text, opacity: 0.65, lineHeight: 1.5 }}>
          {note}
        </p>
      )}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function Section({ title, hint, children, empty }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.sectionTitle}>{title}</h2>
        {hint ? <p style={S.sectionHint}>{hint}</p> : null}
      </div>
      {empty ? <p style={S.sectionEmpty}>{empty}</p> : children}
    </section>
  );
}

export function computeAvisosPreview({
  hojeStr,
  isRecepcao,
  incluirAvisosOperacionais,
  specs = [],
  profissionaisMap = {},
  profNames = {},
  feriados = [],
  pontosFacultativos = [],
  dentQuartaVisitaDomiciliarDesde = "",
  atendimentoEncerradoMap = {},
  atendimentoSuspensoPorSpec = {},
  atendimentoSuspensoSlots = {},
  atendimentoDiasAtivosPorSpec = {},
  specKeysDesativados = [],
  avisosManuais = {},
}) {
  const hoje = hojeStr || toDateStr(new Date());
  const items = [];

  // Avisos livres publicados pela recepção
  for (const a of listaAvisosManuais(avisosManuais, hoje)) {
    items.push({
      badge: "Aviso",
      tone: a.tone,
      title: a.titulo || "Aviso da recepção",
      preview: a.texto.length > 140 ? `${a.texto.slice(0, 137)}…` : a.texto,
    });
  }

  // Suspensões por período
  const susp = atendimentoSuspensoPorSpec || {};
  const periodEntries = Object.entries(susp)
    .filter(
      ([specKey, v]) =>
        !specKeyEstaDesativado(specKey, specKeysDesativados) &&
        v &&
        typeof v.desde === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.desde.trim()) &&
        suspensaoRegistroNaoExpirado(v, hoje) &&
        (isRecepcao || specSuspensaoAfetaAgenda(specKey, susp, hoje, atendimentoDiasAtivosPorSpec || {}))
    )
    .sort((a, b) => a[1].desde.localeCompare(b[1].desde));
  for (const [specKey, entry] of periodEntries) {
    const nome = nomeProfissional(specKey, profissionaisMap);
    const desde = entry.desde.trim();
    const exibirDesde = dataSuspensaoPosteriorAHoje(desde, hoje);
    items.push({
      badge: "Suspenso",
      tone: "danger",
      title: "Atendimento suspenso",
      preview: exibirDesde
        ? `${nome} · A partir de ${formatDataLonga(desde)}`
        : `${nome} · Suspensão em vigor`,
    });
  }

  // Suspensões pontuais
  const slots = atendimentoSuspensoSlots || {};
  const diasCfg = atendimentoDiasAtivosPorSpec || {};
  const pontuais = [];
  for (const key of Object.keys(slots)) {
    const p = parseAtendimentoSuspensoSlotKey(key);
    if (!p) continue;
    if (specKeyEstaDesativado(p.specKey, specKeysDesativados)) continue;
    if (!isRecepcao && !suspensaoPontualSlotVisivelParaAgente(p.specKey, p.data, hoje, diasCfg)) continue;
    if (isRecepcao && p.data < hoje) continue;
    pontuais.push(p);
  }
  pontuais.sort((a, b) => a.data.localeCompare(b.data));
  for (const p of pontuais) {
    const nome = nomeProfissional(p.specKey, profissionaisMap);
    const exibirData = dataSuspensaoPosteriorAHoje(p.data, hoje);
    const turnoLabel = p.escopo === "dia" ? "dia inteiro" : p.escopo === "manha" ? "manhã" : "tarde";
    items.push({
      badge: "Suspensão pontual",
      tone: "danger",
      title: "Atendimento suspenso",
      preview: `${nome} · ${exibirData ? formatDataLonga(p.data) : "Hoje"} · ${turnoLabel}`,
    });
  }

  // Feriado / ponto facultativo amanhã (operacional)
  if (incluirAvisosOperacionais) {
    const r = avisoSemAtendimentoUbAmanha(hoje, feriados, pontosFacultativos);
    if (r) {
      const amanhaIso = addDaysLocal(hoje, 1);
      const motivo =
        r.eFeriado && r.ePontoFacultativo
          ? "Feriado e ponto facultativo"
          : r.eFeriado
          ? "Feriado"
          : "Ponto facultativo";
      items.push({
        badge: "Amanhã",
        tone: "warn",
        title: "Sem atendimento",
        preview: `${formatDataLonga(amanhaIso)} · ${motivo}`,
      });
    }
    if (
      dentQuartaVisitaDomiciliarDesde &&
      shouldShowAvisoVisitaDomiciliarAmanha(hoje, dentQuartaVisitaDomiciliarDesde)
    ) {
      const nomeDent = profNames.dentFernando || DEFAULT_PROF_NAMES.dentFernando;
      const amanhaIso = addDaysLocal(hoje, 1);
      items.push({
        badge: "Amanhã",
        tone: "info",
        title: "Sem atendimento na UBS",
        preview: `${nomeDent} · ${formatDataLonga(amanhaIso)} · Manhã`,
      });
    }
  }

  // Encerrados
  const encerrados = listaAvisosEncerrado(specs, atendimentoEncerradoMap);
  for (const { spec, turno } of encerrados) {
    const nome = nomeProfissional(spec.key, profissionaisMap);
    const hasM = specTemSessaoNoTurno(spec, "manha");
    const hasT = specTemSessaoNoTurno(spec, "tarde");
    let turnoLabel;
    if (turno === "manha") turnoLabel = "Manhã";
    else if (turno === "tarde") turnoLabel = "Tarde";
    else if (hasM && hasT) turnoLabel = "Manhã e tarde";
    else if (hasM) turnoLabel = "Manhã";
    else if (hasT) turnoLabel = "Tarde";
    else turnoLabel = null;
    items.push({
      badge: "Encerrado",
      tone: "muted",
      title: "Atendimento encerrado",
      preview: turnoLabel ? `${nome} · ${turnoLabel}` : nome,
    });
  }

  // Calendário futuro
  const ferList = normalizeFeriadosList(feriados).filter((d) => d >= hoje);
  const pfList = normalizeFeriadosList(pontosFacultativos).filter((d) => d >= hoje);
  const calRows = [];
  for (const iso of ferList) calRows.push({ iso, tipo: "feriado" });
  for (const iso of pfList) {
    if (!calRows.some((r) => r.iso === iso && r.tipo === "feriado")) {
      calRows.push({ iso, tipo: "pontoFacultativo" });
    } else {
      const row = calRows.find((r) => r.iso === iso);
      if (row) row.tipo = "ambos";
    }
  }
  calRows.sort((a, b) => a.iso.localeCompare(b.iso));
  for (const row of calRows) {
    const isFer = row.tipo === "feriado" || row.tipo === "ambos";
    const tipo =
      row.tipo === "ambos"
        ? "Feriado e ponto facultativo"
        : row.tipo === "feriado"
        ? "Feriado"
        : "Ponto facultativo";
    items.push({
      badge: isFer ? "Feriado" : "Ponto facultativo",
      tone: row.tipo === "pontoFacultativo" ? "calendario" : "warn",
      title: "Sem atendimento",
      preview: `${formatDataLonga(row.iso)} · ${tipo}`,
    });
  }

  // Visitas domiciliares (in-card)
  if (dentQuartaVisitaDomiciliarDesde) {
    for (const spec of specs) {
      const v = varianteVisitaDomiciliarNoCard({
        spec,
        todayStr: hoje,
        desdeStr: dentQuartaVisitaDomiciliarDesde,
      });
      if (!v) continue;
      const nome = nomeProfissional(spec.key, profissionaisMap);
      items.push({
        badge: "Visita domiciliar",
        tone: "info",
        title: v === "vespera" ? "Sem vagas para amanhã" : "Sem atendimento na UBS hoje",
        preview: `${nome} · ${formatDataLonga(spec.atendimentoDate)} · Manhã`,
      });
    }
  }

  return items;
}

export default function TabAvisos({
  isRecepcao,
  incluirAvisosOperacionais,
  specs = [],
  profissionaisMap = {},
  profNames = {},
  feriados = [],
  pontosFacultativos = [],
  dentQuartaVisitaDomiciliarDesde = "",
  atendimentoEncerradoMap = {},
  atendimentoSuspensoPorSpec = {},
  atendimentoSuspensoSlots = {},
  atendimentoDiasAtivosPorSpec = {},
  specKeysDesativados = [],
  avisosManuais = {},
  onRemoverSuspensaoPontual,
  onReativarAtendimentoSpec,
  onAdicionarAvisoManual,
  onRemoverAvisoManual,
}) {
  const hoje = dataHojeIso();
  const [agoraRef, setAgoraRef] = useState(() => new Date());
  const [modalReativarSpecKey, setModalReativarSpecKey] = useState(null);
  const [reativarDiasSel, setReativarDiasSel] = useState(() => new Set());
  const [reativarTurnosPorDia, setReativarTurnosPorDia] = useState({});
  const [modalAvisoAberto, setModalAvisoAberto] = useState(false);
  const [avisoForm, setAvisoForm] = useState({ titulo: "", texto: "", tone: "info", ate: "" });
  const [avisoSalvando, setAvisoSalvando] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAgoraRef(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!modalReativarSpecKey) return;
    const sk = modalReativarSpecKey;
    const def = diasAtendimentoDefaultParaSpec(sk);
    const cfg = atendimentoDiasAtivosPorSpec?.[sk];
    const fromCfg = Array.isArray(cfg) ? cfg.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)) : [];
    const initialDias = fromCfg.length > 0 ? fromCfg : [...def];
    setReativarDiasSel(new Set(initialDias));

    const prof = profissionalDocPorSpecKey(profissionaisMap, sk);
    const norm = normalizeAtendimentoDiasTurnosParaSpec(sk, prof?.atendimentoDiasTurnos);
    const turnos = {};
    for (const dia of initialDias) {
      const t = norm?.[dia] || turnosDefaultParaSpecNoDia(sk, dia);
      const hasT = t.length > 0;
      turnos[dia] = {
        manha: hasT ? t.includes("manha") : true,
        tarde: hasT ? t.includes("tarde") : true,
      };
    }
    setReativarTurnosPorDia(turnos);
  }, [modalReativarSpecKey, atendimentoDiasAtivosPorSpec, profissionaisMap]);

  useEffect(() => {
    if (!modalReativarSpecKey) return;
    setReativarTurnosPorDia((prev) => {
      const next = { ...prev };
      for (const d of reativarDiasSel) {
        if (next[d] == null) next[d] = { manha: true, tarde: true };
      }
      for (const k of Object.keys(next)) {
        if (!reativarDiasSel.has(k)) delete next[k];
      }
      return next;
    });
  }, [reativarDiasSel, modalReativarSpecKey]);

  const specsListaAvisos = useMemo(() => {
    if (isRecepcao) return specs;
    return specs.filter((s) => !agenteOcultarCardPorEncerrado(s, atendimentoEncerradoMap || {}));
  }, [specs, atendimentoEncerradoMap, isRecepcao]);

  const semVagasLivresAgente = useMemo(
    () => !isRecepcao && specsListaAvisos.length > 0 && !hasAnyVacancy(specsListaAvisos),
    [isRecepcao, specsListaAvisos]
  );

  const foraExpedienteAgente = useMemo(
    () => !isRecepcao && !estaDentroAlgumaJanelaSolicitacaoAgendamento(agoraRef),
    [isRecepcao, agoraRef]
  );

  const proximaAbertura = useMemo(
    () => proximaAberturaAgendamento(agoraRef, feriados),
    [agoraRef, feriados]
  );

  const ehFimDeSemanaAgora = useMemo(() => {
    const dow = agoraRef.getDay();
    return dow === 0 || dow === 6;
  }, [agoraRef]);

  const ehFeriadoAgora = useMemo(() => {
    const hojeStr = toDateStr(agoraRef);
    return (
      normalizeFeriadosList(feriados).includes(hojeStr) ||
      normalizeFeriadosList(pontosFacultativos).includes(hojeStr)
    );
  }, [agoraRef, feriados, pontosFacultativos]);

  const visitasDomicNoCard = useMemo(() => {
    if (!dentQuartaVisitaDomiciliarDesde) return [];
    const out = [];
    for (const spec of specs) {
      const v = varianteVisitaDomiciliarNoCard({
        spec,
        todayStr: hoje,
        desdeStr: dentQuartaVisitaDomiciliarDesde,
      });
      if (!v) continue;
      out.push({ spec, v, nome: nomeProfissional(spec.key, profissionaisMap) });
    }
    return out;
  }, [specs, hoje, dentQuartaVisitaDomiciliarDesde, profissionaisMap]);

  const avisoVisitaDomiciliarAmanha = useMemo(() => {
    if (!incluirAvisosOperacionais || !dentQuartaVisitaDomiciliarDesde) return null;
    if (!shouldShowAvisoVisitaDomiciliarAmanha(hoje, dentQuartaVisitaDomiciliarDesde)) return null;
    const amanhaIso = addDaysLocal(hoje, 1);
    const nomeDent = profNames.dentFernando || DEFAULT_PROF_NAMES.dentFernando;
    return { nomeDent, dataFmt: formatDataLonga(amanhaIso) };
  }, [incluirAvisosOperacionais, dentQuartaVisitaDomiciliarDesde, hoje, profNames]);

  const avisoSemAtendimentoAmanha = useMemo(() => {
    if (!incluirAvisosOperacionais) return null;
    const r = avisoSemAtendimentoUbAmanha(hoje, feriados, pontosFacultativos);
    if (!r) return null;
    return { ...r, dataFmt: formatDataLonga(r.iso) };
  }, [incluirAvisosOperacionais, hoje, feriados, pontosFacultativos]);

  const calendarioFuturo = useMemo(() => {
    const fer = normalizeFeriadosList(feriados).filter((d) => d >= hoje);
    const pf = normalizeFeriadosList(pontosFacultativos).filter((d) => d >= hoje);
    const rows = [];
    for (const iso of fer) rows.push({ iso, tipo: "feriado" });
    for (const iso of pf) {
      if (!rows.some((r) => r.iso === iso && r.tipo === "feriado")) {
        rows.push({ iso, tipo: "pontoFacultativo" });
      } else {
        const row = rows.find((r) => r.iso === iso);
        if (row) row.tipo = "ambos";
      }
    }
    rows.sort((a, b) => a.iso.localeCompare(b.iso));
    return rows;
  }, [feriados, pontosFacultativos, hoje]);

  const suspensaoPeriodo = useMemo(() => {
    const m = atendimentoSuspensoPorSpec || {};
    const entries = Object.entries(m).filter(
      ([specKey, v]) =>
        !specKeyEstaDesativado(specKey, specKeysDesativados) &&
        v &&
        typeof v.desde === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.desde.trim()) &&
        suspensaoRegistroNaoExpirado(v, hoje)
    );
    if (isRecepcao) return entries.sort((a, b) => a[1].desde.localeCompare(b[1].desde));
    return entries
      .filter(([specKey]) => specSuspensaoAfetaAgenda(specKey, m, hoje, atendimentoDiasAtivosPorSpec || {}))
      .sort((a, b) => a[1].desde.localeCompare(b[1].desde));
  }, [atendimentoSuspensoPorSpec, atendimentoDiasAtivosPorSpec, hoje, isRecepcao, specKeysDesativados]);

  const suspensaoPontual = useMemo(() => {
    const slots = atendimentoSuspensoSlots || {};
    const diasCfg = atendimentoDiasAtivosPorSpec || {};
    const out = [];
    for (const key of Object.keys(slots)) {
      const p = parseAtendimentoSuspensoSlotKey(key);
      if (!p) continue;
      if (specKeyEstaDesativado(p.specKey, specKeysDesativados)) continue;
      if (!isRecepcao && !suspensaoPontualSlotVisivelParaAgente(p.specKey, p.data, hoje, diasCfg)) continue;
      if (isRecepcao && p.data < hoje) continue;
      const motivo = typeof slots[key]?.motivo === "string" ? slots[key].motivo.trim() : "";
      out.push({ key, ...p, motivo });
    }
    out.sort((a, b) => (a.data !== b.data ? a.data.localeCompare(b.data) : a.specKey.localeCompare(b.specKey)));
    return out;
  }, [atendimentoSuspensoSlots, atendimentoDiasAtivosPorSpec, hoje, isRecepcao, specKeysDesativados]);

  const encerrados = useMemo(
    () => listaAvisosEncerrado(specs, atendimentoEncerradoMap),
    [specs, atendimentoEncerradoMap]
  );

  const avisosManuaisLista = useMemo(
    () => listaAvisosManuais(avisosManuais, hoje),
    [avisosManuais, hoje]
  );

  const podeGerenciarAvisos = isRecepcao && typeof onAdicionarAvisoManual === "function";

  async function submeterAvisoManual() {
    const texto = avisoForm.texto.trim();
    if (!texto) {
      window.alert("Escreva o texto do aviso.");
      return;
    }
    setAvisoSalvando(true);
    try {
      await Promise.resolve(
        onAdicionarAvisoManual({
          titulo: avisoForm.titulo.trim(),
          texto,
          tone: avisoForm.tone,
          ate: avisoForm.ate,
        })
      );
      setAvisoForm({ titulo: "", texto: "", tone: "info", ate: "" });
      setModalAvisoAberto(false);
    } finally {
      setAvisoSalvando(false);
    }
  }

  const temAmanha = !!avisoVisitaDomiciliarAmanha || !!avisoSemAtendimentoAmanha;
  const temCalendario = calendarioFuturo.length > 0;
  const temSuspensao = suspensaoPeriodo.length > 0 || suspensaoPontual.length > 0;
  const temEncerrado = encerrados.length > 0;
  const temHorarioVagas = foraExpedienteAgente || semVagasLivresAgente;
  const temVisitaDomicCard = visitasDomicNoCard.length > 0;
  const temAvisosManuais = avisosManuaisLista.length > 0;
  const vazio =
    !temAmanha &&
    !temCalendario &&
    !temSuspensao &&
    !temEncerrado &&
    !temHorarioVagas &&
    !temVisitaDomicCard &&
    !temAvisosManuais &&
    !podeGerenciarAvisos;

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <h1 style={S.title}>Avisos</h1>
        <p style={S.lead}>
          {isRecepcao
            ? "Suspensões, encerramentos e situações que afetam a agenda — gerencie reativações e publique avisos livres aqui."
            : "Suspensões, feriados, encerramentos e informações que afetam o agendamento."}
        </p>
      </header>

      {vazio ? (
        <div style={S.empty}>
          <p style={S.emptyTitle}>Nenhum aviso no momento</p>
          <p style={S.emptyText}>
            Feriados, pontos facultativos, suspensões e demais situações relevantes aparecerão aqui.
          </p>
        </div>
      ) : null}

      {temAvisosManuais || podeGerenciarAvisos ? (
        <section style={S.section}>
          <div style={S.avisoManualHead}>
            <div style={S.sectionHead}>
              <h2 style={S.sectionTitle}>Avisos da recepção</h2>
              <p style={S.sectionHint}>Recados livres publicados para toda a equipe.</p>
            </div>
            {podeGerenciarAvisos ? (
              <button
                type="button"
                style={S.avisoManualAddBtn}
                onClick={() => {
                  setAvisoForm({ titulo: "", texto: "", tone: "info", ate: "" });
                  setModalAvisoAberto(true);
                }}
              >
                + Novo aviso
              </button>
            ) : null}
          </div>
          {temAvisosManuais ? (
            <div style={S.cardList}>
              {avisosManuaisLista.map((a) => (
                <NoticeCard
                  key={a.id}
                  tone={a.tone}
                  badge="Aviso"
                  title={a.titulo || "Aviso da recepção"}
                >
                  <p style={S.avisoManualTexto}>{a.texto}</p>
                  {a.ate ? (
                    <p style={S.avisoManualValidade}>Válido até {formatDataLonga(a.ate)}</p>
                  ) : null}
                  {podeGerenciarAvisos && typeof onRemoverAvisoManual === "function" ? (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={S.cardActionBtnSecondary}
                        onClick={() => {
                          if (window.confirm("Remover este aviso?")) onRemoverAvisoManual(a.id);
                        }}
                      >
                        Remover aviso
                      </button>
                    </div>
                  ) : null}
                </NoticeCard>
              ))}
            </div>
          ) : (
            <p style={S.sectionEmpty}>Nenhum aviso publicado. Use “Novo aviso” para adicionar um recado.</p>
          )}
        </section>
      ) : null}

      {temHorarioVagas ? (
        <Section title="Horário e vagas">
          <div style={S.cardList}>
            {foraExpedienteAgente ? (
              <NoticeCard
                tone="warn"
                badge={
                  ehFimDeSemanaAgora
                    ? "Fim de semana"
                    : ehFeriadoAgora
                    ? "Feriado"
                    : "Fora do horário"
                }
                title={
                  ehFimDeSemanaAgora || ehFeriadoAgora
                    ? "Sem expediente de agendamento hoje"
                    : "Solicitações encerradas"
                }
                details={[
                  {
                    label: "Próxima abertura",
                    value: proximaAbertura || "Consulte o calendário da UBS",
                  },
                ]}
              />
            ) : null}
            {semVagasLivresAgente ? (
              <NoticeCard
                tone="muted"
                badge="Agenda lotada"
                title="Sem vagas disponíveis"
                note="Acompanhe novas aberturas pela equipe ou pela recepção."
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      {temVisitaDomicCard ? (
        <Section
          title="Odontologia — visitas domiciliares"
          hint="Quartas com visitas: sem consultas na UBS pela manhã."
        >
          <div style={S.cardList}>
            {visitasDomicNoCard.map(({ spec, v, nome }) =>
              v === "vespera" ? (
                <NoticeCard
                  key={`${spec.key}_vespera_${spec.atendimentoDate}`}
                  tone="info"
                  badge="Visita domiciliar"
                  title="Sem vagas para amanhã"
                  subject={nome}
                  details={[
                    { label: "Data", value: formatDataLonga(spec.atendimentoDate) },
                    { label: "Período", value: "Manhã" },
                    { label: "Motivo", value: "Agenda exclusiva para visitas domiciliares" },
                  ]}
                />
              ) : (
                <NoticeCard
                  key={`${spec.key}_hoje_${spec.atendimentoDate}`}
                  tone="info"
                  badge="Visita domiciliar"
                  title="Sem atendimento na UBS hoje"
                  subject={nome}
                  details={[
                    { label: "Data", value: formatDataLonga(spec.atendimentoDate) },
                    { label: "Período", value: "Manhã" },
                    { label: "Motivo", value: "Agenda exclusiva para visitas domiciliares" },
                  ]}
                />
              )
            )}
          </div>
        </Section>
      ) : null}

      {temAmanha ? (
        <Section title="Para amanhã">
          <div style={S.cardList}>
            {avisoVisitaDomiciliarAmanha ? (
              <NoticeCard
                tone="info"
                badge="Amanhã"
                title="Sem atendimento na UBS"
                subject={avisoVisitaDomiciliarAmanha.nomeDent}
                details={[
                  { label: "Data", value: avisoVisitaDomiciliarAmanha.dataFmt },
                  { label: "Período", value: "Manhã" },
                  { label: "Motivo", value: "Visitas domiciliares" },
                ]}
              />
            ) : null}
            {avisoSemAtendimentoAmanha ? (
              <NoticeCard
                tone="warn"
                badge="Amanhã"
                title="Sem atendimento"
                details={[
                  { label: "Data", value: avisoSemAtendimentoAmanha.dataFmt },
                  {
                    label: "Motivo",
                    value:
                      avisoSemAtendimentoAmanha.eFeriado && avisoSemAtendimentoAmanha.ePontoFacultativo
                        ? "Feriado e ponto facultativo"
                        : avisoSemAtendimentoAmanha.eFeriado
                        ? "Feriado"
                        : "Ponto facultativo",
                  },
                ]}
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      {temCalendario ? (
        <Section title="Calendário da UBS" hint="Datas sem atendimento a partir de hoje.">
          <div style={S.cardList}>
            {calendarioFuturo.map((row) => (
              <NoticeCard
                key={`${row.tipo}_${row.iso}`}
                tone={row.tipo === "pontoFacultativo" ? "calendario" : "warn"}
                badge={
                  row.tipo === "feriado"
                    ? "Feriado"
                    : row.tipo === "pontoFacultativo"
                    ? "Ponto facultativo"
                    : "Feriado"
                }
                title="Sem atendimento"
                details={[
                  { label: "Data", value: formatDataLonga(row.iso) },
                  ...(row.tipo === "ambos"
                    ? [{ label: "Tipo", value: "Feriado e ponto facultativo" }]
                    : []),
                ]}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {temSuspensao ? (
        <Section
          title="Suspensões de atendimento"
          hint={
            isRecepcao ? "Use os botões para reativar ou remover suspensões pontuais." : null
          }
        >
          <div style={S.cardList}>
            {suspensaoPeriodo.map(([specKey, entry]) => {
              const nome = nomeProfissional(specKey, profissionaisMap);
              const role = SPEC_META[specKey]?.role || "";
              const desde = entry.desde.trim();
              const exibirDesde = dataSuspensaoPosteriorAHoje(desde, hoje);
              const ateRaw = typeof entry.ate === "string" ? entry.ate.trim() : "";
              const exibirAte = dataSuspensaoPosteriorAHoje(ateRaw, hoje);
              const details = [
                {
                  label: "Início",
                  value: exibirDesde ? formatDataLonga(desde) : "Já em vigor",
                },
                {
                  label: "Término",
                  value: entry.indefinido
                    ? "Prazo indeterminado"
                    : ateRaw && /^\d{4}-\d{2}-\d{2}$/.test(ateRaw)
                    ? exibirAte
                      ? formatDataLonga(ateRaw)
                      : "Sem data definida"
                    : "Sem previsão cadastrada",
                },
              ];
              return (
                <NoticeCard
                  key={`periodo_${specKey}`}
                  tone="danger"
                  badge="Suspenso"
                  title="Atendimento suspenso"
                  subject={nome}
                  role={role || undefined}
                  details={details}
                >
                  {isRecepcao && typeof onReativarAtendimentoSpec === "function" ? (
                    <button
                      type="button"
                      style={S.cardActionBtn}
                      onClick={() => setModalReativarSpecKey(specKey)}
                    >
                      Reativar atendimento…
                    </button>
                  ) : null}
                </NoticeCard>
              );
            })}
            {suspensaoPontual.map((row) => {
              const nome = nomeProfissional(row.specKey, profissionaisMap);
              const role = SPEC_META[row.specKey]?.role || "";
              const exibirData = dataSuspensaoPosteriorAHoje(row.data, hoje);
              const details = [
                {
                  label: "Data",
                  value: exibirData ? formatDataLonga(row.data) : "Hoje",
                },
                { label: "Turno", value: labelEscopoSuspensaoPontual(row.escopo) },
                ...(row.motivo ? [{ label: "Motivo", value: row.motivo }] : []),
              ];
              return (
                <NoticeCard
                  key={row.key}
                  tone="danger"
                  badge="Suspensão pontual"
                  title="Atendimento suspenso"
                  subject={nome}
                  role={role || undefined}
                  details={details}
                >
                  {isRecepcao && typeof onRemoverSuspensaoPontual === "function" ? (
                    <button
                      type="button"
                      style={S.cardActionBtnSecondary}
                      onClick={() => onRemoverSuspensaoPontual(row.key)}
                    >
                      Remover suspensão
                    </button>
                  ) : null}
                </NoticeCard>
              );
            })}
          </div>
        </Section>
      ) : null}

      {temEncerrado ? (
        <Section title="Atendimentos encerrados">
          <div style={S.cardList}>
            {encerrados.map(({ spec, turno }) => {
              const nome = nomeProfissional(spec.key, profissionaisMap);
              const hasM = specTemSessaoNoTurno(spec, "manha");
              const hasT = specTemSessaoNoTurno(spec, "tarde");
              let turnoLabel;
              if (turno === "manha") turnoLabel = "Manhã";
              else if (turno === "tarde") turnoLabel = "Tarde";
              else if (hasM && hasT) turnoLabel = "Manhã e tarde";
              else if (hasM) turnoLabel = "Manhã";
              else if (hasT) turnoLabel = "Tarde";
              else turnoLabel = null;
              return (
                <NoticeCard
                  key={`${spec.key}_${spec.atendimentoDate}_${turno ?? "legado"}`}
                  tone="muted"
                  badge="Encerrado"
                  title="Atendimento encerrado"
                  subject={nome}
                  details={turnoLabel ? [{ label: "Turno", value: turnoLabel }] : []}
                />
              );
            })}
          </div>
        </Section>
      ) : null}

      {modalReativarSpecKey && typeof onReativarAtendimentoSpec === "function" && (
        <div
          style={S.modalBackdrop}
          role="presentation"
          onClick={() => setModalReativarSpecKey(null)}
        >
          <div
            style={S.modalBox}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-reativar-avisos"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-reativar-avisos" style={S.modalTitle}>
              Reativar atendimento
            </h2>
            <p style={S.modalLead}>
              {nomeProfissional(modalReativarSpecKey, profissionaisMap)}
              {SPEC_META[modalReativarSpecKey]?.role
                ? ` (${SPEC_META[modalReativarSpecKey].role})`
                : ""}
            </p>
            <p style={S.modalHint}>
              Marque livremente os dias de <strong>segunda a sexta-feira</strong> e, em cada dia, os{" "}
              <strong>turnos</strong> (manhã e/ou tarde) com atendimento.
            </p>
            <div style={S.modalChecksCol}>
              {ORDEM_DIA_SEMANA_GRADE.map((dia) => {
                const marcado = reativarDiasSel.has(dia);
                const t = reativarTurnosPorDia[dia] || { manha: true, tarde: true };
                return (
                  <div key={dia} style={S.modalDiaTurnoBlock}>
                    <label style={S.modalCheck}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => {
                          setReativarDiasSel((prev) => {
                            const n = new Set(prev);
                            if (n.has(dia)) n.delete(dia);
                            else n.add(dia);
                            return n;
                          });
                        }}
                      />
                      <span style={{ fontWeight: 700 }}>{DAY_LABEL[dia] || dia}</span>
                    </label>
                    {marcado && (
                      <div style={S.modalTurnosInline}>
                        <label style={S.modalCheckTurno}>
                          <input
                            type="checkbox"
                            checked={!!t.manha}
                            onChange={() =>
                              setReativarTurnosPorDia((prev) => {
                                const cur = prev[dia] || { manha: true, tarde: true };
                                return { ...prev, [dia]: { ...cur, manha: !cur.manha } };
                              })
                            }
                          />
                          <span>Manhã</span>
                        </label>
                        <label style={S.modalCheckTurno}>
                          <input
                            type="checkbox"
                            checked={!!t.tarde}
                            onChange={() =>
                              setReativarTurnosPorDia((prev) => {
                                const cur = prev[dia] || { manha: true, tarde: true };
                                return { ...prev, [dia]: { ...cur, tarde: !cur.tarde } };
                              })
                            }
                          />
                          <span>Tarde</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={S.modalFooter}>
              <button type="button" style={S.modalBtnGhost} onClick={() => setModalReativarSpecKey(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={S.modalBtnPrimary}
                onClick={() => {
                  const dias = [...reativarDiasSel].filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)).sort();
                  if (dias.length === 0) {
                    window.alert("Selecione pelo menos um dia da semana (segunda a sexta-feira).");
                    return;
                  }
                  const turnosFirestore = {};
                  for (const d of dias) {
                    const tu = reativarTurnosPorDia[d] || { manha: true, tarde: true };
                    const arr = [];
                    if (tu.manha) arr.push("manha");
                    if (tu.tarde) arr.push("tarde");
                    if (arr.length === 0) {
                      window.alert(
                        `Para ${DAY_LABEL[d] || d}, marque pelo menos um turno (manhã ou tarde).`
                      );
                      return;
                    }
                    turnosFirestore[d] = arr.sort();
                  }
                  void Promise.resolve(
                    onReativarAtendimentoSpec(modalReativarSpecKey, dias, turnosFirestore)
                  ).then(() => setModalReativarSpecKey(null));
                }}
              >
                Reativar e salvar dias
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAvisoAberto && podeGerenciarAvisos && (
        <div
          style={S.modalBackdrop}
          role="presentation"
          onClick={() => (avisoSalvando ? null : setModalAvisoAberto(false))}
        >
          <div
            style={S.modalBox}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-novo-aviso"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-novo-aviso" style={S.modalTitle}>
              Novo aviso
            </h2>
            <p style={S.modalHint}>
              O aviso aparece nesta aba para toda a equipe e agentes. Use para recados livres que não
              se encaixam em suspensões ou feriados.
            </p>

            <label style={S.avisoField}>
              <span style={S.avisoLabel}>Título (opcional)</span>
              <input
                type="text"
                value={avisoForm.titulo}
                maxLength={120}
                placeholder="Ex.: Coleta de exames"
                style={S.avisoInput}
                onChange={(e) => setAvisoForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </label>

            <label style={S.avisoField}>
              <span style={S.avisoLabel}>Mensagem</span>
              <textarea
                value={avisoForm.texto}
                maxLength={800}
                rows={4}
                placeholder="Escreva o aviso…"
                style={S.avisoTextarea}
                onChange={(e) => setAvisoForm((f) => ({ ...f, texto: e.target.value }))}
              />
            </label>

            <div style={S.avisoField}>
              <span style={S.avisoLabel}>Tipo</span>
              <div style={S.avisoToneRow}>
                {[
                  { v: "info", label: "Informativo" },
                  { v: "warn", label: "Atenção" },
                  { v: "danger", label: "Urgente" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    style={{
                      ...S.avisoToneBtn,
                      ...(avisoForm.tone === opt.v
                        ? {
                            borderColor: TONE[opt.v].accent,
                            background: TONE[opt.v].accent,
                            color: "#fff",
                          }
                        : {}),
                    }}
                    onClick={() => setAvisoForm((f) => ({ ...f, tone: opt.v }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label style={S.avisoField}>
              <span style={S.avisoLabel}>Válido até (opcional)</span>
              <input
                type="date"
                value={avisoForm.ate}
                min={hoje}
                style={S.avisoInput}
                onChange={(e) => setAvisoForm((f) => ({ ...f, ate: e.target.value }))}
              />
              <span style={S.avisoHelp}>Depois dessa data o aviso some sozinho.</span>
            </label>

            <div style={S.modalFooter}>
              <button
                type="button"
                style={S.modalBtnGhost}
                disabled={avisoSalvando}
                onClick={() => setModalAvisoAberto(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={S.modalBtnPrimary}
                disabled={avisoSalvando || !avisoForm.texto.trim()}
                onClick={submeterAvisoManual}
              >
                {avisoSalvando ? "Publicando…" : "Publicar aviso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 },
  header: { marginBottom: 4 },
  title: { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  lead: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.55, maxWidth: 640 },
  empty: {
    padding: "22px 20px",
    borderRadius: 12,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
  },
  emptyTitle: { margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#0F172A" },
  emptyText: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.5 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionHead: { display: "flex", flexDirection: "column", gap: 2 },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  sectionHint: { margin: 0, fontSize: 12, color: "#94A3B8" },
  sectionEmpty: { margin: 0, fontSize: 13, color: "#64748B" },
  cardList: { display: "flex", flexDirection: "column", gap: 8 },
  avisoManualHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  avisoManualAddBtn: {
    flexShrink: 0,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 9,
    border: "none",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(67,56,202,0.28)",
  },
  avisoManualTexto: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: "inherit",
    whiteSpace: "pre-wrap",
  },
  avisoManualValidade: {
    margin: "8px 0 0",
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.7,
  },
  avisoField: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  avisoLabel: { fontSize: 13, fontWeight: 700, color: "#334155" },
  avisoInput: {
    padding: "9px 11px",
    fontSize: 14,
    borderRadius: 9,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#0F172A",
    fontFamily: "inherit",
  },
  avisoTextarea: {
    padding: "9px 11px",
    fontSize: 14,
    borderRadius: 9,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#0F172A",
    fontFamily: "inherit",
    lineHeight: 1.5,
    resize: "vertical",
  },
  avisoToneRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  avisoToneBtn: {
    padding: "7px 13px",
    fontSize: 12.5,
    fontWeight: 700,
    borderRadius: 999,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  avisoHelp: { fontSize: 12, color: "#94A3B8" },
  cardActionBtn: {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "1px solid #F97316",
    background: "#FFF7ED",
    color: "#9A3412",
    cursor: "pointer",
  },
  cardActionBtnSecondary: {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
    backdropFilter: "blur(2px)",
  },
  modalBox: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 16,
    padding: "22px 24px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.2), 0 4px 16px rgba(15,23,42,0.08)",
    border: "1px solid #E2E8F0",
  },
  modalTitle: { margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  modalLead: { margin: "0 0 12px", fontSize: 14, color: "#475569", lineHeight: 1.5 },
  modalHint: { margin: "0 0 14px", fontSize: 13, color: "#64748B", lineHeight: 1.5 },
  modalChecksCol: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  modalDiaTurnoBlock: { display: "flex", flexDirection: "column", gap: 6 },
  modalCheck: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" },
  modalTurnosInline: { display: "flex", gap: 16, paddingLeft: 26 },
  modalCheckTurno: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #F1F5F9" },
  modalBtnGhost: {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 9,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  modalBtnPrimary: {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 9,
    border: "none",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(67,56,202,0.3)",
  },
};
