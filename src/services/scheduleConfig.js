// src/services/scheduleConfig.js
// ─────────────────────────────────────────────────────────────────
//  Toda a lógica de horários da UBS fica centralizada aqui.
// ─────────────────────────────────────────────────────────────────

export const SPEC_META = {
  medico:         { role: "Clínico Geral",  av: "MC", bg: "#E6F1FB", tc: "#0C447C" },
  dentFernando:   { role: "Odontologia",    av: "DF", bg: "#E1F5EE", tc: "#085041" },
  dentPatrick:    { role: "Odontologia",    av: "DP", bg: "#E1F5EE", tc: "#085041" },
  psicologa:      { role: "Psicologia",     av: "DK", bg: "#FBEAF0", tc: "#72243E" },
  fisio:          { role: "Fisioterapia",   av: "DA", bg: "#FAEEDA", tc: "#633806" },
  enfermeira:     { role: "Enfermagem",     av: "EN", bg: "#EAF3DE", tc: "#27500A" },
  nutricionista:  { role: "Nutrição",       av: "NT", bg: "#ECFDF5", tc: "#065F46" },
};

export const DEFAULT_PROF_NAMES = {
  medico:         "Dr. Clínico",
  dentFernando:   "Dr. Fernando",
  dentPatrick:    "Dr. Patrick",
  psicologa:      "Dra. Kauane",
  fisio:          "Dra. Aracele",
  enfermeira:     "Enfermeira",
  nutricionista:  "Nutricionista",
};

/** Tipos de sessão do médico (UI / filtros) */
export const MEDICO_TIPO = {
  receitas:  { label: "Troca de receitas", short: "Receitas",  color: "#7C3AED", bg: "#EDE9FE" },
  clinico:   { label: "Clínico geral",     short: "Clínico",   color: "#0C447C", bg: "#DBEAFE" },
  gestantes: { label: "Gestantes",         short: "Gestantes", color: "#BE185D", bg: "#FCE7F3" },
};

// Dia útil anterior ao atendimento = dia de agendamento normal
export const AGENDA_PREV = {
  segunda: "sexta",
  terca:   "segunda",
  quarta:  "terca",
  quinta:  "quarta",
  sexta:   "quinta",
};

export const JS_DAY_TO_KEY = [
  "domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado",
];

export const DAY_LABEL = {
  segunda: "Segunda-feira",
  terca:   "Terça-feira",
  quarta:  "Quarta-feira",
  quinta:  "Quinta-feira",
  sexta:   "Sexta-feira",
};

// Configuração base de cada dia de atendimento
export const BASE_SCHEDULE = {
  segunda: {
    specs: [
      {
        key: "medico",
        sessions: [
          { label: "Manhã – Troca de receitas", total: 10, medicoTipo: "receitas" },
          { label: "Tarde – Clínico geral",     total: 15, medicoTipo: "clinico" },
        ],
      },
      {
        key: "dentFernando",
        sessions: [
          { label: "Manhã", total: 8 },
          { label: "Tarde", total: 8 },
        ],
      },
      {
        key: "psicologa",
        /** Atendimento às segundas; agendamento liberado em qualquer dia útil (como fisioterapia/nutri). */
        agendaQualquerDiaUtil: true,
        /** Lista de espera quando a agenda enche — modal padrão (sem encaminhamento obrigatório). */
        sessions: [{ label: "Manhã", total: 5, waitlistEnabled: true }],
      },
    ],
  },
  terca: {
    specs: [
      {
        key: "medico",
        sessions: [
          { label: "Manhã – Clínico geral", total: 15, medicoTipo: "clinico" },
          { label: "Tarde – Gestantes",     total: 6,  medicoTipo: "gestantes" },
        ],
      },
      {
        key: "dentFernando",
        sessions: [
          { label: "Manhã", total: 8 },
          { label: "Tarde", total: 8 },
        ],
      },
      {
        key: "enfermeira",
        sessions: [
          { label: "Manhã", total: 15 },
          { label: "Tarde", total: 10 },
        ],
      },
    ],
  },
  quarta: {
    specs: [
      {
        key: "medico",
        sessions: [{ label: "Manhã – Clínico geral", total: 15, medicoTipo: "clinico" }],
      },
      {
        key: "dentFernando",
        sessions: [{ label: "Manhã", total: 8 }],
      },
      {
        key: "enfermeira",
        sessions: [
          {
            label: "Manhã – PCCU",
            total: 15,
            pccuOnly: true,
          },
          { label: "Tarde – Enfermagem geral", total: 10 },
        ],
      },
    ],
  },
  quinta: {
    specs: [
      {
        key: "dentPatrick",
        sessions: [
          { label: "Manhã", total: 8 },
          { label: "Tarde", total: 8 },
        ],
      },
      {
        key: "nutricionista",
        /** Atendimento só às quintas; agendamento liberado em qualquer dia útil (ver buildVisibleSegments). */
        agendaQualquerDiaUtil: true,
        sessions: [
          { label: "Manhã", total: 8 },
          { label: "Tarde", total: 8 },
        ],
      },
      {
        key: "fisio",
        /** Solicitação via WhatsApp exige encaminhamento (foto) e dados completos — ver ModalAgendar. */
        solicitacaoEncaminhamentoObrigatorio: true,
        /** Agendamento liberado em qualquer dia útil (atendimento quintas e sextas). */
        agendaQualquerDiaUtil: true,
        sessions: [{ label: "Manhã", total: 6, waitlistEnabled: true }],
      },
      {
        key: "enfermeira",
        sessions: [
          { label: "Manhã", total: 15 },
          { label: "Tarde", total: 10 },
        ],
      },
    ],
  },
  sexta: {
    specs: [
      {
        key: "dentPatrick",
        sessions: [
          { label: "Manhã", total: 8 },
          { label: "Tarde", total: 8 },
        ],
      },
      {
        key: "fisio",
        solicitacaoEncaminhamentoObrigatorio: true,
        agendaQualquerDiaUtil: true,
        sessions: [{ label: "Manhã", total: 6, waitlistEnabled: true }],
      },
      {
        key: "enfermeira",
        sessions: [
          { label: "Manhã", total: 15 },
          { label: "Tarde", total: 10 },
        ],
      },
    ],
  },
};

export const DEFAULT_PCCU_TOTAL = 15;

/** Vagas extras por turno (manhã/tarde), além da agenda — urgência ou zona rural. Fisioterapia não recebe. */
export const ENCAXE_POR_TURNO = 2;

export function encaixeExtraForSpec(specKey) {
  return specKey === "fisio" ? 0 : ENCAXE_POR_TURNO;
}

/**
 * Total efetivo de vagas no turno (agenda base + encaixe), alinhado à UI e ao Firestore.
 * @param {object} [opts]
 * @param {string} [opts.atendimentoDateStr] — YYYY-MM-DD (regra quarta manhã odonto / visitas)
 * @param {string} [opts.dentQuartaVisitaDomiciliarDesde] — primeira quarta (AAAA-MM-DD) ou vazio
 */
export function sessionTotalEffective(dayKey, specKey, sessIdx, pccuTotal, opts = {}) {
  const spec = BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey);
  const sess = spec?.sessions?.[sessIdx];
  if (!sess) return 0;
  if (
    dayKey === "quarta" &&
    specKey === "dentFernando" &&
    sessIdx === 0 &&
    opts.atendimentoDateStr &&
    opts.dentQuartaVisitaDomiciliarDesde &&
    isDentQuartaVisitaDomiciliar(opts.atendimentoDateStr, opts.dentQuartaVisitaDomiciliarDesde)
  ) {
    return 0;
  }
  const base = sess.pccuOnly ? (pccuTotal ?? sess.total ?? DEFAULT_PCCU_TOTAL) : sess.total;
  return base + encaixeExtraForSpec(specKey);
}

/** Data local YYYY-MM-DD (evita deslocamento UTC) */
export function toDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minutos desde meia-noite até o fim do turno da manhã (início da tarde). 12:00. */
const TURNO_MANHA_FIM_MINUTOS = 12 * 60;

/** Fim do turno da tarde no dia do atendimento (cartões “hoje” somem após este horário). 17:00. */
const TURNO_TARDE_FIM_MINUTOS = 17 * 60;

/** `"manha"` ou `"tarde"` conforme o relógio local. */
export function turnoAtualDoRelogio(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const min = d.getHours() * 60 + d.getMinutes();
  return min < TURNO_MANHA_FIM_MINUTOS ? "manha" : "tarde";
}

/** A partir do rótulo da sessão (ex.: "Manhã – Clínico"), retorna `"manha"` | `"tarde"` | null. */
export function sessaoLabelParaTurno(label) {
  const s = String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "");
  if (s.startsWith("manha")) return "manha";
  if (s.startsWith("tarde")) return "tarde";
  return null;
}

/** O cartão tem pelo menos uma sessão no turno indicado. */
export function specTemSessaoNoTurno(spec, turno) {
  if (!turno || !spec?.sessions?.length) return false;
  return spec.sessions.some((s) => sessaoLabelParaTurno(s.label) === turno);
}

/**
 * Cartão `same` na data de hoje: índices das sessões a exibir — turno atual e o seguinte
 * (antes de 12h: manhã + tarde quando existirem; a partir de 12h: só tarde). Turno da manhã
 * deixa de aparecer após 12h. Sessões sem rótulo Manhã/Tarde permanecem visíveis (agenda “dia inteiro”).
 * Demais cartões: retorna `null` → usar todas as sessões.
 */
export function indicesSessoesAtendimentoHojeVisiveis(spec, agora = new Date()) {
  if (spec?.windowType !== "same") return null;
  const hoje = toDateStr(agora);
  if (spec.atendimentoDate !== hoje) return null;
  const sessions = spec.sessions || [];
  if (sessions.length === 0) return [];
  const d = agora instanceof Date ? agora : new Date(agora);
  const min = d.getHours() * 60 + d.getMinutes();
  const manhaJaPassou = min >= TURNO_MANHA_FIM_MINUTOS;
  const out = [];
  sessions.forEach((sess, idx) => {
    const t = sessaoLabelParaTurno(sess.label);
    if (t == null) {
      out.push(idx);
      return;
    }
    if (manhaJaPassou) {
      if (t === "tarde") out.push(idx);
    } else if (t === "manha" || t === "tarde") {
      out.push(idx);
    }
  });
  return out;
}

/**
 * Cartão de atendimento no dia atual (`same`): deve ficar oculto para todos os usuários
 * após o horário de encerramento do(s) turno(s) daquele profissional (manhã 12h; tarde 17h;
 * quem tem manhã e tarde some após 17h). Sessões sem rótulo manhã/tarde contam como “dia inteiro” até 17h.
 */
export function specAtendimentoHojeOcultoAposTurnos(spec, agora = new Date()) {
  if (spec.windowType !== "same") return false;
  const hoje = toDateStr(agora);
  if (spec.atendimentoDate !== hoje) return false;
  const d = agora instanceof Date ? agora : new Date(agora);
  const min = d.getHours() * 60 + d.getMinutes();
  const hasManha = specTemSessaoNoTurno(spec, "manha");
  const hasTarde = specTemSessaoNoTurno(spec, "tarde");
  if (hasManha && hasTarde) return min >= TURNO_TARDE_FIM_MINUTOS;
  if (hasManha && !hasTarde) return min >= TURNO_MANHA_FIM_MINUTOS;
  if (!hasManha && hasTarde) return min >= TURNO_TARDE_FIM_MINUTOS;
  return min >= TURNO_TARDE_FIM_MINUTOS;
}

/**
 * Recepção: pode exibir "Atendimento finalizado" — só em card de atendimento hoje (`same`),
 * quando o relógio está no turno correspondente (manhã antes de 12h, tarde a partir de 12h).
 * `turno` explícito (`"manha"` | `"tarde"`) alinha o botão àquele turno; sem `turno`, usa o turno atual.
 */
export function recepcaoPodeMarcarAtendimentoFinalizado(spec, agora = new Date(), turno = null) {
  if (spec.windowType !== "same") return false;
  const hoje = toDateStr(agora);
  if (spec.atendimentoDate !== hoje) return false;
  const hasM = specTemSessaoNoTurno(spec, "manha");
  const hasT = specTemSessaoNoTurno(spec, "tarde");
  if (!hasM && !hasT) return false;
  const t = turno != null ? turno : turnoAtualDoRelogio(agora);
  if (!specTemSessaoNoTurno(spec, t)) return false;
  return turnoAtualDoRelogio(agora) === t;
}

/**
 * Agente/direção: o cartão some só quando o encerramento cobre o caso (legado = dia inteiro;
 * manhã e tarde no mesmo card = ambos os flags ou chave legado).
 */
export function agenteOcultarCardPorEncerrado(spec, atendimentoEncerradoMap = {}) {
  const d = spec.atendimentoDate;
  if (typeof d !== "string" || !d) return false;
  const map = atendimentoEncerradoMap;
  const base = `${spec.key}_${d}`;
  if (map[base]) return true;
  const hasM = specTemSessaoNoTurno(spec, "manha");
  const hasT = specTemSessaoNoTurno(spec, "tarde");
  if (hasM && hasT) return !!(map[`${base}_manha`] && map[`${base}_tarde`]);
  if (hasM && !hasT) return !!(map[`${base}_manha`] || map[base]);
  if (!hasM && hasT) return !!(map[`${base}_tarde`] || map[base]);
  return !!map[base];
}

export function parseDateStr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt;
}

/** Soma dias a uma data ISO local (YYYY-MM-DD). */
export function addDaysLocal(isoStr, days) {
  const d = parseDateStr(isoStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/**
 * Intervalo entre dias de visita domiciliar (Dr. Fernando): quinzenal a partir da data informada
 * (uma quarta sim, outra não). 14 dias corridos entre quartas consecutivas da série — alinhado ao
 * pedido “de 15 em 15 dias” no sentido quinzenal (duas semanas no mesmo dia da semana).
 */
export const INTERVALO_DIAS_VISITA_DOMICILIAR_ODONTO = 14;

/**
 * Odontologia (Dr. Fernando) — quarta manhã reservada para visitas domiciliares:
 * quartas-feiras a partir de `desdeStr`, de INTERVALO_DIAS_VISITA_DOMICILIAR_ODONTO em
 * INTERVALO_DIAS_VISITA_DOMICILIAR_ODONTO dias (ex.: quinzenal).
 */
export function isDentQuartaVisitaDomiciliar(attStr, desdeStr) {
  const raw = desdeStr != null ? String(desdeStr).trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const cand = parseDateStr(attStr);
  cand.setHours(12, 0, 0, 0);
  if (cand.getDay() !== 3) return false;
  if (attStr < raw) return false;
  const base = parseDateStr(raw);
  base.setHours(12, 0, 0, 0);
  const diffDays = Math.round((cand.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return false;
  return diffDays % INTERVALO_DIAS_VISITA_DOMICILIAR_ODONTO === 0;
}

/**
 * Exibir aviso no dia **anterior** (calendário) à quarta de visitas: `hoje + 1 dia` é quarta com visitas.
 */
export function shouldShowAvisoVisitaDomiciliarAmanha(todayStr, desdeStr) {
  const amanha = addDaysLocal(todayStr, 1);
  return isDentQuartaVisitaDomiciliar(amanha, desdeStr);
}

/**
 * Qual mensagem contextual exibir no card do dentista (quarta, visitas domiciliares).
 * @returns {"vespera" | "hoje" | null}
 */
export function varianteVisitaDomiciliarNoCard({ spec, todayStr, desdeStr }) {
  if (!desdeStr || spec.key !== "dentFernando" || spec.atendimentoDia !== "quarta") return null;
  if (!isDentQuartaVisitaDomiciliar(spec.atendimentoDate, desdeStr)) return null;
  if (spec.windowType === "same" && spec.atendimentoDate === todayStr) return "hoje";
  if (spec.windowType === "prev" && addDaysLocal(todayStr, 1) === spec.atendimentoDate) return "vespera";
  return null;
}

/** Lista única de datas ISO (AAAA-MM-DD) a partir do Firestore ou do formulário. */
export function normalizeFeriadosList(feriados) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(feriados)) return out;
  for (const f of feriados) {
    if (typeof f !== "string") continue;
    const t = f.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  out.sort();
  return out;
}

export function holidaySetFromArray(feriados) {
  return new Set(normalizeFeriadosList(feriados));
}

/** Feriados + pontos facultativos: dias em que a UBS não agenda (mesma regra de dia útil). */
export function nonWorkingDaySet(feriados, pontosFacultativos = []) {
  const set = new Set(normalizeFeriadosList(feriados));
  for (const d of normalizeFeriadosList(pontosFacultativos)) set.add(d);
  return set;
}

/**
 * Feriados cuja data é **amanhã** (`todayStr` + 1 dia), para exibir aviso no dia anterior (calendário).
 */
export function feriadosQueCaemEmAmanha(todayStr, feriados) {
  const amanha = addDaysLocal(todayStr, 1);
  const list = Array.isArray(feriados) ? feriados : [];
  const seen = new Set();
  const out = [];
  for (const f of list) {
    if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f.trim())) continue;
    const iso = f.trim();
    if (iso !== amanha || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
  }
  return out;
}

/**
 * Amanhã é feriado e/ou ponto facultativo na UBS (para aviso no calendário).
 * @returns {{ iso: string, eFeriado: boolean, ePontoFacultativo: boolean } | null}
 */
export function avisoSemAtendimentoUbAmanha(todayStr, feriados, pontosFacultativos = []) {
  const amanha = addDaysLocal(todayStr, 1);
  const eFeriado = normalizeFeriadosList(feriados).includes(amanha);
  const ePontoFacultativo = normalizeFeriadosList(pontosFacultativos).includes(amanha);
  if (!eFeriado && !ePontoFacultativo) return null;
  return { iso: amanha, eFeriado, ePontoFacultativo };
}

export function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function isBusinessDay(date, holidaySet) {
  if (isWeekend(date)) return false;
  const s = toDateStr(date);
  return !holidaySet.has(s);
}

/** Último dia útil estritamente anterior a `attendanceDate` (meia-noite local). */
export function previousBusinessDay(attendanceDate, holidaySet) {
  const d = attendanceDate instanceof Date ? new Date(attendanceDate) : parseDateStr(attendanceDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (!isBusinessDay(d, holidaySet)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** Próximo dia útil estritamente posterior a `fromDate` (meia-noite local). */
export function nextBusinessDay(fromDate, holidaySet) {
  const d = fromDate instanceof Date ? new Date(fromDate) : parseDateStr(fromDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (!isBusinessDay(d, holidaySet)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function todayKey() {
  return JS_DAY_TO_KEY[new Date().getDay()] || null;
}

/** Infere uma data ISO (YYYY-MM-DD) para um `dayKey` da grade, a partir de `fromDate`. */
export function inferAtendimentoDateForDayKey(dayKey, fromDate = new Date()) {
  for (let i = 0; i < 21; i++) {
    const d = new Date(fromDate);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    if (JS_DAY_TO_KEY[d.getDay()] === dayKey) return toDateStr(d);
  }
  return toDateStr(fromDate);
}

/** ID estável do documento de vaga no Firestore */
export function vagaDocId(atendimentoDateStr, specKey, sessIdx) {
  return `${atendimentoDateStr}_${specKey}_${sessIdx}`;
}

/** Datas de atendimento nos próximos dias que podem ter documentos em `vagas` (para o listener). */
export function collectAtendimentoDatesForListener(
  today,
  feriados = [],
  pontosFacultativos = []
) {
  const holidaySet = nonWorkingDaySet(feriados, pontosFacultativos);
  const seen = new Set();
  const todayStr = toDateStr(today);
  if (!holidaySet.has(todayStr)) seen.add(todayStr);
  for (let add = 0; add < 14; add++) {
    const cand = new Date(today);
    cand.setHours(12, 0, 0, 0);
    cand.setDate(cand.getDate() + add);
    const attStr = toDateStr(cand);
    if (holidaySet.has(attStr)) continue;
    const dk = JS_DAY_TO_KEY[cand.getDay()];
    if (!BASE_SCHEDULE[dk]) continue;
    seen.add(attStr);
  }
  return [...seen];
}

function cloneSessionsWithTotals(spec, pccuTotal) {
  const extra = encaixeExtraForSpec(spec.key);
  return spec.sessions.map((sess) => {
    const base = sess.pccuOnly ? (pccuTotal ?? sess.total ?? DEFAULT_PCCU_TOTAL) : sess.total;
    const total = base + extra;
    return { ...sess, total, encaixeExtra: extra };
  });
}

/** TTL da reserva de solicitação (agente/direção) no doc `vagas` — alinhado ao backend. */
export const RESERVA_SOLICITACAO_TTL_MS = 25 * 60 * 1000;

/**
 * `vdb` ou sessão com `reservaSolicitacao: { uid, nome, criadoEm }` (Timestamp Firestore).
 */
export function reservaSolicitacaoAtiva(vdb) {
  const rs = vdb?.reservaSolicitacao;
  if (!rs?.criadoEm) return false;
  const ms = typeof rs.criadoEm.toMillis === "function" ? rs.criadoEm.toMillis() : 0;
  if (!ms) return false;
  return Date.now() - ms < RESERVA_SOLICITACAO_TTL_MS;
}

function mergeSessionCounts(sessions, specKey, atendimentoDateStr, vagasMap) {
  return sessions.map((sess, idx) => {
    const id = vagaDocId(atendimentoDateStr, specKey, idx);
    const vdb = vagasMap[id];
    const used = vdb?.used ?? 0;
    const reserved = vdb?.reserved ?? 0;
    const reservaSolicitacao = vdb?.reservaSolicitacao ?? null;
    return { ...sess, used, reserved, sessIdx: idx, reservaSolicitacao };
  });
}

/** Agrupa por profissional + dia da semana de atendimento (ex.: fisioterapia quinta vs sexta). */
function chaveAgendaQualquerDiaUtil(seg) {
  return `${seg.key}::${seg.atendimentoDia}`;
}

/**
 * Um cartão por combinação (chave + dia de atendimento) com `agendaQualquerDiaUtil`:
 * prioriza atendimento hoje (same); senão a data de atendimento mais próxima (prev).
 */
function dedupeAgendaQualquerDiaUtil(segments) {
  const groups = new Map();
  for (const seg of segments) {
    if (!seg.agendaQualquerDiaUtil) continue;
    const ck = chaveAgendaQualquerDiaUtil(seg);
    const g = groups.get(ck) || { same: null, prevs: [] };
    if (seg.windowType === "same") g.same = seg;
    else g.prevs.push(seg);
    groups.set(ck, g);
  }

  function pickOne(ck) {
    const g = groups.get(ck);
    if (!g) return null;
    if (g.same) return g.same;
    if (g.prevs.length === 0) return null;
    g.prevs.sort((a, b) => a.atendimentoDate.localeCompare(b.atendimentoDate));
    return g.prevs[0];
  }

  const emitted = new Set();
  const out = [];
  for (const seg of segments) {
    if (!seg.agendaQualquerDiaUtil) {
      out.push(seg);
      continue;
    }
    const ck = chaveAgendaQualquerDiaUtil(seg);
    if (emitted.has(ck)) continue;
    emitted.add(ck);
    const one = pickOne(ck);
    if (one) out.push(one);
  }
  return out;
}

/**
 * Monta cartões visíveis: janela "prev" (dia útil de agendamento) e "same" (sobras no dia do atendimento).
 * @param {boolean} [recepcao] — Se true, mantém cartões de atendimento no dia atual mesmo com agenda cheia (recepção precisa liberar vagas).
 */
export function buildVisibleSegments({
  today,
  feriados,
  pontosFacultativos = [],
  vagasMap,
  pccuTotal,
  recepcao = false,
  dentQuartaVisitaDomiciliarDesde = "",
}) {
  const holidaySet = nonWorkingDaySet(feriados, pontosFacultativos);
  const todayStr = toDateStr(today);
  const dedupe = new Set();
  const result = [];

  for (const [atendimentoDia, dayData] of Object.entries(BASE_SCHEDULE)) {
    for (const spec of dayData.specs) {
      for (let add = 0; add < 14; add++) {
        const cand = new Date(today);
        cand.setHours(12, 0, 0, 0);
        cand.setDate(cand.getDate() + add);
        if (JS_DAY_TO_KEY[cand.getDay()] !== atendimentoDia) continue;

        const attStr = toDateStr(cand);
        if (holidaySet.has(attStr)) continue;

        let baseSessions = cloneSessionsWithTotals(spec, pccuTotal);
        if (
          spec.key === "dentFernando" &&
          atendimentoDia === "quarta" &&
          dentQuartaVisitaDomiciliarDesde &&
          isDentQuartaVisitaDomiciliar(attStr, dentQuartaVisitaDomiciliarDesde)
        ) {
          baseSessions = baseSessions.map((sess, idx) => {
            if (idx !== 0) return sess;
            if (sessaoLabelParaTurno(sess.label) !== "manha") return sess;
            return { ...sess, total: 0, encaixeExtra: 0 };
          });
        }
        const sessions = mergeSessionCounts(baseSessions, spec.key, attStr, vagasMap);

        const temVaga = sessions.some(
          (s) => !s.waitlistEnabled && s.used + s.reserved < s.total
        );

        const prevBus = previousBusinessDay(cand, holidaySet);
        const prevStr = toDateStr(prevBus);

        const podeAgendarPrev =
          spec.agendaQualquerDiaUtil === true
            ? isBusinessDay(today, holidaySet) && todayStr < attStr
            : prevStr === todayStr;

        if (podeAgendarPrev) {
          const k = `prev-${spec.key}-${atendimentoDia}-${attStr}`;
          if (!dedupe.has(k)) {
            dedupe.add(k);
            result.push({
              ...spec,
              sessions,
              atendimentoDia,
              windowType: "prev",
              atendimentoDate: attStr,
            });
          }
        }

        const visitaDomicHojeSemVaga =
          spec.key === "dentFernando" &&
          atendimentoDia === "quarta" &&
          dentQuartaVisitaDomiciliarDesde &&
          isDentQuartaVisitaDomiciliar(attStr, dentQuartaVisitaDomiciliarDesde);

        if (attStr === todayStr && (temVaga || recepcao || visitaDomicHojeSemVaga)) {
          const k = `same-${spec.key}-${atendimentoDia}-${attStr}`;
          if (!dedupe.has(k)) {
            dedupe.add(k);
            result.push({
              ...spec,
              sessions,
              atendimentoDia,
              windowType: "same",
              atendimentoDate: attStr,
            });
          }
        }
      }
    }
  }

  return dedupeAgendaQualquerDiaUtil(result);
}

/** @deprecated use buildVisibleSegments */
export function getSpecsVisiveis(vagasMap, profNames, options = {}) {
  const today = options.today ?? new Date();
  return buildVisibleSegments({
    today,
    feriados: options.feriados ?? [],
    pontosFacultativos: options.pontosFacultativos ?? [],
    vagasMap,
    pccuTotal: options.pccuTotal ?? DEFAULT_PCCU_TOTAL,
    recepcao: options.recepcao ?? false,
    dentQuartaVisitaDomiciliarDesde: options.dentQuartaVisitaDomiciliarDesde ?? "",
  });
}

// ─────────────────────────────────────────────────────────────────
//  Expediente da UBS (solicitações por agentes / direção — horário local)
// ─────────────────────────────────────────────────────────────────

const EXP_UBS_AGENTE_INICIO_MANHA_MIN = 7 * 60 + 30; // 7:30
const EXP_UBS_AGENTE_FIM_MANHA_MIN = 12 * 60; // 12:00 (intervalo [início, fim) em minutos do dia)
const EXP_UBS_AGENTE_INICIO_TARDE_MIN = 14 * 60; // 14:00
const EXP_UBS_AGENTE_FIM_TARDE_MIN = 17 * 60; // 17:00

/**
 * Dois períodos: 7h30–12h e 14h–17h (horário local). Fora do almoço (12h–14h) não permite solicitação.
 */
export function estaDentroExpedienteUbs(data = new Date()) {
  const d = data instanceof Date ? data : new Date(data);
  const min = d.getHours() * 60 + d.getMinutes();
  const manha = min >= EXP_UBS_AGENTE_INICIO_MANHA_MIN && min < EXP_UBS_AGENTE_FIM_MANHA_MIN;
  const tarde = min >= EXP_UBS_AGENTE_INICIO_TARDE_MIN && min < EXP_UBS_AGENTE_FIM_TARDE_MIN;
  return manha || tarde;
}

export const MSG_FORA_EXPEDIENTE_UBS =
  "Solicitações de agendamento só são permitidas no horário de expediente da UBS: 7h30 às 12h e das 14h às 17h.";
