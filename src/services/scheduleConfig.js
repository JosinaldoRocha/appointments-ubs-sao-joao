// src/services/scheduleConfig.js
// ─────────────────────────────────────────────────────────────────
//  Toda a lógica de horários da UBS fica centralizada aqui.
//
//  Reforma: atendimento na unidade somente à tarde (13h–18h). Rótulos de sessão usam "Tarde – …"
//  (ou "Tarde" genérico). Exceção: coleta de exames de rotina permanece às quartas-feiras, 7h.
// ─────────────────────────────────────────────────────────────────

export const SPEC_META = {
  medico:         { role: "Clínico Geral",  av: "MC", bg: "#EEF2FF", tc: "#4338CA" },
  dentFernando:   { role: "Odontologia",    av: "DF", bg: "#E1F5EE", tc: "#085041" },
  dentPatrick:    { role: "Odontologia",    av: "DP", bg: "#E1F5EE", tc: "#085041" },
  psicologa:      { role: "Psicologia",     av: "DK", bg: "#FBEAF0", tc: "#72243E" },
  fisio:          { role: "Fisioterapia",   av: "DA", bg: "#FAEEDA", tc: "#633806" },
  enfermeira:     { role: "Enfermagem",     av: "EN", bg: "#EAF3DE", tc: "#27500A" },
  tecnicoEnfermagem: { role: "Téc. Enfermagem", av: "TE", bg: "#E0F2FE", tc: "#075985" },
  nutricionista:  { role: "Nutrição",       av: "NT", bg: "#ECFDF5", tc: "#065F46" },
};

export const DEFAULT_PROF_NAMES = {
  medico:         "Dr. Clínico",
  dentFernando:   "Dr. Fernando",
  dentPatrick:    "Dr. Patrick",
  psicologa:      "Dra. Kauane",
  fisio:          "Dra. Aracele",
  enfermeira:     "Enfermeira",
  tecnicoEnfermagem: "Téc. Enfermagem",
  nutricionista:  "Nutricionista",
};

const SPEC_KEYS_VALIDOS = new Set(Object.keys(DEFAULT_PROF_NAMES));

/** Modo de liberação da agenda para agentes/direção. */
export const AGENDA_MODO = {
  PADRAO: "padrao",
  DIA_UTIL_ANTERIOR: "dia_util_anterior",
  QUALQUER_DIA_UTIL: "qualquer_dia_util",
  /** Agendamento só nos dias da semana escolhidos pela recepção (antes do atendimento). */
  DIAS_AGENDAMENTO: "dias_agendamento",
  /** @deprecated — leitura legada; gravar como `dias_agendamento`. */
  COLETA_EXAMES: "coleta_exames",
};

export const AGENDA_MODO_OPCOES = [
  {
    value: AGENDA_MODO.PADRAO,
    label: "Padrão da especialidade (ex.: dia útil anterior ao atendimento)",
  },
  {
    value: AGENDA_MODO.DIA_UTIL_ANTERIOR,
    label: "Dia útil anterior ao atendimento",
  },
  {
    value: AGENDA_MODO.QUALQUER_DIA_UTIL,
    label: "Qualquer dia útil antes do atendimento",
  },
  {
    value: AGENDA_MODO.DIAS_AGENDAMENTO,
    label: "Dias específicos da semana",
  },
];

/** Normaliza modo salvo no Firestore (`coleta_exames` → `dias_agendamento`). */
export function normalizarAgendaModo(modo) {
  if (modo === AGENDA_MODO.COLETA_EXAMES) return AGENDA_MODO.DIAS_AGENDAMENTO;
  return modo;
}

export function isModoDiasAgendamento(modo) {
  const m = normalizarAgendaModo(modo);
  return m === AGENDA_MODO.DIAS_AGENDAMENTO;
}

/** Dias da semana (chaves da grade) em que agentes podem agendar, quando o modo é `dias_agendamento`. */
export function normalizeDiasAgendamentoLista(raw) {
  if (!Array.isArray(raw)) return [];
  const ordem = new Map(ORDEM_DIA_SEMANA_GRADE.map((d, i) => [d, i]));
  return [
    ...new Set(
      raw.filter((d) => typeof d === "string" && ordem.has(d.trim())).map((d) => d.trim())
    ),
  ].sort((a, b) => ordem.get(a) - ordem.get(b));
}

/** Padrão em código dos dias de agendamento pelo app (ex.: coleta: segunda e terça antes da quarta). */
export function defaultDiasAgendamentoParaSpec(specKey) {
  if (specKey === "tecnicoEnfermagem") return ["segunda", "terca"];
  return [];
}

/** Padrão em código dos dias em que o paciente pode agendar presencialmente na UBS. */
export function defaultDiasAgendamentoPresencialParaSpec(specKey) {
  if (specKey === "tecnicoEnfermagem") return ["sexta", "segunda", "terca"];
  return null;
}

/** Dias efetivos para liberar cartão `prev` no modo dias específicos (agendamento pelo app). */
export function resolveDiasAgendamento(specKey, profCfg) {
  const modo = normalizarAgendaModo(profCfg?.agendaModo ?? defaultAgendaModoParaSpec(specKey));
  if (modo !== AGENDA_MODO.DIAS_AGENDAMENTO) return null;
  const dias = normalizeDiasAgendamentoLista(profCfg?.diasAgendamento);
  if (dias.length) return dias;
  return defaultDiasAgendamentoParaSpec(specKey);
}

/** Dias em que o paciente pode agendar presencialmente (modo `dias_agendamento`). */
export function resolveDiasAgendamentoPresencial(specKey, profCfg) {
  const modo = normalizarAgendaModo(profCfg?.agendaModo ?? defaultAgendaModoParaSpec(specKey));
  if (modo !== AGENDA_MODO.DIAS_AGENDAMENTO) return null;
  const dias = normalizeDiasAgendamentoLista(profCfg?.diasAgendamentoPresencial);
  if (dias.length) return dias;
  return defaultDiasAgendamentoPresencialParaSpec(specKey);
}

export function isSpecKeyCustom(specKey) {
  return typeof specKey === "string" && specKey.startsWith("custom_");
}

export function specKeyValido(specKey) {
  const k = typeof specKey === "string" ? specKey.trim() : "";
  return SPEC_KEYS_VALIDOS.has(k) || isSpecKeyCustom(k);
}

/** Profissionais removidos da agenda pela recepção (`settings/ubs.specKeysDesativados`). */
export function normalizeSpecKeysDesativados(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((k) => typeof k === "string" && specKeyValido(k.trim()))
        .map((k) => k.trim())
    ),
  ];
}

export function specKeyEstaDesativado(specKey, specKeysDesativados) {
  if (typeof specKey !== "string" || !specKey.trim()) return false;
  const set = new Set(normalizeSpecKeysDesativados(specKeysDesativados));
  return set.has(specKey.trim());
}

/** Filtra chaves da grade (`DEFAULT_PROF_NAMES`) que ainda estão ativas na UBS. */
export function filtrarSpecKeysAtivos(keys, specKeysDesativados) {
  const off = new Set(normalizeSpecKeysDesativados(specKeysDesativados));
  return keys.filter((k) => !off.has(k));
}

/** Profissionais exibidos no painel de vagas do balcão (`settings/ubs.painelVagasSpecKeys`), no máximo 5. */
export const PAINEL_VAGAS_MAX_PROFISSIONAIS = 5;

export function normalizePainelVagasSpecKeys(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((k) => typeof k === "string" && specKeyValido(k.trim()))
        .map((k) => k.trim())
    ),
  ].slice(0, PAINEL_VAGAS_MAX_PROFISSIONAIS);
}

/**
 * Nome exibido no painel de vagas do balcão. A maioria mostra o nome do profissional; o
 * técnico de enfermagem faz "coleta de exames" — mais útil ao paciente ver o serviço do que
 * o nome de quem está de plantão.
 */
const PAINEL_VAGAS_NOME_OVERRIDE = {
  tecnicoEnfermagem: "Coleta de exames",
};

export function painelVagasNomeExibicao(specKey, nomeProfissional) {
  return PAINEL_VAGAS_NOME_OVERRIDE[specKey] || nomeProfissional;
}

/** Soma as vagas livres de um segmento (todas as sessões/turnos), sem contar encaixe. */
function livreAgregadoDoSegmento(seg) {
  return (seg?.sessions || []).reduce((acc, sess) => {
    const total = sess?.total ?? 0;
    const encaixe = sess?.encaixeExtra ?? 0;
    const used = sess?.used ?? 0;
    const reserved = sess?.reserved ?? 0;
    const totalSemEncaixe = Math.max(0, total - encaixe);
    return acc + Math.max(0, totalSemEncaixe - used - reserved);
  }, 0);
}

/**
 * Próximo atendimento do `specKey`, a partir do `specsVisiveis` já calculado por
 * `buildVisibleSegments` — considera TODOS os dias da semana em que ele atende (não só
 * "amanhã"), pegando a `atendimentoDate` mais próxima **depois de hoje** (vagas de hoje não
 * entram, mesmo que a agenda abra no mesmo dia). Cobre tanto o caso comum (sexta-feira abrir
 * agenda pra segunda) quanto agendas com antecedência maior (ex.: coleta de exames é na
 * quarta, mas a agenda já abre na sexta anterior — mostra "quarta-feira" já na sexta).
 *
 * Exceção: nutrição e psicologia atendem uma vez por semana, mas o agendamento continua
 * aberto no próprio dia até as 14h (`specAgendaVesperaOuMesmoDiaAte14`). Nesse caso, "hoje"
 * só é excluído depois que essa janela se fecha — antes disso, mostrar hoje é o correto (é o
 * único dia com atendimento, e ainda dá pra agendar).
 *
 * Retorna `null` se não houver nenhum atendimento futuro visível pra esse specKey.
 */
export function proximoAtendimentoParaSpec(specsVisiveis, specKey) {
  const agora = new Date();
  const hojeStr = toDateStr(agora);
  const hojeAindaValido =
    specAgendaVesperaOuMesmoDiaAte14(specKey) && estaDentroJanelaAgendamentoMesmoDia(agora, specKey);
  const segs = (Array.isArray(specsVisiveis) ? specsVisiveis : [])
    .filter((s) => s?.key === specKey && s?.atendimentoDate)
    .filter((s) => (s.atendimentoDate === hojeStr ? hojeAindaValido : s.atendimentoDate > hojeStr))
    .sort((a, b) => a.atendimentoDate.localeCompare(b.atendimentoDate));
  const seg = segs[0];
  if (!seg) return null;
  return { atendimentoDate: seg.atendimentoDate, livre: livreAgregadoDoSegmento(seg) };
}

/** Tipos de sessão do médico (UI / filtros / configuração na recepção) */
export const MEDICO_TIPO = {
  receitas:  { label: "Troca de receitas", short: "Receitas",  color: "#7C3AED", bg: "#EDE9FE" },
  clinico:   { label: "Clínico geral",     short: "Clínico",   color: "#4338CA", bg: "#E0E7FF" },
  gestantes: { label: "Gestantes",         short: "Gestantes", color: "#BE185D", bg: "#FCE7F3" },
  visitas_domiciliares: {
    label: "Visitas domiciliares",
    short: "Visitas dom.",
    color: "#0F766E",
    bg: "#CCFBF1",
  },
};

const MEDICO_TIPOS_VALIDOS = new Set(Object.keys(MEDICO_TIPO));

/** Uma linha da agenda do médico configurada pela recepção. */
export function normalizeMedicoSessoesConfig(raw) {
  if (!Array.isArray(raw)) return [];
  const diasSet = new Set(ORDEM_DIA_SEMANA_GRADE);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const medicoTipo = typeof item.medicoTipo === "string" ? item.medicoTipo.trim() : "";
    const dia = typeof item.dia === "string" ? item.dia.trim() : "";
    const turno = item.turno === "manha" || item.turno === "tarde" ? item.turno : "";
    const vagas = Number(item.vagas);
    if (!MEDICO_TIPOS_VALIDOS.has(medicoTipo) || !diasSet.has(dia) || !turno) continue;
    if (!Number.isFinite(vagas) || vagas < 0 || vagas > 99) continue;
    const uk = `${medicoTipo}|${dia}|${turno}`;
    if (seen.has(uk)) continue;
    seen.add(uk);
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim().slice(0, 80)
        : `ms_${medicoTipo}_${dia}_${turno}`;
    out.push({
      id,
      medicoTipo,
      dia,
      turno,
      vagas: Math.round(vagas),
    });
  }
  const ordemDia = new Map(ORDEM_DIA_SEMANA_GRADE.map((d, i) => [d, i]));
  out.sort(
    (a, b) =>
      ordemDia.get(a.dia) - ordemDia.get(b.dia) ||
      (a.turno === "manha" ? 0 : 1) - (b.turno === "manha" ? 0 : 1) ||
      a.medicoTipo.localeCompare(b.medicoTipo)
  );
  return out;
}

/** Grade padrão do médico extraída de `BASE_SCHEDULE` (antes de salvar configuração customizada). */
export function defaultMedicoSessoesFromBaseSchedule() {
  const out = [];
  let n = 0;
  for (const [dia, dayData] of Object.entries(BASE_SCHEDULE)) {
    const spec = dayData.specs?.find((s) => s.key === "medico");
    if (!spec?.sessions?.length) continue;
    for (const sess of spec.sessions) {
      const turno = sessaoLabelParaTurno(sess.label) || "tarde";
      const medicoTipo = sess.medicoTipo || "clinico";
      out.push({
        id: `def_${n++}`,
        medicoTipo,
        dia,
        turno,
        vagas: sess.visitaDomiciliarSemUnidade ? 0 : sess.total ?? 0,
      });
    }
  }
  return out;
}

export function medicoTemSessoesConfiguradasNoFirestore(profCfgMedico) {
  const arr = profCfgMedico?.sessoes;
  return Array.isArray(arr) && arr.length > 0;
}

/** Sessões do médico: Firestore ou padrão em código. */
export function medicoSessoesEfetivas(profCfgMedico) {
  if (medicoTemSessoesConfiguradasNoFirestore(profCfgMedico)) {
    return normalizeMedicoSessoesConfig(profCfgMedico.sessoes);
  }
  return defaultMedicoSessoesFromBaseSchedule();
}

export function medicoLabelSessao(turno, medicoTipo) {
  const prefix = turno === "manha" ? "Manhã" : "Tarde";
  if (medicoTipo === "visitas_domiciliares") return `${prefix} – Visitas domiciliares`;
  const tipo = MEDICO_TIPO[medicoTipo]?.label || medicoTipo;
  return `${prefix} – ${tipo}`;
}

/** Converte linha de config em sessão da agenda (rótulo, vagas, flags). */
export function medicoConfigParaSessaoAgenda(linha) {
  const vagas = Math.max(0, Number(linha.vagas) || 0);
  if (linha.medicoTipo === "visitas_domiciliares" && vagas === 0) {
    return {
      label: `${linha.turno === "manha" ? "Manhã" : "Tarde"} – Visitas domiciliares (fora da unidade)`,
      total: 0,
      medicoTipo: "visitas_domiciliares",
      visitaDomiciliarSemUnidade: true,
    };
  }
  return {
    label: medicoLabelSessao(linha.turno, linha.medicoTipo),
    total: vagas,
    medicoTipo: linha.medicoTipo,
  };
}

/** Spec do médico para um dia da grade, a partir da configuração salva. */
export function buildMedicoSpecForDay(atendimentoDia, profCfgMap = {}) {
  const linhas = medicoSessoesEfetivas(profCfgMap.medico).filter((s) => s.dia === atendimentoDia);
  if (!linhas.length) return null;
  const tmpl = findSpecTemplateInBaseSchedule("medico") || { key: "medico" };
  return {
    ...tmpl,
    key: "medico",
    sessions: linhas.map(medicoConfigParaSessaoAgenda),
  };
}

/** Dias com atendimento do médico (config ou grade em código). */
export function diasAtendimentoMedicoEfetivos(profCfgMap = {}) {
  if (medicoTemSessoesConfiguradasNoFirestore(profCfgMap.medico)) {
    return [
      ...new Set(medicoSessoesEfetivas(profCfgMap.medico).map((s) => s.dia)),
    ].sort(
      (a, b) =>
        ORDEM_DIA_SEMANA_GRADE.indexOf(a) - ORDEM_DIA_SEMANA_GRADE.indexOf(b)
    );
  }
  return diasAtendimentoDefaultParaSpec("medico");
}

/** Mapa dia → turnos para `atendimentoDiasTurnos` a partir das sessões do médico. */
export function gradeMapFromMedicoSessoes(sessoes) {
  const out = {};
  for (const s of normalizeMedicoSessoesConfig(sessoes)) {
    if (!out[s.dia]) out[s.dia] = [];
    if (!out[s.dia].includes(s.turno)) out[s.dia].push(s.turno);
    out[s.dia].sort();
  }
  return out;
}

/** Tipos de atendimento da enfermeira (UI / configuração na recepção). */
export const ENFERMEIRA_ATENDIMENTO_TIPO = {
  pccu: { label: "PCCU (exame)", short: "PCCU", color: "#B45309", bg: "#FEF3C7" },
  enfermagem: { label: "Enfermagem", short: "Enfermagem", color: "#27500A", bg: "#EAF3DE" },
};

const ENFERMEIRA_TIPOS_VALIDOS = new Set(Object.keys(ENFERMEIRA_ATENDIMENTO_TIPO));

function sessaoBaseEhPccuEnfermeira(sess) {
  return sess?.pccuOnly === true || /\bPCCU\b/i.test(String(sess?.label || ""));
}

export function normalizeEnfermeiraSessoesConfig(raw) {
  if (!Array.isArray(raw)) return [];
  const diasSet = new Set(ORDEM_DIA_SEMANA_GRADE);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const enfermeiraTipo =
      typeof item.enfermeiraTipo === "string" ? item.enfermeiraTipo.trim() : "";
    const dia = typeof item.dia === "string" ? item.dia.trim() : "";
    const turno = item.turno === "manha" || item.turno === "tarde" ? item.turno : "";
    const vagas = Number(item.vagas);
    if (!ENFERMEIRA_TIPOS_VALIDOS.has(enfermeiraTipo) || !diasSet.has(dia) || !turno) continue;
    if (!Number.isFinite(vagas) || vagas < 0 || vagas > 99) continue;
    const uk = `${enfermeiraTipo}|${dia}|${turno}`;
    if (seen.has(uk)) continue;
    seen.add(uk);
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim().slice(0, 80)
        : `es_${enfermeiraTipo}_${dia}_${turno}`;
    out.push({
      id,
      enfermeiraTipo,
      dia,
      turno,
      vagas: Math.round(vagas),
    });
  }
  const ordemDia = new Map(ORDEM_DIA_SEMANA_GRADE.map((d, i) => [d, i]));
  out.sort(
    (a, b) =>
      ordemDia.get(a.dia) - ordemDia.get(b.dia) ||
      (a.turno === "manha" ? 0 : 1) - (b.turno === "manha" ? 0 : 1) ||
      a.enfermeiraTipo.localeCompare(b.enfermeiraTipo)
  );
  return out;
}

export function defaultEnfermeiraSessoesFromBaseSchedule(pccuTotal = DEFAULT_PCCU_TOTAL) {
  const out = [];
  let n = 0;
  for (const [dia, dayData] of Object.entries(BASE_SCHEDULE)) {
    const spec = dayData.specs?.find((s) => s.key === "enfermeira");
    if (!spec?.sessions?.length) continue;
    for (const sess of spec.sessions) {
      const turno = sessaoLabelParaTurno(sess.label) || "tarde";
      const ehPccu = sessaoBaseEhPccuEnfermeira(sess);
      out.push({
        id: `def_${n++}`,
        enfermeiraTipo: ehPccu ? "pccu" : "enfermagem",
        dia,
        turno,
        vagas: ehPccu ? pccuTotal ?? sess.total ?? DEFAULT_PCCU_TOTAL : sess.total ?? 15,
      });
    }
  }
  return out;
}

export function enfermeiraTemSessoesConfiguradasNoFirestore(profCfgEnfermeira) {
  const arr = profCfgEnfermeira?.sessoes;
  return Array.isArray(arr) && arr.length > 0;
}

export function enfermeiraSessoesEfetivas(profCfgEnfermeira, pccuTotal = DEFAULT_PCCU_TOTAL) {
  if (enfermeiraTemSessoesConfiguradasNoFirestore(profCfgEnfermeira)) {
    return normalizeEnfermeiraSessoesConfig(profCfgEnfermeira.sessoes);
  }
  return defaultEnfermeiraSessoesFromBaseSchedule(pccuTotal);
}

export function enfermeiraLabelSessao(turno, enfermeiraTipo) {
  const prefix = turno === "manha" ? "Manhã" : "Tarde";
  if (enfermeiraTipo === "pccu") {
    return `${prefix} – Enfermagem (prioridade exame PCCU)`;
  }
  return `${prefix} – Enfermagem`;
}

export function enfermeiraConfigParaSessaoAgenda(linha) {
  const vagas = Math.max(0, Number(linha.vagas) || 0);
  const sess = {
    label: enfermeiraLabelSessao(linha.turno, linha.enfermeiraTipo),
    total: vagas,
  };
  if (linha.enfermeiraTipo === "pccu") {
    sess.pccuOnly = true;
  }
  return sess;
}

export function buildEnfermeiraSpecForDay(atendimentoDia, profCfgMap = {}, pccuTotal = DEFAULT_PCCU_TOTAL) {
  const linhas = enfermeiraSessoesEfetivas(profCfgMap.enfermeira, pccuTotal).filter(
    (s) => s.dia === atendimentoDia
  );
  if (!linhas.length) return null;
  const tmpl = findSpecTemplateInBaseSchedule("enfermeira") || { key: "enfermeira" };
  return {
    ...tmpl,
    key: "enfermeira",
    sessions: linhas.map(enfermeiraConfigParaSessaoAgenda),
  };
}

export function diasAtendimentoEnfermeiraEfetivos(profCfgMap = {}, pccuTotal = DEFAULT_PCCU_TOTAL) {
  if (enfermeiraTemSessoesConfiguradasNoFirestore(profCfgMap.enfermeira)) {
    return [
      ...new Set(enfermeiraSessoesEfetivas(profCfgMap.enfermeira, pccuTotal).map((s) => s.dia)),
    ].sort(
      (a, b) =>
        ORDEM_DIA_SEMANA_GRADE.indexOf(a) - ORDEM_DIA_SEMANA_GRADE.indexOf(b)
    );
  }
  return diasAtendimentoDefaultParaSpec("enfermeira");
}

export function gradeMapFromEnfermeiraSessoes(sessoes) {
  const out = {};
  for (const s of normalizeEnfermeiraSessoesConfig(sessoes)) {
    if (!out[s.dia]) out[s.dia] = [];
    if (!out[s.dia].includes(s.turno)) out[s.dia].push(s.turno);
    out[s.dia].sort();
  }
  return out;
}

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

/** Ordem segunda → sexta (grade da UBS). */
export const ORDEM_DIA_SEMANA_GRADE = ["segunda", "terca", "quarta", "quinta", "sexta"];

// Configuração base de cada dia de atendimento (reforma: expediente na unidade 13h–18h = sessões "Tarde";
// exceção: coleta de exames às quartas, 7h — rótulo "Manhã – Coleta de exames".)
export const BASE_SCHEDULE = {
  segunda: {
    specs: [
      {
        key: "medico",
        sessions: [
          { label: "Tarde – Troca de receitas", total: 10, medicoTipo: "receitas" },
          { label: "Tarde – Clínico geral", total: 5, medicoTipo: "clinico" },
        ],
      },
      {
        key: "dentFernando",
        sessions: [{ label: "Tarde – Odontologia", total: 10 }],
      },
    ],
  },
  terca: {
    specs: [
      {
        key: "medico",
        sessions: [
          { label: "Tarde – Clínico geral", total: 9, medicoTipo: "clinico" },
          { label: "Tarde – Gestantes", total: 6, medicoTipo: "gestantes" },
        ],
      },
      {
        key: "dentFernando",
        sessions: [{ label: "Tarde – Odontologia", total: 10 }],
      },
      {
        key: "enfermeira",
        sessions: [{ label: "Tarde – Enfermagem", total: 15 }],
      },
    ],
  },
  quarta: {
    specs: [
      {
        key: "dentFernando",
        sessions: [{ label: "Tarde – Odontologia", total: 10 }],
      },
      {
        key: "enfermeira",
        sessions: [
          {
            label: "Tarde – Enfermagem (prioridade exame PCCU)",
            total: 15,
          },
        ],
      },
      {
        key: "tecnicoEnfermagem",
        /** Coleta de exames de rotina: toda quarta às 7h; agendamento em janela especial (sexta/segunda/terça). */
        sessions: [{ label: "Manhã – Coleta de exames", total: 15, coletaExamesRotina: true }],
      },
    ],
  },
  quinta: {
    specs: [
      {
        key: "medico",
        sessions: [{ label: "Tarde – Clínico geral", total: 15, medicoTipo: "clinico" }],
      },
      {
        key: "dentPatrick",
        sessions: [{ label: "Tarde – Odontologia", total: 10 }],
      },
      {
        key: "fisio",
        /** Solicitação via WhatsApp exige encaminhamento (foto) e dados completos — ver ModalAgendar. */
        solicitacaoEncaminhamentoObrigatorio: true,
        /** Agendamento liberado em qualquer dia útil (atendimento quintas e sextas). */
        agendaQualquerDiaUtil: true,
        sessions: [{ label: "Tarde", total: 6, waitlistEnabled: true }],
      },
      {
        key: "enfermeira",
        sessions: [{ label: "Tarde – Enfermagem", total: 15 }],
      },
    ],
  },
  sexta: {
    specs: [
      {
        key: "dentPatrick",
        sessions: [
          { label: "Tarde – Odontologia", total: 10 },
          /** Tarde: sem consultas na UBS — visitas domiciliares (aviso no card; 0 vagas). */
          {
            label: "Tarde – Visitas domiciliares (fora da unidade)",
            total: 0,
            visitaDomiciliarSemUnidade: true,
          },
        ],
      },
      {
        key: "fisio",
        solicitacaoEncaminhamentoObrigatorio: true,
        agendaQualquerDiaUtil: true,
        sessions: [{ label: "Tarde", total: 6, waitlistEnabled: true }],
      },
      {
        key: "enfermeira",
        sessions: [{ label: "Tarde – Enfermagem", total: 15 }],
      },
      {
        key: "nutricionista",
        /** Atendimento às sextas; cartão visível todos os dias; agendamento na véspera ou no dia (7h–14h). */
        sessions: [{ label: "Tarde – Nutrição", total: 8 }],
      },
      {
        key: "psicologa",
        /** Atendimento às sextas; cartão visível todos os dias; agendamento na véspera ou no dia (7h–14h). */
        sessions: [{ label: "Tarde – Psicologia", total: 8, waitlistEnabled: true }],
      },
    ],
  },
};

export const DEFAULT_PCCU_TOTAL = 15;

/** Dias da semana (chave da grade) em que `specKey` aparece em `BASE_SCHEDULE`. */
export function diasAtendimentoDefaultParaSpec(specKey) {
  const out = [];
  for (const [dia, dayData] of Object.entries(BASE_SCHEDULE)) {
    if (dayData.specs?.some((s) => s.key === specKey)) out.push(dia);
  }
  return out;
}

const SPEC_KEYS_CARTAO_PREV_SOMENTE_VESPERA = new Set([
  "medico",
  "dentFernando",
  "dentPatrick",
]);

/** Nutrição e psicologia: cartão visível todos os dias; agendamento na véspera (13h30–18h) ou no dia (7h–14h). */
const SPEC_KEYS_AGENDA_VESPERA_OU_MESMO_DIA_ATE_14 = new Set(["psicologa", "nutricionista"]);

export function specAgendaVesperaOuMesmoDiaAte14(specKey) {
  return SPEC_KEYS_AGENDA_VESPERA_OU_MESMO_DIA_ATE_14.has(specKey);
}

/**
 * Cartão `prev` só no dia útil anterior ao atendimento (médico, dentistas, enfermagem).
 * Demais especialidades (ex.: nutrição, psicologia, fisioterapia) permanecem visíveis antes.
 */
export function cartaoPrevApenasDiaUtilAnterior(spec, profissionalConfigPorSpec = {}) {
  if (!spec?.key) return true;
  if (specAgendaVesperaOuMesmoDiaAte14(spec.key)) return false;
  if (spec.agendaQualquerDiaUtil === true) return false;
  const rawModo = profissionalConfigPorSpec[spec.key]?.agendaModo;
  const modo = normalizarAgendaModo(rawModo ?? defaultAgendaModoParaSpec(spec.key));
  if (modo === AGENDA_MODO.QUALQUER_DIA_UTIL) return false;
  if (modo === AGENDA_MODO.DIAS_AGENDAMENTO) return false;
  if (SPEC_KEYS_CARTAO_PREV_SOMENTE_VESPERA.has(spec.key)) return true;
  if (isSpecKeyCustom(spec.key)) {
    return modo !== AGENDA_MODO.QUALQUER_DIA_UTIL && modo !== AGENDA_MODO.DIAS_AGENDAMENTO;
  }
  return false;
}

/** Se o cartão de agendamento antecipado (`prev`) deve aparecer na lista. */
export function deveExibirCartaoPrev({
  spec,
  todayStr,
  atendimentoDateStr,
  prevStr,
  profissionalConfigPorSpec = {},
}) {
  if (!todayStr || !atendimentoDateStr || todayStr >= atendimentoDateStr) return false;
  if (cartaoPrevApenasDiaUtilAnterior(spec, profissionalConfigPorSpec)) {
    return prevStr === todayStr;
  }
  return todayStr < atendimentoDateStr;
}

/** Turnos (`manha` / `tarde`) que existem na grade base para `specKey` naquele dia. */
export function turnosDefaultParaSpecNoDia(specKey, dia) {
  const spec = BASE_SCHEDULE[dia]?.specs?.find((s) => s.key === specKey);
  if (!spec?.sessions?.length) return [];
  const t = new Set();
  for (const sess of spec.sessions) {
    const x = sessaoLabelParaTurno(sess.label);
    if (x) t.add(x);
  }
  return [...t];
}

/**
 * Mapa padrão dia → turnos conforme `BASE_SCHEDULE` (cadastro inicial / restaurar grade).
 * @returns {Record<string, ("manha"|"tarde")[]>}
 */
export function defaultAtendimentoDiasTurnosParaSpec(specKey) {
  const out = {};
  for (const dia of diasAtendimentoDefaultParaSpec(specKey)) {
    const turnos = turnosDefaultParaSpecNoDia(specKey, dia);
    if (turnos.length) out[dia] = [...turnos].sort();
  }
  return out;
}

/**
 * Sanitiza `atendimentoDiasTurnos` do Firestore: segunda a sexta e turnos `manha` / `tarde`.
 * Não restringe à grade atual em código — a recepção pode cadastrar dias/turnos futuros para quando a agenda mudar.
 * @returns {Record<string, ("manha"|"tarde")[]> | null} `null` se não houver nada válido
 */
export function normalizeAtendimentoDiasTurnosParaSpec(_specKey, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    const arr = raw[dia];
    if (!Array.isArray(arr) || !arr.length) continue;
    const turnos = [...new Set(arr.filter((t) => t === "manha" || t === "tarde"))];
    if (turnos.length) out[dia] = turnos.sort();
  }
  return Object.keys(out).length ? out : null;
}

function cloneSpecConfigFromGrade(spec) {
  return {
    ...spec,
    sessions: (spec.sessions || []).map((s) => ({ ...s })),
  };
}

/** Primeira definição do `specKey` na grade em código (dias extras configurados na recepção). */
export function findSpecTemplateInBaseSchedule(specKey) {
  for (const dk of Object.keys(BASE_SCHEDULE)) {
    const s = BASE_SCHEDULE[dk]?.specs?.find((x) => x.key === specKey);
    if (s) return cloneSpecConfigFromGrade(s);
  }
  return null;
}

/** Configuração por `specKey` em `settings/ubs.profissionalConfigPorSpec`. */
export function normalizeProfissionalConfigPorSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const modosValidos = new Set(Object.values(AGENDA_MODO));
  const out = {};
  for (const [sk, v] of Object.entries(raw)) {
    if (!specKeyValido(sk)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const entry = {};
    if (typeof v.agendaModo === "string") {
      const modo = normalizarAgendaModo(v.agendaModo);
      if (modosValidos.has(modo) || modosValidos.has(v.agendaModo)) {
        entry.agendaModo = modo;
      }
    }
    const diasAg = normalizeDiasAgendamentoLista(v.diasAgendamento);
    if (diasAg.length) entry.diasAgendamento = diasAg;
    const diasPres = normalizeDiasAgendamentoLista(v.diasAgendamentoPresencial);
    if (diasPres.length) entry.diasAgendamentoPresencial = diasPres;
    if (typeof v.role === "string" && v.role.trim()) entry.role = v.role.trim().slice(0, 80);
    const vb = Number(v.vagasBase);
    if (Number.isFinite(vb) && vb >= 0 && vb <= 99) entry.vagasBase = Math.round(vb);
    if (Array.isArray(v.vagasPorSessao)) {
      const arr = v.vagasPorSessao
        .map((n) => {
          const x = Number(n);
          return Number.isFinite(x) && x >= 0 && x <= 99 ? Math.round(x) : null;
        })
        .filter((n) => n != null);
      if (arr.length) entry.vagasPorSessao = arr;
    }
    if (v.vagasPorTipo && typeof v.vagasPorTipo === "object" && !Array.isArray(v.vagasPorTipo)) {
      const porTipo = {};
      for (const [tk, n] of Object.entries(v.vagasPorTipo)) {
        const x = Number(n);
        if (Number.isFinite(x) && x >= 0 && x <= 99) porTipo[String(tk)] = Math.round(x);
      }
      if (Object.keys(porTipo).length) entry.vagasPorTipo = porTipo;
    }
    if ((sk === "medico" || sk === "enfermeira") && Array.isArray(v.sessoes)) {
      const sessoes =
        sk === "medico"
          ? normalizeMedicoSessoesConfig(v.sessoes)
          : normalizeEnfermeiraSessoesConfig(v.sessoes);
      if (sessoes.length) entry.sessoes = sessoes;
    }
    if (Object.keys(entry).length) out[sk] = entry;
  }
  return out;
}

/** Modo de agenda padrão conforme a grade em código (sem override no Firestore). */
export function defaultAgendaModoParaSpec(specKey) {
  if (specKey === "enfermeira") return AGENDA_MODO.QUALQUER_DIA_UTIL;
  const tmpl = findSpecTemplateInBaseSchedule(specKey);
  if (!tmpl) return AGENDA_MODO.DIA_UTIL_ANTERIOR;
  if (tmpl.agendaQualquerDiaUtil) return AGENDA_MODO.QUALQUER_DIA_UTIL;
  if ((tmpl.sessions || []).some((s) => s.coletaExamesRotina)) return AGENDA_MODO.DIAS_AGENDAMENTO;
  return AGENDA_MODO.PADRAO;
}

/** Tipos de sessão distintos na grade (para editar vagas na Config). */
export function getSessionDefsForSpecKey(specKey) {
  const seen = new Map();
  for (const dayData of Object.values(BASE_SCHEDULE)) {
    const spec = dayData.specs?.find((s) => s.key === specKey);
    if (!spec?.sessions?.length) continue;
    for (const sess of spec.sessions) {
      if (sess.visitaDomiciliarSemUnidade) continue;
      const id = sess.medicoTipo || sess.label || "sessao";
      if (seen.has(id)) continue;
      const base = sess.pccuOnly ? DEFAULT_PCCU_TOTAL : sess.total;
      seen.set(id, {
        id,
        label: sess.label || id,
        defaultTotal: base ?? 0,
        medicoTipo: sess.medicoTipo || null,
      });
    }
  }
  return [...seen.values()];
}

function iniciaisDeTexto(texto) {
  const w = String(texto || "PR")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (w[0]?.slice(0, 2) || "PR").toUpperCase();
}

/**
 * Meta visual do card (grade fixa ou profissional customizado). As iniciais do avatar (`av`)
 * sempre vêm do NOME cadastrado do profissional (`nome`), nunca da função/especialidade — um
 * "Dr. Clínico" renomeado para "Dr. Saulo" em Config. deve virar "DS" no avatar, em vez de ficar
 * com uma inicial fixa da especialidade. Sem `nome` informado, cai para a inicial da função.
 */
export function getSpecMetaForKey(specKey, { profissionalConfigPorSpec = {}, roleFallback = "", nome = "" } = {}) {
  const base = SPEC_META[specKey];
  const cfg = profissionalConfigPorSpec[specKey];
  const role = base?.role || cfg?.role || roleFallback || "Profissional";
  const av = iniciaisDeTexto(nome || role);
  if (base) return { ...base, av };
  return {
    role,
    av,
    bg: "#F1F5F9",
    tc: "#334155",
  };
}

function enrichSpecAgendaFromConfig(spec, profissionalConfigPorSpec = {}) {
  const cfg = profissionalConfigPorSpec[spec.key];
  const modo = cfg?.agendaModo;
  let out = spec;
  if (modo && modo !== AGENDA_MODO.PADRAO) {
    const sessions = (spec.sessions || []).map((s) => ({ ...s }));
    if (modo === AGENDA_MODO.QUALQUER_DIA_UTIL) {
      out = { ...spec, sessions, agendaQualquerDiaUtil: true };
    } else if (modo === AGENDA_MODO.DIA_UTIL_ANTERIOR) {
      out = { ...spec, sessions, agendaQualquerDiaUtil: false };
    } else if (isModoDiasAgendamento(modo)) {
      out = { ...spec, sessions, agendaQualquerDiaUtil: false };
    }
  }
  if (specAgendaVesperaOuMesmoDiaAte14(spec.key)) {
    const { agendaQualquerDiaUtil, ...rest } = out;
    out = rest;
  }
  return out;
}

/** Chave em `vagasPorTipo` — alinhada a `getSessionDefsForSpecKey` e `montarPatchProfissionalConfig`. */
export function chaveVagasPorTipoParaSessao(sess) {
  return sess?.medicoTipo || sess?.label || "sessao";
}

function vagasPorTipoParaSessao(porTipo, sess) {
  if (!porTipo || typeof porTipo !== "object") return null;
  const chave = chaveVagasPorTipoParaSessao(sess);
  let raw = porTipo[chave];
  if (raw == null && sess?.medicoTipo) raw = porTipo[sess.medicoTipo];
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function applyVagasOverrideToSessions(sessions, specKey, profissionalConfigPorSpec = {}) {
  if (
    (specKey === "medico" && medicoTemSessoesConfiguradasNoFirestore(profissionalConfigPorSpec.medico)) ||
    (specKey === "enfermeira" &&
      enfermeiraTemSessoesConfiguradasNoFirestore(profissionalConfigPorSpec.enfermeira))
  ) {
    return sessions;
  }
  const cfg = profissionalConfigPorSpec[specKey];
  if (!cfg) return sessions;
  const porTipo = cfg.vagasPorTipo;
  const porIdx = cfg.vagasPorSessao;
  return sessions.map((sess, idx) => {
    if (sess.visitaDomiciliarSemUnidade) return sess;
    let base = null;
    const doTipo = vagasPorTipoParaSessao(porTipo, sess);
    if (doTipo != null) {
      base = doTipo;
    } else if (Array.isArray(porIdx) && porIdx[idx] != null) {
      base = Number(porIdx[idx]);
    } else if (cfg.vagasBase != null && (sessions.length === 1 || idx === 0)) {
      base = Number(cfg.vagasBase);
    }
    if (!Number.isFinite(base) || base < 0) return sess;
    return { ...sess, total: base };
  });
}

/** Monta spec sintético para profissional customizado em um dia da grade. */
export function buildCustomSpecForDay(specKey, atendimentoDia, profCfg, mapaTurnos) {
  const turnos = mapaTurnos?.[atendimentoDia];
  if (!Array.isArray(turnos) || !turnos.length) return null;
  const role = profCfg?.role || "Profissional";
  const vagas = Number(profCfg?.vagasBase);
  const vagasBase = Number.isFinite(vagas) && vagas >= 0 ? Math.round(vagas) : 8;
  const sessions = [];
  for (const t of turnos) {
    const prefix = t === "manha" ? "Manhã" : "Tarde";
    const sess = { label: `${prefix} – ${role}`, total: vagasBase };
    sessions.push(sess);
  }
  let spec = { key: specKey, sessions };
  if (profCfg?.agendaModo === AGENDA_MODO.QUALQUER_DIA_UTIL) {
    spec = { ...spec, agendaQualquerDiaUtil: true };
  }
  return enrichSpecAgendaFromConfig(spec, { [specKey]: profCfg });
}

/** `specKey` de profissionais criados pela recepção (não estão em `DEFAULT_PROF_NAMES`). */
export function listaSpecKeysCustom(profissionaisMap = {}, profissionalConfigPorSpec = {}) {
  const keys = new Set();
  for (const p of Object.values(profissionaisMap || {})) {
    const sk = p.specKey || (p.custom ? p.id : null);
    if (sk && isSpecKeyCustom(sk)) keys.add(sk);
  }
  for (const sk of Object.keys(profissionalConfigPorSpec || {})) {
    if (isSpecKeyCustom(sk)) keys.add(sk);
  }
  return [...keys].sort();
}

/** Dias em que o profissional entra na agenda (`settings` ou grade em código). */
export function diasAtendimentoEfetivosParaSpec(specKey, atendimentoDiasAtivosPorSpec = {}) {
  const raw = atendimentoDiasAtivosPorSpec?.[specKey];
  if (Array.isArray(raw) && raw.length > 0) {
    return [...new Set(raw.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)))];
  }
  return diasAtendimentoDefaultParaSpec(specKey);
}

/**
 * Dias efetivos de atendimento de QUALQUER `specKey` (fixo ou `custom_*`), consolidando as
 * mesmas regras usadas em `buildVisibleSegments` (médico e enfermeira por sessões configuradas,
 * demais por `atendimentoDiasAtivosPorSpec` ou, para customizados, por `atendimentoDiasTurnosPorSpec`).
 * Usado fora do cálculo de cartões (ex.: cartões-placeholder "agenda abre na véspera") para não
 * duplicar essa lógica.
 */
export function diasAtendimentoEfetivosCompletoParaSpec(specKey, opts = {}) {
  const {
    atendimentoDiasAtivosPorSpec = {},
    atendimentoDiasTurnosPorSpec = {},
    profissionalConfigPorSpec = {},
    pccuTotal = DEFAULT_PCCU_TOTAL,
  } = opts;
  const profCfgMap = normalizeProfissionalConfigPorSpec(profissionalConfigPorSpec);
  const diasCfgRaw = atendimentoDiasAtivosPorSpec?.[specKey];
  if (Array.isArray(diasCfgRaw) && diasCfgRaw.length > 0) {
    return [...new Set(diasCfgRaw.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)))];
  }
  if (specKey === "medico") return diasAtendimentoMedicoEfetivos(profCfgMap);
  if (specKey === "enfermeira") return diasAtendimentoEnfermeiraEfetivos(profCfgMap, pccuTotal);
  if (isSpecKeyCustom(specKey)) {
    return Object.keys(
      normalizeAtendimentoDiasTurnosParaSpec(specKey, atendimentoDiasTurnosPorSpec?.[specKey]) || {}
    );
  }
  return diasAtendimentoDefaultParaSpec(specKey);
}

/**
 * O cartão desse `specKey` só abre na véspera (dia útil anterior) — nunca fica visível com
 * antecedência maior. Usado para decidir quem precisa de cartão-placeholder "agenda abre na
 * véspera" nos demais dias em que atende.
 */
export function especialidadeUsaPlaceholderVespera(specKey, profissionalConfigPorSpec = {}) {
  const tmpl = findSpecTemplateInBaseSchedule(specKey) || { key: specKey };
  return cartaoPrevApenasDiaUtilAnterior(
    tmpl,
    normalizeProfissionalConfigPorSpec(profissionalConfigPorSpec)
  );
}

/** Grade do dia + profissionais com dia extra em `atendimentoDiasAtivosPorSpec`. */
export function listaSpecConfigsParaDiaAtendimento(
  atendimentoDia,
  atendimentoDiasAtivosPorSpec = {},
  specKeysDesativados = []
) {
  const seen = new Set();
  const out = [];
  for (const spec of BASE_SCHEDULE[atendimentoDia]?.specs || []) {
    if (specKeyEstaDesativado(spec.key, specKeysDesativados)) continue;
    seen.add(spec.key);
    out.push(spec);
  }
  for (const specKey of Object.keys(atendimentoDiasAtivosPorSpec || {})) {
    if (specKeyEstaDesativado(specKey, specKeysDesativados)) continue;
    const dias = atendimentoDiasAtivosPorSpec[specKey];
    if (!Array.isArray(dias) || !dias.includes(atendimentoDia)) continue;
    if (seen.has(specKey)) continue;
    const tmpl = findSpecTemplateInBaseSchedule(specKey);
    if (tmpl) {
      seen.add(specKey);
      out.push(tmpl);
    }
  }
  return out;
}

/**
 * `atendimentoDateStr` está sem agendamento por suspensão cadastrada na recepção.
 * `map[specKey]`: `{ desde, indefinido?, ate? }` — `desde` inclusivo; com `ate` (não indefinido), último dia suspenso = `ate` inclusivo.
 */
export function atendimentoSuspensoNaData(specKey, atendimentoDateStr, map) {
  const e = map?.[specKey];
  if (!e || typeof e.desde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.desde.trim())) return false;
  const desde = e.desde.trim();
  if (atendimentoDateStr < desde) return false;
  if (e.indefinido === true) return true;
  const ateRaw = typeof e.ate === "string" ? e.ate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ateRaw)) return true;
  return atendimentoDateStr <= ateRaw;
}

/** Chave em `atendimentoSuspensoSlots`: `specKey_YYYY-MM-DD_dia|manha|tarde`. */
const RE_SLOT_SUSPENSAO = /^(.+)_(\d{4}-\d{2}-\d{2})_(dia|manha|tarde)$/;

export function parseAtendimentoSuspensoSlotKey(key) {
  if (typeof key !== "string") return null;
  const m = key.trim().match(RE_SLOT_SUSPENSAO);
  if (!m) return null;
  return { specKey: m[1], data: m[2], escopo: m[3] };
}

/**
 * Sessão (rótulo manhã/tarde) fica fora da agenda por suspensão pontual naquela data.
 * `slotsMap`: valores `{ motivo?: string }`.
 */
export function sessaoOcultaPorSuspensaoPontual(specKey, atendimentoDateStr, sessLabel, slotsMap) {
  if (!slotsMap || typeof slotsMap !== "object") return false;
  const kDia = `${specKey}_${atendimentoDateStr}_dia`;
  if (slotsMap[kDia]) return true;
  const t = sessaoLabelParaTurno(sessLabel);
  if (t === "manha" && slotsMap[`${specKey}_${atendimentoDateStr}_manha`]) return true;
  if (t === "tarde" && slotsMap[`${specKey}_${atendimentoDateStr}_tarde`]) return true;
  if (t == null) {
    const m = slotsMap[`${specKey}_${atendimentoDateStr}_manha`];
    const tr = slotsMap[`${specKey}_${atendimentoDateStr}_tarde`];
    if (m && tr) return true;
  }
  return false;
}

/** Há suspensão pontual para o `specKey` na data (dia inteiro ou turno que afete listagem). */
export function suspensaoPontualAfetaData(specKey, atendimentoDateStr, slotsMap) {
  if (!slotsMap || typeof slotsMap !== "object") return false;
  if (slotsMap[`${specKey}_${atendimentoDateStr}_dia`]) return true;
  if (slotsMap[`${specKey}_${atendimentoDateStr}_manha`] || slotsMap[`${specKey}_${atendimentoDateStr}_tarde`]) {
    return true;
  }
  return false;
}

/** Slot pontual ainda relevante para aviso a agentes (próximos 14 dias, dia da semana na agenda efetiva). */
export function suspensaoPontualSlotVisivelParaAgente(
  specKey,
  dataIso,
  todayStr,
  atendimentoDiasAtivosPorSpec = {}
) {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso) || !todayStr) return false;
  if (dataIso < todayStr) return false;
  if (dataIso > addDaysLocal(todayStr, 14)) return false;
  const d = parseDateStr(dataIso);
  const dk = JS_DAY_TO_KEY[d.getDay()];
  const diasEf = diasAtendimentoEfetivosParaSpec(specKey, atendimentoDiasAtivosPorSpec);
  return diasEf.includes(dk);
}

/** Há suspensão cadastrada (válida) para o profissional, independentemente da data. */
export function specTemRegistroSuspensao(specKey, map) {
  const e = map?.[specKey];
  return !!(e && typeof e.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.desde.trim()));
}

/** Cadastro ainda “vigente” na operação (não passou de `ate` quando há prazo fim). */
export function suspensaoRegistroNaoExpirado(entry, todayStr) {
  if (!entry || typeof entry.desde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.desde.trim())) {
    return false;
  }
  if (entry.indefinido === true) return true;
  const ate = typeof entry.ate === "string" ? entry.ate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ate)) return true;
  return todayStr <= ate;
}

/**
 * Chaves de suspensões vencidas para remoção em `settings/ubs`.
 * Período: `ate` passou (ou cadastro inválido). Pontual: data anterior a `todayStr`.
 */
export function coletarLimpezaSuspensoesExpiradas(
  atendimentoSuspensoPorSpec = {},
  atendimentoSuspensoSlots = {},
  todayStr
) {
  const periodoSpecKeys = [];
  for (const [specKey, entry] of Object.entries(atendimentoSuspensoPorSpec || {})) {
    if (!specTemRegistroSuspensao(specKey, atendimentoSuspensoPorSpec)) continue;
    if (!suspensaoRegistroNaoExpirado(entry, todayStr)) periodoSpecKeys.push(specKey);
  }
  const slotKeys = [];
  for (const key of Object.keys(atendimentoSuspensoSlots || {})) {
    const p = parseAtendimentoSuspensoSlotKey(key);
    if (!p) continue;
    if (p.data < todayStr) slotKeys.push(key);
  }
  return { periodoSpecKeys, slotKeys };
}

/**
 * Nos próximos 14 dias (calendário), existe data em que o `specKey` fica suspenso
 * (considera dias efetivos em `atendimentoDiasAtivosPorSpec`, se houver).
 */
export function specSuspensaoAfetaAgenda(specKey, map, todayStr, atendimentoDiasAtivosPorSpec = {}) {
  if (!specTemRegistroSuspensao(specKey, map)) return false;
  if (!suspensaoRegistroNaoExpirado(map[specKey], todayStr)) return false;
  const diasEf = diasAtendimentoEfetivosParaSpec(specKey, atendimentoDiasAtivosPorSpec);
  const d0 = parseDateStr(todayStr);
  for (let add = 0; add < 14; add++) {
    const cand = new Date(d0);
    cand.setDate(cand.getDate() + add);
    const dk = JS_DAY_TO_KEY[cand.getDay()];
    if (!diasEf.includes(dk)) continue;
    const attStr = toDateStr(cand);
    if (atendimentoSuspensoNaData(specKey, attStr, map)) return true;
  }
  return false;
}

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
  const profCfg = opts.profissionalConfigPorSpec || {};
  const spec = BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey);
  const tmpl = !spec ? findSpecTemplateInBaseSchedule(specKey) : null;
  let sess = spec?.sessions?.[sessIdx] ?? tmpl?.sessions?.[sessIdx];
  if (specKey === "medico" && medicoTemSessoesConfiguradasNoFirestore(profCfg.medico)) {
    const built = buildMedicoSpecForDay(dayKey, profCfg);
    sess = built?.sessions?.[sessIdx];
  }
  if (specKey === "enfermeira" && enfermeiraTemSessoesConfiguradasNoFirestore(profCfg.enfermeira)) {
    const built = buildEnfermeiraSpecForDay(dayKey, profCfg, pccuTotal);
    sess = built?.sessions?.[sessIdx];
  }
  if (!sess && isSpecKeyCustom(specKey)) {
    const turnos = opts.atendimentoDiasTurnosPorSpec?.[specKey]?.[dayKey];
    const built = buildCustomSpecForDay(specKey, dayKey, profCfg[specKey], {
      [dayKey]: turnos,
    });
    sess = built?.sessions?.[sessIdx];
  }
  if (!sess) return 0;
  if (sess.visitaDomiciliarSemUnidade) return 0;
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
  const overridden = applyVagasOverrideToSessions([sess], specKey, profCfg);
  sess = overridden[0] || sess;
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

/** Fim do turno da tarde (recepção: “atendimento finalizado”). 18:00 (reforma). */
const TURNO_TARDE_FIM_MINUTOS = 18 * 60;

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
 * Índices de sessões no cartão. Retorna `null` → exibir todas as sessões (turnos não são ocultados pelo relógio).
 */
export function indicesSessoesAtendimentoHojeVisiveis(spec, agora = new Date()) {
  void spec;
  void agora;
  return null;
}

/**
 * @deprecated Cartões permanecem visíveis após o turno; use `estaDentroJanelaSolicitacaoAgendamento` para bloquear solicitações.
 * Mantido para compatibilidade — sempre retorna `false`.
 */
export function specAtendimentoHojeOcultoAposTurnos(spec, agora = new Date()) {
  void spec;
  void agora;
  return false;
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

/**
 * Data (ISO) em que a agenda abre para um atendimento futuro: último dia útil anterior,
 * recuando automaticamente quando feriados ou pontos facultativos caem nesse intervalo
 * (ex.: atendimento na segunda → abertura na sexta; se a sexta for feriado, na quinta).
 */
export function diaUtilAberturaAgendaParaAtendimento(atendimentoDateStr, holidaySet) {
  return toDateStr(previousBusinessDay(atendimentoDateStr, holidaySet));
}

/** Última ocorrência de `diaKey` (segunda…sexta) estritamente antes de `atendimentoDateStr`. */
function ultimaDataDoDiaSemanaAntesDe(atendimentoDateStr, diaKey) {
  for (let i = 1; i <= 7; i++) {
    const iso = addDaysLocal(atendimentoDateStr, -i);
    if (JS_DAY_TO_KEY[parseDateStr(iso).getDay()] === diaKey) return iso;
  }
  return null;
}

/**
 * Data efetiva de abertura quando o dia da semana configurado cai em feriado/ponto facultativo:
 * recua para o último dia útil anterior (ex.: sexta feriado → quinta).
 */
function dataEfetivaAberturaNoDiaSemana(atendimentoDateStr, diaKey, holidaySet) {
  const nominal = ultimaDataDoDiaSemanaAntesDe(atendimentoDateStr, diaKey);
  if (!nominal) return null;
  if (isBusinessDay(parseDateStr(nominal), holidaySet)) return nominal;
  return toDateStr(previousBusinessDay(addDaysLocal(nominal, 1), holidaySet));
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

function cloneSessionsWithTotals(spec, pccuTotal, profissionalConfigPorSpec = {}) {
  const enriched = enrichSpecAgendaFromConfig(spec, profissionalConfigPorSpec);
  const extra = encaixeExtraForSpec(enriched.key);
  const sessions = applyVagasOverrideToSessions(enriched.sessions || [], enriched.key, profissionalConfigPorSpec);
  return sessions.map((sess) => {
    if (sess.visitaDomiciliarSemUnidade) {
      return { ...sess, total: 0, encaixeExtra: 0 };
    }
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
    const used = Number(vdb?.used) || 0;
    const reserved = Number(vdb?.reserved) || 0;
    const reservaSolicitacao = vdb?.reservaSolicitacao ?? null;
    return { ...sess, used, reserved, sessIdx: idx, vagaId: id, reservaSolicitacao };
  });
}

/** Sessão usa dias da semana configuráveis para abrir a agenda (modo `dias_agendamento`). */
function specUsaDiasAgendamentoConfiguraveis(specKey, sess, profissionalConfigPorSpec = {}) {
  const cfg = profissionalConfigPorSpec[specKey];
  if (resolveDiasAgendamento(specKey, cfg)) return true;
  if (!cfg?.agendaModo && (sess?.coletaExamesRotina || (specKey === "tecnicoEnfermagem" && /\bcoleta de exames\b/i.test(String(sess?.label || ""))))) {
    return true;
  }
  return false;
}

/**
 * Hoje é dia de abertura da agenda para atendimento futuro, conforme dias da semana configurados.
 * Se o dia configurado for feriado ou ponto facultativo, a abertura recua para o último dia útil anterior.
 * @param {string[]} diasPermitidos — chaves `segunda` … `sexta`
 */
export function podeAgendarNosDiasConfigurados(todayStr, atendimentoDateStr, diasPermitidos, holidaySet) {
  if (!Array.isArray(diasPermitidos) || !diasPermitidos.length) return false;
  if (!todayStr || !atendimentoDateStr || todayStr >= atendimentoDateStr) return false;
  if (!isBusinessDay(parseDateStr(todayStr), holidaySet)) return false;
  for (const diaKey of diasPermitidos) {
    const eff = dataEfetivaAberturaNoDiaSemana(atendimentoDateStr, diaKey, holidaySet);
    if (eff === todayStr) return true;
  }
  return false;
}

/** Dia útil anterior (`prev`) em que o agente pode solicitar vaga. */
function calcPodeAgendarPrevPadrao({
  spec,
  today,
  todayStr,
  attStr,
  prevStr,
  holidaySet,
  profissionalConfigPorSpec = {},
}) {
  if (specAgendaVesperaOuMesmoDiaAte14(spec.key)) {
    return prevStr === todayStr;
  }
  if (spec.agendaQualquerDiaUtil === true) {
    return isBusinessDay(today, holidaySet) && todayStr < attStr;
  }
  const rawModo = profissionalConfigPorSpec[spec.key]?.agendaModo;
  const modo = normalizarAgendaModo(rawModo ?? defaultAgendaModoParaSpec(spec.key));
  if (modo === AGENDA_MODO.QUALQUER_DIA_UTIL) {
    return isBusinessDay(today, holidaySet) && todayStr < attStr;
  }
  // padrao, dia_util_anterior: dia útil anterior ao atendimento
  return prevStr === todayStr;
}

function filtrarSessoesPrevPorJanela({
  sessions,
  specKey,
  todayStr,
  atendimentoDateStr,
  podeAgendarPrevPadrao,
  profissionalConfigPorSpec = {},
  holidaySet,
}) {
  return sessions.filter((sess) => {
    const dias = resolveDiasAgendamento(specKey, profissionalConfigPorSpec[specKey]);
    if (dias) {
      return podeAgendarNosDiasConfigurados(todayStr, atendimentoDateStr, dias, holidaySet);
    }
    if (specUsaDiasAgendamentoConfiguraveis(specKey, sess, profissionalConfigPorSpec)) {
      const legado = defaultDiasAgendamentoParaSpec(specKey);
      return podeAgendarNosDiasConfigurados(todayStr, atendimentoDateStr, legado, holidaySet);
    }
    return podeAgendarPrevPadrao;
  });
}

function filtrarSessoesMesmoDiaPorJanela({ sessions, specKey, profissionalConfigPorSpec = {} }) {
  return sessions.filter(
    (sess) => !specUsaDiasAgendamentoConfiguraveis(specKey, sess, profissionalConfigPorSpec)
  );
}

/** Agrupa por profissional + dia da semana de atendimento (ex.: fisioterapia quinta vs sexta). */
function chaveAgendaQualquerDiaUtil(seg) {
  return `${seg.key}::${seg.atendimentoDia}`;
}

/**
 * Um cartão por profissional + dia da semana de atendimento:
 * prioriza `same` (hoje); senão o `prev` com a data de atendimento mais próxima.
 */
function dedupePorProximoAtendimento(segments) {
  const groups = new Map();
  const passThrough = [];
  for (const seg of segments) {
    if (!seg?.key || !seg.atendimentoDia || !seg.atendimentoDate) {
      passThrough.push(seg);
      continue;
    }
    const ck = chaveAgendaQualquerDiaUtil(seg);
    const g = groups.get(ck) || { same: null, prevs: [] };
    if (seg.windowType === "same") g.same = seg;
    else if (seg.windowType === "prev") g.prevs.push(seg);
    groups.set(ck, g);
  }
  const out = [...passThrough];
  for (const g of groups.values()) {
    if (g.same) {
      out.push(g.same);
      continue;
    }
    if (g.prevs.length === 0) continue;
    g.prevs.sort((a, b) => a.atendimentoDate.localeCompare(b.atendimentoDate));
    out.push(g.prevs[0]);
  }
  return out;
}

/**
 * Monta cartões visíveis: janela "prev" (dia útil de agendamento) e "same" (atendimento no dia atual).
 * Cartões permanecem visíveis fora do expediente; solicitações são bloqueadas por `estaDentroJanelaSolicitacaoAgendamento`.
 */
export function buildVisibleSegments({
  today,
  feriados,
  pontosFacultativos = [],
  vagasMap,
  pccuTotal,
  recepcao = false,
  dentQuartaVisitaDomiciliarDesde = "",
  atendimentoSuspensoPorSpec = {},
  /** Chave `specKey_YYYY-MM-DD_dia|manha|tarde` → `{ motivo? }` — suspensão em data/turno específicos. */
  atendimentoSuspensoSlots = {},
  atendimentoDiasAtivosPorSpec = {},
  /** `specKey` → mapa dia → turnos; quando definido no cadastro do profissional, restringe sessões (manhã/tarde). */
  atendimentoDiasTurnosPorSpec = {},
  /** Chaves removidas da agenda pela recepção — não geram cartões de agendamento. */
  specKeysDesativados = [],
  /** Overrides de vagas e modo de agenda (`settings/ubs.profissionalConfigPorSpec`). */
  profissionalConfigPorSpec = {},
  /** Profissionais `custom_*` ativos (além da grade em código). */
  customSpecKeys = [],
  /**
   * Pula a deduplicação final (que prioriza o cartão "hoje" sobre os futuros do mesmo dia da
   * semana). Usado pelo painel de vagas do balcão, que precisa enxergar o próximo atendimento
   * futuro mesmo quando existe um cartão de hoje (ex.: nutrição/psicologia, que atendem só uma
   * vez por semana) — a tela de cartões da recepção continua deduplicando normalmente.
   */
  semDedupe = false,
}) {
  const holidaySet = nonWorkingDaySet(feriados, pontosFacultativos);
  const todayStr = toDateStr(today);
  const dedupe = new Set();
  const result = [];
  const profCfgMap = normalizeProfissionalConfigPorSpec(profissionalConfigPorSpec);

  function processarSpecNoDia(spec, atendimentoDia) {
      const diasDefault =
        spec.key === "medico"
          ? diasAtendimentoMedicoEfetivos(profCfgMap)
          : spec.key === "enfermeira"
            ? diasAtendimentoEnfermeiraEfetivos(profCfgMap, pccuTotal)
            : diasAtendimentoDefaultParaSpec(spec.key);
      const diasCfgRaw = atendimentoDiasAtivosPorSpec?.[spec.key];
      const diasPerm =
        Array.isArray(diasCfgRaw) && diasCfgRaw.length > 0
          ? [...new Set(diasCfgRaw.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)))]
          : isSpecKeyCustom(spec.key)
            ? Object.keys(
                normalizeAtendimentoDiasTurnosParaSpec(
                  spec.key,
                  atendimentoDiasTurnosPorSpec?.[spec.key]
                ) || {}
              )
            : diasDefault;
      if (!diasPerm.includes(atendimentoDia)) return;

      const mapaTurnosProf = normalizeAtendimentoDiasTurnosParaSpec(
        spec.key,
        atendimentoDiasTurnosPorSpec?.[spec.key]
      );

      for (let add = 0; add < 14; add++) {
        const cand = new Date(today);
        cand.setHours(12, 0, 0, 0);
        cand.setDate(cand.getDate() + add);
        if (JS_DAY_TO_KEY[cand.getDay()] !== atendimentoDia) continue;

        const attStr = toDateStr(cand);
        if (holidaySet.has(attStr)) continue;

        if (atendimentoSuspensoNaData(spec.key, attStr, atendimentoSuspensoPorSpec)) continue;

        let baseSessions = cloneSessionsWithTotals(spec, pccuTotal, profCfgMap);
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

        if (spec.key === "medico" && medicoTemSessoesConfiguradasNoFirestore(profCfgMap.medico)) {
          const permitidos = new Set(
            medicoSessoesEfetivas(profCfgMap.medico)
              .filter((s) => s.dia === atendimentoDia)
              .map((s) => s.turno)
          );
          baseSessions = baseSessions.filter((sess) => {
            if (sess.visitaDomiciliarSemUnidade) return true;
            const t = sessaoLabelParaTurno(sess.label);
            if (t == null) return true;
            return permitidos.has(t);
          });
        } else if (
          spec.key === "enfermeira" &&
          enfermeiraTemSessoesConfiguradasNoFirestore(profCfgMap.enfermeira)
        ) {
          const permitidos = new Set(
            enfermeiraSessoesEfetivas(profCfgMap.enfermeira, pccuTotal)
              .filter((s) => s.dia === atendimentoDia)
              .map((s) => s.turno)
          );
          baseSessions = baseSessions.filter((sess) => {
            const t = sessaoLabelParaTurno(sess.label);
            if (t == null) return true;
            return permitidos.has(t);
          });
        } else if (mapaTurnosProf) {
          const permitidosNoDia = mapaTurnosProf[atendimentoDia];
          if (!Array.isArray(permitidosNoDia) || permitidosNoDia.length === 0) continue;
          baseSessions = baseSessions.filter((sess) => {
            if (sess.visitaDomiciliarSemUnidade) return true;
            const t = sessaoLabelParaTurno(sess.label);
            if (t == null) return true;
            return permitidosNoDia.includes(t);
          });
        }
        baseSessions = baseSessions.filter(
          (sess) => !sessaoOcultaPorSuspensaoPontual(spec.key, attStr, sess.label, atendimentoSuspensoSlots)
        );
        if (baseSessions.length === 0) continue;

        const sessions = mergeSessionCounts(baseSessions, spec.key, attStr, vagasMap);

        const prevStr = diaUtilAberturaAgendaParaAtendimento(attStr, holidaySet);

        const podeAgendarPrev = calcPodeAgendarPrevPadrao({
          spec,
          today,
          todayStr,
          attStr,
          prevStr,
          holidaySet,
          profissionalConfigPorSpec: profCfgMap,
        });

        const sessionsAgendaveisPrev = filtrarSessoesPrevPorJanela({
          sessions,
          specKey: spec.key,
          todayStr,
          atendimentoDateStr: attStr,
          podeAgendarPrevPadrao: podeAgendarPrev,
          profissionalConfigPorSpec: profCfgMap,
          holidaySet,
        });

        if (
          deveExibirCartaoPrev({
            spec,
            todayStr,
            atendimentoDateStr: attStr,
            prevStr,
            profissionalConfigPorSpec: profCfgMap,
          }) &&
          sessions.length > 0
        ) {
          const k = `prev-${spec.key}-${atendimentoDia}-${attStr}`;
          if (!dedupe.has(k)) {
            dedupe.add(k);
            result.push({
              ...spec,
              sessions,
              atendimentoDia,
              windowType: "prev",
              atendimentoDate: attStr,
              agendamentoDate: prevStr,
              podeAgendarPrev: sessionsAgendaveisPrev.length > 0,
            });
          }
        }

        const visitaDomicHojeSemVaga =
          spec.key === "dentFernando" &&
          atendimentoDia === "quarta" &&
          dentQuartaVisitaDomiciliarDesde &&
          isDentQuartaVisitaDomiciliar(attStr, dentQuartaVisitaDomiciliarDesde);

        const patrickSextaVisitaTardeInformativoHoje =
          spec.key === "dentPatrick" &&
          atendimentoDia === "sexta" &&
          attStr === todayStr &&
          baseSessions.some((s) => s.visitaDomiciliarSemUnidade);

        const sessionsSame = filtrarSessoesMesmoDiaPorJanela({
          sessions,
          specKey: spec.key,
          profissionalConfigPorSpec: profCfgMap,
        });
        const podeMostrarMesmoDia =
          sessionsSame.length > 0 ||
          visitaDomicHojeSemVaga ||
          patrickSextaVisitaTardeInformativoHoje;

        if (attStr === todayStr && podeMostrarMesmoDia) {
          const k = `same-${spec.key}-${atendimentoDia}-${attStr}`;
          if (!dedupe.has(k)) {
            dedupe.add(k);
            result.push({
              ...spec,
              sessions: sessionsSame,
              atendimentoDia,
              windowType: "same",
              atendimentoDate: attStr,
            });
          }
        }
      }
  }

  for (const atendimentoDia of Object.keys(BASE_SCHEDULE)) {
    const specsDia = listaSpecConfigsParaDiaAtendimento(
      atendimentoDia,
      atendimentoDiasAtivosPorSpec,
      specKeysDesativados
    );
    for (const specRaw of specsDia) {
      let spec = specRaw;
      if (spec.key === "medico") {
        if (medicoTemSessoesConfiguradasNoFirestore(profCfgMap.medico)) {
          const built = buildMedicoSpecForDay(atendimentoDia, profCfgMap);
          if (!built) continue;
          spec = built;
        }
      }
      if (spec.key === "enfermeira") {
        if (enfermeiraTemSessoesConfiguradasNoFirestore(profCfgMap.enfermeira)) {
          const built = buildEnfermeiraSpecForDay(atendimentoDia, profCfgMap, pccuTotal);
          if (!built) continue;
          spec = built;
        }
      }
      processarSpecNoDia(enrichSpecAgendaFromConfig(spec, profCfgMap), atendimentoDia);
    }
  }

  for (const atendimentoDia of ORDEM_DIA_SEMANA_GRADE) {
    for (const specKey of customSpecKeys) {
      if (specKeyEstaDesativado(specKey, specKeysDesativados)) continue;
      const diasCfgRaw = atendimentoDiasAtivosPorSpec?.[specKey];
      const diasPerm =
        Array.isArray(diasCfgRaw) && diasCfgRaw.length > 0
          ? [...new Set(diasCfgRaw.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)))]
          : Object.keys(
              normalizeAtendimentoDiasTurnosParaSpec(
                specKey,
                atendimentoDiasTurnosPorSpec?.[specKey]
              ) || {}
            );
      if (!diasPerm.includes(atendimentoDia)) continue;
      const mapaTurnos = normalizeAtendimentoDiasTurnosParaSpec(
        specKey,
        atendimentoDiasTurnosPorSpec?.[specKey]
      );
      const built = buildCustomSpecForDay(specKey, atendimentoDia, profCfgMap[specKey], mapaTurnos);
      if (built) processarSpecNoDia(built, atendimentoDia);
    }
  }

  return semDedupe ? result : dedupePorProximoAtendimento(result);
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
    atendimentoSuspensoPorSpec: options.atendimentoSuspensoPorSpec ?? {},
    atendimentoSuspensoSlots: options.atendimentoSuspensoSlots ?? {},
    atendimentoDiasAtivosPorSpec: options.atendimentoDiasAtivosPorSpec ?? {},
    atendimentoDiasTurnosPorSpec: options.atendimentoDiasTurnosPorSpec ?? {},
  });
}

// ─────────────────────────────────────────────────────────────────
//  Janelas de solicitação de agendamento (agentes / direção — horário local)
//  Reforma: atendimento na unidade 13h–18h; sobras no mesmo dia podem ser solicitadas desde 7h;
//  agendamento “véspera” (dia útil anterior ao atendimento) só a partir das 13h30.
// ─────────────────────────────────────────────────────────────────

/** Mesmo dia (`windowType: "same"`): das 7h até 18h (demais profissionais). */
const JANELA_SOLICIT_MESMO_DIA_INICIO_MIN = 7 * 60;
const JANELA_SOLICIT_MESMO_DIA_FIM_MIN = 18 * 60;
/** Nutrição e psicologia no dia do atendimento: das 7h até 14h. */
const JANELA_SOLICIT_MESMO_DIA_FIM_ATE_14_MIN = 14 * 60;

/** Fim da janela de solicitação no mesmo dia por spec (em minutos). */
const JANELA_MESMO_DIA_FIM_POR_SPEC = {
  medico:         13 * 60 + 30,   // 13h30
  dentFernando:   14 * 60,        // 14h
  dentPatrick:    14 * 60,        // 14h
  enfermeira:     15 * 60,        // 15h
  psicologa:      14 * 60,        // 14h
  nutricionista:  14 * 60,        // 14h
};

/** Outro dia / véspera (`windowType: "prev"`): das 13h30 às 18h. */
const JANELA_SOLICIT_PREV_INICIO_MIN = 13 * 60 + 30;
const JANELA_SOLICIT_PREV_FIM_MIN = 18 * 60;

function minutosRelogioLocal(data) {
  const d = data instanceof Date ? data : new Date(data);
  return d.getHours() * 60 + d.getMinutes();
}

export function janelaMesmoDiaFimMinutos(specKey) {
  return JANELA_MESMO_DIA_FIM_POR_SPEC[specKey] ?? JANELA_SOLICIT_MESMO_DIA_FIM_MIN;
}

export function estaDentroJanelaAgendamentoMesmoDia(data = new Date(), specKey) {
  const m = minutosRelogioLocal(data);
  const fim = janelaMesmoDiaFimMinutos(specKey);
  return m >= JANELA_SOLICIT_MESMO_DIA_INICIO_MIN && m < fim;
}

export function estaDentroJanelaAgendamentoPrev(data = new Date()) {
  const m = minutosRelogioLocal(data);
  return m >= JANELA_SOLICIT_PREV_INICIO_MIN && m < JANELA_SOLICIT_PREV_FIM_MIN;
}

/** Há pelo menos uma janela ativa (antes das 7h ou após as 18h fica tudo fechado). */
export function estaDentroAlgumaJanelaSolicitacaoAgendamento(data = new Date()) {
  return estaDentroJanelaAgendamentoMesmoDia(data) || estaDentroJanelaAgendamentoPrev(data);
}

/**
 * @param {"prev"|"same"|null|undefined} windowType — cartão de `buildVisibleSegments`
 */
export function estaDentroJanelaSolicitacaoAgendamento(windowType, data = new Date(), specKey) {
  if (windowType === "same") return estaDentroJanelaAgendamentoMesmoDia(data, specKey);
  if (windowType === "prev") return estaDentroJanelaAgendamentoPrev(data);
  return estaDentroAlgumaJanelaSolicitacaoAgendamento(data);
}

export const MSG_FORA_JANELA_AGENDAMENTO_MESMO_DIA =
  "Solicitações para atendimento hoje (quando houver vagas) ficam disponíveis das 7h às 18h, ou até a recepção informar que o atendimento deste profissional foi encerrado.";

export const MSG_FORA_JANELA_AGENDAMENTO_MESMO_DIA_ATE_14 =
  "Solicitações para atendimento hoje (quando houver vagas) ficam disponíveis das 7h às 14h.";

export const MSG_FORA_JANELA_AGENDAMENTO_PREV =
  "Solicitações para agendar atendimento em outro dia (véspera / dia útil anterior) ficam disponíveis das 13h30 às 18h.";

export const MSG_FORA_EXPEDIENTE_UBS =
  "Fora do horário de solicitações: atendimento hoje (com vagas) — 7h às 18h; outros dias — 13h30 às 18h.";

/** @deprecated use `estaDentroAlgumaJanelaSolicitacaoAgendamento` ou `estaDentroJanelaSolicitacaoAgendamento` */
export function estaDentroExpedienteUbs(data = new Date()) {
  return estaDentroAlgumaJanelaSolicitacaoAgendamento(data);
}

/**
 * @param {"prev"|"same"|null|undefined} windowType
 */
export function msgForaJanelaSolicitacaoAgendamento(windowType, specKey) {
  if (windowType === "same") {
    const fimMin = janelaMesmoDiaFimMinutos(specKey);
    if (fimMin < JANELA_SOLICIT_MESMO_DIA_FIM_MIN) {
      return `Solicitações para atendimento hoje (quando houver vagas) ficam disponíveis das 7h às ${labelHorarioFimMesmoDia(specKey)}.`;
    }
    return MSG_FORA_JANELA_AGENDAMENTO_MESMO_DIA;
  }
  if (windowType === "prev") return MSG_FORA_JANELA_AGENDAMENTO_PREV;
  return MSG_FORA_EXPEDIENTE_UBS;
}

/** Retorna o horário de fim da janela de mesmo dia em formato legível (ex.: "13h30", "14h"). */
function labelHorarioFimMesmoDia(specKey) {
  const m = janelaMesmoDiaFimMinutos(specKey);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, "0")}`;
}

/** "Segunda, Terça e Quarta" → junta lista com vírgulas e "e" antes do último. */
function juntarDiasNomesPortugues(nomes) {
  if (!nomes.length) return "";
  if (nomes.length === 1) return nomes[0];
  return nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
}

/** Retorna o nome longo do dia da semana de uma data ISO (ex.: "Terça-feira"). */
function nomeDiaSemanaDeData(isoDateStr) {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const d = parseDateStr(isoDateStr);
  const raw = d.toLocaleDateString("pt-BR", { weekday: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Cartão `prev` visível, mas hoje não é dia de abertura da agenda para este atendimento.
 * @param {object} spec — cartão de `buildVisibleSegments`
 * @param {object} [profissionalConfigPorSpec]
 * @returns {{ main: string, nota: string | null }}
 */
export function msgForaDiaAgendamentoPrev(spec, profissionalConfigPorSpec = {}) {
  const cfg = profissionalConfigPorSpec[spec?.key];
  const dias = resolveDiasAgendamento(spec?.key, cfg);
  if (dias?.length) {
    const nomesApp = dias.map((d) => (DAY_LABEL[d] || d).split("-")[0].trim());
    const diasPresencial = resolveDiasAgendamentoPresencial(spec?.key, cfg);
    let nota = null;
    if (diasPresencial?.length) {
      const nomesPresencial = diasPresencial.map((d) => (DAY_LABEL[d] || d).split("-")[0].trim());
      nota = `Presencialmente na UBS, o paciente pode agendar na ${juntarDiasNomesPortugues(nomesPresencial).toLowerCase()}.`;
    }
    return {
      main: `Agendamento pelo aplicativo disponível na ${juntarDiasNomesPortugues(nomesApp).toLowerCase()}, das 13h30 às 18h. Hoje não é dia de abertura da agenda.`,
      nota,
    };
  }
  const efetivaModo = normalizarAgendaModo(cfg?.agendaModo ?? defaultAgendaModoParaSpec(spec?.key));
  if (spec?.agendaQualquerDiaUtil || efetivaModo === AGENDA_MODO.QUALQUER_DIA_UTIL) {
    return {
      main: "Agendamento disponível em qualquer dia útil antes do atendimento, das 13h30 às 18h. Hoje não é um dia útil.",
      nota: null,
    };
  }
  if (specAgendaVesperaOuMesmoDiaAte14(spec?.key)) {
    const diaNome = nomeDiaSemanaDeData(spec?.agendamentoDate);
    const fimLabel = labelHorarioFimMesmoDia(spec?.key);
    const main = diaNome
      ? `Agendamento disponível na próxima ${diaNome.toLowerCase()}, das 13h30 às 18h, ou no dia do atendimento, das 7h às ${fimLabel} (se houver vagas). Hoje não é dia de abertura da agenda.`
      : `Agendamento disponível no dia útil anterior ao atendimento (13h30 às 18h) ou no dia do atendimento (7h às ${fimLabel}, com vagas). Hoje não é dia de abertura da agenda.`;
    return {
      main,
      nota: "Presencialmente na UBS, o paciente pode realizar o agendamento em qualquer dia útil.",
    };
  }
  // Médico, dentistas: véspera + mesmo dia com horário específico
  const diaNome = nomeDiaSemanaDeData(spec?.agendamentoDate);
  const fimLabel = labelHorarioFimMesmoDia(spec?.key);
  const main = diaNome
    ? `Agendamento disponível na próxima ${diaNome.toLowerCase()}, das 13h30 às 18h, ou no dia do atendimento, das 7h às ${fimLabel} (se houver vagas). Hoje não é dia de abertura da agenda.`
    : `Agendamento disponível no dia útil anterior ao atendimento (das 13h30 às 18h) ou no dia do atendimento (das 7h às ${fimLabel}, se houver vagas). Hoje não é dia de abertura da agenda.`;
  return { main, nota: null };
}
