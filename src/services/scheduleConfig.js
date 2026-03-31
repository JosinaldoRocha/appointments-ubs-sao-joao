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
        fernandoCheck: true,
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
        fernandoCheck: true,
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
        fernandoCheck: true,
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
 */
export function sessionTotalEffective(dayKey, specKey, sessIdx, pccuTotal) {
  const spec = BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey);
  const sess = spec?.sessions?.[sessIdx];
  if (!sess) return 0;
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

export function parseDateStr(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt;
}

export function holidaySetFromArray(feriados) {
  return new Set(Array.isArray(feriados) ? feriados.filter(Boolean) : []);
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
export function collectAtendimentoDatesForListener(today, fernandoFora) {
  const seen = new Set();
  seen.add(toDateStr(today));
  for (let add = 0; add < 14; add++) {
    const cand = new Date(today);
    cand.setHours(12, 0, 0, 0);
    cand.setDate(cand.getDate() + add);
    const dk = JS_DAY_TO_KEY[cand.getDay()];
    if (!BASE_SCHEDULE[dk]) continue;
    const hasVisibleSpec = BASE_SCHEDULE[dk].specs.some(
      (sp) => !(sp.fernandoCheck && fernandoFora)
    );
    if (hasVisibleSpec) seen.add(toDateStr(cand));
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

function mergeSessionCounts(sessions, specKey, atendimentoDateStr, vagasMap) {
  return sessions.map((sess, idx) => {
    const id = vagaDocId(atendimentoDateStr, specKey, idx);
    const vdb = vagasMap[id];
    const used = vdb?.used ?? 0;
    const reserved = vdb?.reserved ?? 0;
    return { ...sess, used, reserved, sessIdx: idx };
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
  fernandoFora,
  vagasMap,
  pccuTotal,
  recepcao = false,
}) {
  const holidaySet = holidaySetFromArray(feriados);
  const todayStr = toDateStr(today);
  const dedupe = new Set();
  const result = [];

  for (const [atendimentoDia, dayData] of Object.entries(BASE_SCHEDULE)) {
    for (const spec of dayData.specs) {
      if (spec.fernandoCheck && fernandoFora) continue;

      for (let add = 0; add < 14; add++) {
        const cand = new Date(today);
        cand.setHours(12, 0, 0, 0);
        cand.setDate(cand.getDate() + add);
        if (JS_DAY_TO_KEY[cand.getDay()] !== atendimentoDia) continue;

        const attStr = toDateStr(cand);
        const baseSessions = cloneSessionsWithTotals(spec, pccuTotal);
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

        if (attStr === todayStr && (temVaga || recepcao)) {
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
    fernandoFora: options.fernandoFora ?? false,
    vagasMap,
    pccuTotal: options.pccuTotal ?? DEFAULT_PCCU_TOTAL,
    recepcao: options.recepcao ?? false,
  });
}
