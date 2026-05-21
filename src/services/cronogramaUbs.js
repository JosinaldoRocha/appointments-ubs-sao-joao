import {
  DAY_LABEL,
  DEFAULT_PROF_NAMES,
  ORDEM_DIA_SEMANA_GRADE,
  SPEC_META,
} from "./scheduleConfig";

export const CRONOGRAMA_VERSAO = 1;
export const CRONOGRAMA_TURNOS = ["manha", "tarde"];
export const CRONOGRAMA_TURNO_LABEL = { manha: "Manhã", tarde: "Tarde" };

const MAX_NOME_PROFISSIONAL = 120;
const MAX_ITENS = 200;

/** Categorias de profissional disponíveis no cronograma (chave da agenda). */
export const CRONOGRAMA_CATEGORIAS = Object.keys(DEFAULT_PROF_NAMES).map((key) => ({
  key,
  label: SPEC_META[key]?.role || key,
}));

/** Tipos de atendimento por categoria (múltiplos por turno). */
export const CRONOGRAMA_TIPOS_POR_CATEGORIA = {
  medico: [
    { key: "clinico", label: "Atendimento clínico geral" },
    { key: "gestantes", label: "Atendimento para gestantes" },
    { key: "receitas", label: "Troca de receitas" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  enfermeira: [
    { key: "enfermagem", label: "Atendimento de enfermagem" },
    { key: "pccu", label: "PCCU" },
  ],
  dentFernando: [
    { key: "odontologia", label: "Atendimento odontológico" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  dentPatrick: [
    { key: "odontologia", label: "Atendimento odontológico" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  psicologa: [{ key: "psicologia", label: "Atendimento psicológico" }],
  fisio: [{ key: "fisioterapia", label: "Atendimento de fisioterapia" }],
  nutricionista: [{ key: "nutricao", label: "Atendimento nutricional" }],
  tecnicoEnfermagem: [{ key: "coleta_exames", label: "Coleta de exames" }],
};

const CATEGORIAS_VALIDAS = new Set(CRONOGRAMA_CATEGORIAS.map((c) => c.key));
const TIPOS_VALIDOS_POR_CATEGORIA = Object.fromEntries(
  Object.entries(CRONOGRAMA_TIPOS_POR_CATEGORIA).map(([cat, arr]) => [
    cat,
    new Set(arr.map((t) => t.key)),
  ])
);

export function cronogramaUbsVazio() {
  return { versao: CRONOGRAMA_VERSAO, itens: [] };
}

export function tiposAtendimentoParaCategoria(categoria) {
  return CRONOGRAMA_TIPOS_POR_CATEGORIA[categoria] || [];
}

export function labelTipoAtendimento(categoria, tipoKey) {
  const t = tiposAtendimentoParaCategoria(categoria).find((x) => x.key === tipoKey);
  return t?.label || tipoKey;
}

export function labelCategoria(categoria) {
  return CRONOGRAMA_CATEGORIAS.find((c) => c.key === categoria)?.label || categoria;
}

function normalizarItem(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const categoria = typeof raw.categoria === "string" ? raw.categoria.trim() : "";
  if (!CATEGORIAS_VALIDAS.has(categoria)) return null;
  const dia = typeof raw.dia === "string" ? raw.dia.trim() : "";
  if (!ORDEM_DIA_SEMANA_GRADE.includes(dia)) return null;
  const turno = raw.turno === "manha" || raw.turno === "tarde" ? raw.turno : null;
  if (!turno) return null;
  const nome = typeof raw.nome === "string" ? raw.nome.trim().slice(0, MAX_NOME_PROFISSIONAL) : "";
  if (!nome) return null;
  const permitidos = TIPOS_VALIDOS_POR_CATEGORIA[categoria] || new Set();
  const tipos = [
    ...new Set(
      (Array.isArray(raw.tipos) ? raw.tipos : [])
        .filter((t) => typeof t === "string" && permitidos.has(t))
        .sort()
    ),
  ];
  if (!tipos.length) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().slice(0, 80)
      : `${categoria}_${dia}_${turno}_${nome.slice(0, 20)}`;
  return { id, categoria, nome, dia, turno, tipos };
}

export function normalizeCronogramaUbs(raw) {
  if (raw == null) return cronogramaUbsVazio();
  if (typeof raw === "string") return cronogramaUbsVazio();
  if (typeof raw !== "object" || Array.isArray(raw)) return cronogramaUbsVazio();
  const itensRaw = Array.isArray(raw.itens) ? raw.itens : [];
  const itens = [];
  for (const item of itensRaw) {
    const n = normalizarItem(item);
    if (n) itens.push(n);
    if (itens.length >= MAX_ITENS) break;
  }
  itens.sort(ordenarItensCronograma);
  return { versao: CRONOGRAMA_VERSAO, itens };
}

function ordenarItensCronograma(a, b) {
  const di = ORDEM_DIA_SEMANA_GRADE.indexOf(a.dia) - ORDEM_DIA_SEMANA_GRADE.indexOf(b.dia);
  if (di !== 0) return di;
  const ti = CRONOGRAMA_TURNOS.indexOf(a.turno) - CRONOGRAMA_TURNOS.indexOf(b.turno);
  if (ti !== 0) return ti;
  const cn = a.nome.localeCompare(b.nome, "pt-BR");
  if (cn !== 0) return cn;
  return a.categoria.localeCompare(b.categoria, "pt-BR");
}

export function cronogramaUbsIguais(a, b) {
  const na = normalizeCronogramaUbs(a);
  const nb = normalizeCronogramaUbs(b);
  if (na.itens.length !== nb.itens.length) return false;
  for (let i = 0; i < na.itens.length; i++) {
    const x = na.itens[i];
    const y = nb.itens[i];
    if (
      x.id !== y.id ||
      x.categoria !== y.categoria ||
      x.nome !== y.nome ||
      x.dia !== y.dia ||
      x.turno !== y.turno ||
      x.tipos.join(",") !== y.tipos.join(",")
    ) {
      return false;
    }
  }
  return true;
}

export function cronogramaTemItens(cronograma) {
  return normalizeCronogramaUbs(cronograma).itens.length > 0;
}

/** Chave estável para agrupar itens do mesmo profissional (categoria + nome). */
export function chaveProfissionalCronograma(categoria, nome) {
  return `${categoria}::${String(nome || "").trim()}`;
}

/** Profissionais distintos no cronograma, ordenados por categoria e nome. */
export function profissionaisUnicosNoCronograma(cronograma) {
  const seen = new Map();
  for (const item of normalizeCronogramaUbs(cronograma).itens) {
    const k = chaveProfissionalCronograma(item.categoria, item.nome);
    if (!seen.has(k)) {
      seen.set(k, { categoria: item.categoria, nome: item.nome, chave: k });
    }
  }
  return [...seen.values()].sort((a, b) => {
    const ca = labelCategoria(a.categoria).localeCompare(labelCategoria(b.categoria), "pt-BR");
    if (ca !== 0) return ca;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function itemPertenceAoProfissional(item, prof) {
  if (!prof) return true;
  return chaveProfissionalCronograma(item.categoria, item.nome) === prof.chave;
}

export function filtrarMapaCronogramaPorProfissional(mapa, prof) {
  if (!prof) return mapa;
  const out = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    out[dia] = { manha: [], tarde: [] };
    for (const turno of CRONOGRAMA_TURNOS) {
      out[dia][turno] = (mapa[dia]?.[turno] || []).filter((item) => itemPertenceAoProfissional(item, prof));
    }
  }
  return out;
}

export function itensCronogramaPorDiaTurno(cronograma) {
  const mapa = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    mapa[dia] = { manha: [], tarde: [] };
  }
  for (const item of normalizeCronogramaUbs(cronograma).itens) {
    mapa[item.dia][item.turno].push(item);
  }
  return mapa;
}

export function novoItemCronogramaRascunho(categoria = "medico") {
  const tipos = tiposAtendimentoParaCategoria(categoria);
  return {
    id: "",
    categoria,
    nome: DEFAULT_PROF_NAMES[categoria] || "",
    dia: "segunda",
    turno: "tarde",
    tipos: tipos[0] ? [tipos[0].key] : [],
  };
}

export function validarItemCronogramaRascunho(item) {
  const n = normalizarItem({ ...item, id: item.id || "novo" });
  if (!n) return "Preencha nome, categoria, dia, turno e ao menos um tipo de atendimento.";
  return null;
}

export function prepararItemCronogramaParaSalvar(item, id) {
  const n = normalizarItem({ ...item, id: id || item.id || `item_${Date.now()}` });
  return n;
}

export { DAY_LABEL, ORDEM_DIA_SEMANA_GRADE };
