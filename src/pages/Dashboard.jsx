// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { deleteField } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import AppLogo from "../components/AppLogo";
import { logout } from "../services/auth";
import {
  listenVagasByAtendimentoDates,
  setVaga,
  listenProfissionais,
  registrarNotificacaoVagasEsgotadas,
  listenSettings,
  updateSettings,
  setAtendimentoEncerradoFlag,
  setSpecAtendimentoSuspenso,
  addAtendimentoSuspensoSlot,
  removeAtendimentoSuspensoSlot,
  clearSpecAtendimentoSuspenso,
  limparSuspensoesExpiradasSeNecessario,
  updateProfissional,
  digitosWhatsappRecepcaoParaSolicitacao,
  digitosWhatsappDirecaoEncaixeParaSolicitacao,
  resolveWhatsappDestinoSolicitacao,
  tryReservaSolicitacaoAgente,
  liberarReservaSolicitacaoAgente,
  updateUser,
} from "../services/db";
import {
  buildVisibleSegments,
  vagaDocId,
  toDateStr,
  DEFAULT_PCCU_TOTAL,
  collectAtendimentoDatesForListener,
  SPEC_META,
  sessionTotalEffective,
  estaDentroJanelaSolicitacaoAgendamento,
  msgForaJanelaSolicitacaoAgendamento,
  msgForaDiaAgendamentoPrev,
  normalizeAtendimentoDiasTurnosParaSpec,
  listaSpecKeysCustom,
} from "../services/scheduleConfig";
import {
  uploadDocumentoPacienteSolicitacao,
  uploadDocumentosPacienteSolicitacao,
  uploadFotoPerfil,
} from "../services/storageUpload";
import {
  montarMensagemSolicitacaoWhatsApp,
  abrirWhatsAppComTexto,
  abrirWhatsAppNavegandoJanela,
} from "../services/whatsappSolicitacao";
import TabVagas from "../components/TabVagas";
import TabAvisos, { computeAvisosPreview } from "../components/TabAvisos";
import TabCronograma from "../components/TabCronograma";
import TabConfig from "../components/TabConfig";
import ModalAgendar from "../components/ModalAgendar";
import Toast from "../components/Toast";
import {
  isRecepcaoPerfil,
  isAgenteOuDiretorPerfil,
  isDiretorPerfil,
  podeEditarCronogramaUbs,
} from "../utils/perfilRole";
import { cronogramaUbsIguais, cronogramaUbsVazio } from "../services/cronogramaUbs";

function vagasNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Compara só o que afeta a UI de vagas (ignora `atualizadoEm`, etc.). */
function reservaSolicVagaIgual(p, q) {
  if (p == null && q == null) return true;
  if (p == null || q == null) return false;
  const mp = typeof p.criadoEm?.toMillis === "function" ? p.criadoEm.toMillis() : 0;
  const mq = typeof q.criadoEm?.toMillis === "function" ? q.criadoEm.toMillis() : 0;
  return (p.uid ?? "") === (q.uid ?? "") && (p.nome ?? "") === (q.nome ?? "") && mp === mq;
}

/**
 * Evita `setVagasMap` com objeto novo quando o snapshot do Firestore não mudou a ocupação.
 * O SDK pode emitir mais de uma vez (ex.: cache local e confirmação do servidor) com os mesmos números.
 */
function vagasOcupacaoIguaisParaUI(prev, next) {
  if (prev === next) return true;
  const a = prev || {};
  const b = next || {};
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const p = a[id];
    const q = b[id];
    if (!!p !== !!q) return false;
    if (!p) continue;
    if (vagasNum(p.used) !== vagasNum(q.used)) return false;
    if (vagasNum(p.reserved) !== vagasNum(q.reserved)) return false;
    if (vagasNum(p.total) !== vagasNum(q.total)) return false;
    if ((p.atendimentoDate ?? "") !== (q.atendimentoDate ?? "")) return false;
    if ((p.specKey ?? "") !== (q.specKey ?? "")) return false;
    if (String(p.sessIdx ?? "") !== String(q.sessIdx ?? "")) return false;
    if ((p.dayKey ?? "") !== (q.dayKey ?? "")) return false;
    if (!reservaSolicVagaIgual(p.reservaSolicitacao, q.reservaSolicitacao)) return false;
  }
  return true;
}

function listaIsoIgual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mapEncerradoIgual(prev, next) {
  const p = prev?.atendimentoEncerradoPorSpecData || {};
  const q = next?.atendimentoEncerradoPorSpecData || {};
  const keys = new Set([...Object.keys(p), ...Object.keys(q)]);
  for (const k of keys) {
    if (!!p[k] !== !!q[k]) return false;
  }
  return true;
}

function mapaSuspensaoIgual(pa, pb) {
  const a = pa || {};
  const b = pb || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (!x && !y) continue;
    if (!x || !y) return false;
    if (String(x.desde || "") !== String(y.desde || "")) return false;
    if (!!x.indefinido !== !!y.indefinido) return false;
    if (String(x.ate || "") !== String(y.ate || "")) return false;
  }
  return true;
}

function mapaDiasAtivosPorSpecIgual(pa, pb) {
  const a = pa || {};
  const b = pb || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const sa = [...(a[k] || [])].slice().sort().join(",");
    const sb = [...(b[k] || [])].slice().sort().join(",");
    if (sa !== sb) return false;
  }
  return true;
}

/** Evita re-render quando o Firestore reemite `settings` com os mesmos valores (novo objeto). */
function settingsIguaisParaDashboard(prev, next) {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (!listaIsoIgual(prev.feriados, next.feriados)) return false;
  if (!listaIsoIgual(prev.pontosFacultativos, next.pontosFacultativos)) return false;
  if (prev.pccuTotal !== next.pccuTotal) return false;
  if ((prev.dentQuartaVisitaDomiciliarDesde || "") !== (next.dentQuartaVisitaDomiciliarDesde || "")) {
    return false;
  }
  if ((prev.recepcionistaAtivoWhatsapp || "") !== (next.recepcionistaAtivoWhatsapp || "")) return false;
  if ((prev.recepcionistaAtivoNome || "") !== (next.recepcionistaAtivoNome || "")) return false;
  if ((prev.ultimoRecepcionistaWhatsapp || "") !== (next.ultimoRecepcionistaWhatsapp || "")) return false;
  if ((prev.ultimoRecepcionistaNome || "") !== (next.ultimoRecepcionistaNome || "")) return false;
  if ((prev.whatsappDirecaoEncaixe || "") !== (next.whatsappDirecaoEncaixe || "")) return false;
  if (!mapEncerradoIgual(prev, next)) return false;
  if (!mapaSuspensaoIgual(prev.atendimentoSuspensoPorSpec, next.atendimentoSuspensoPorSpec)) return false;
  if (!mapaDiasAtivosPorSpecIgual(prev.atendimentoDiasAtivosPorSpec, next.atendimentoDiasAtivosPorSpec)) {
    return false;
  }
  const keysTurnos = new Set([
    ...Object.keys(prev.atendimentoDiasTurnosPorSpec || {}),
    ...Object.keys(next.atendimentoDiasTurnosPorSpec || {}),
  ]);
  for (const k of keysTurnos) {
    if (
      profissionaisDiasTurnosSnapshot({ atendimentoDiasTurnos: prev.atendimentoDiasTurnosPorSpec?.[k] }) !==
      profissionaisDiasTurnosSnapshot({ atendimentoDiasTurnos: next.atendimentoDiasTurnosPorSpec?.[k] })
    ) {
      return false;
    }
  }
  if (!mapaSuspensoSlotsIgual(prev.atendimentoSuspensoSlots, next.atendimentoSuspensoSlots)) return false;
  if (!cronogramaUbsIguais(prev.cronogramaUbs, next.cronogramaUbs)) return false;
  const prevOff = [...(prev.specKeysDesativados || [])].sort().join(",");
  const nextOff = [...(next.specKeysDesativados || [])].sort().join(",");
  if (prevOff !== nextOff) return false;
  const cfgKeys = new Set([
    ...Object.keys(prev.profissionalConfigPorSpec || {}),
    ...Object.keys(next.profissionalConfigPorSpec || {}),
  ]);
  for (const k of cfgKeys) {
    if (JSON.stringify(prev.profissionalConfigPorSpec?.[k]) !== JSON.stringify(next.profissionalConfigPorSpec?.[k])) {
      return false;
    }
  }
  return true;
}

function slotSuspensaoSnapshot(val) {
  const m = val?.motivo;
  return typeof m === "string" ? m.trim() : "";
}

function mapaSuspensoSlotsIgual(pa, pb) {
  const a = pa || {};
  const b = pb || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (slotSuspensaoSnapshot(a[k]) !== slotSuspensaoSnapshot(b[k])) return false;
  }
  return true;
}

function profissionaisDiasTurnosSnapshot(p) {
  const raw = p?.atendimentoDiasTurnos;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const keys = Object.keys(raw).sort();
  return keys.map((k) => `${k}:${[...(raw[k] || [])].sort().join(",")}`).join("|");
}

function profissionaisMapIgual(prev, next) {
  if (prev === next) return true;
  const a = prev || {};
  const b = next || {};
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const p = a[id];
    const q = b[id];
    if (!!p !== !!q) return false;
    if (!p) continue;
    const kP = p.specKey ?? p.id ?? "";
    const kQ = q.specKey ?? q.id ?? "";
    if (kP !== kQ) return false;
    if (String(p.nome ?? "").trim() !== String(q.nome ?? "").trim()) return false;
    if (String(p.role ?? "") !== String(q.role ?? "")) return false;
    if (profissionaisDiasTurnosSnapshot(p) !== profissionaisDiasTurnosSnapshot(q)) return false;
  }
  return true;
}

const TABS_BASE = [
  { key: "vagas", label: "Vagas" },
  { key: "avisos", label: "Avisos" },
  { key: "cronograma", label: "Cronograma" },
];

export default function Dashboard() {
  const { perfil, user } = useAuth();
  const isRecepcao = isRecepcaoPerfil(perfil);
  const isDiretor = isDiretorPerfil(perfil);

  const [menuPerfilAberto, setMenuPerfilAberto] = useState(false);
  const [fotoPerfilLocal, setFotoPerfilLocal] = useState(null);
  const [uploadandoFoto, setUploadandoFoto] = useState(false);
  const menuPerfilRef = useRef(null);
  const fileInputRef = useRef(null);

  const fotoAtual = fotoPerfilLocal ?? perfil?.fotoPerfil ?? null;

  const [tab, setTab] = useState("vagas");
  const [vagasMap, setVagasMap] = useState({});
  /** Documentos `profissionais/{id}`; campo opcional `specKey` liga à grade (medico, dentFernando, …). */
  const [profissionaisMap, setProfissionaisMap] = useState({});
  const profNames = useMemo(() => {
    const names = {};
    Object.values(profissionaisMap).forEach((p) => {
      const k = p.specKey || p.id;
      names[k] = p.nome;
    });
    return names;
  }, [profissionaisMap]);

  const [settings, setSettings] = useState({
    feriados: [],
    pontosFacultativos: [],
    pccuTotal: DEFAULT_PCCU_TOTAL,
    dentQuartaVisitaDomiciliarDesde: "",
    recepcionistaAtivoWhatsapp: "",
    recepcionistaAtivoNome: "",
    whatsappDirecaoEncaixe: "",
    ultimoRecepcionistaWhatsapp: "",
    ultimoRecepcionistaNome: "",
    atendimentoEncerradoPorSpecData: {},
    atendimentoSuspensoPorSpec: {},
    atendimentoSuspensoSlots: {},
    atendimentoDiasAtivosPorSpec: {},
    atendimentoDiasTurnosPorSpec: {},
    profissionalConfigPorSpec: {},
    specKeysDesativados: [],
    cronogramaUbs: cronogramaUbsVazio(),
  });

  const atendimentoDiasTurnosPorSpec = useMemo(() => {
    const fromSettings = settings.atendimentoDiasTurnosPorSpec || {};
    const out = { ...fromSettings };
    for (const p of Object.values(profissionaisMap)) {
      const sk = p.specKey;
      if (!sk || typeof sk !== "string") continue;
      const raw = p.atendimentoDiasTurnos;
      if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0) {
        out[sk] = raw;
      }
    }
    return out;
  }, [profissionaisMap, settings.atendimentoDiasTurnosPorSpec]);

  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  /** Agente/direção: pausa listener de vagas com aba em segundo plano para reduzir leituras; recepção segue sempre em tempo real. */
  const [paginaVisivel, setPaginaVisivel] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible"
  );
  /** Atualiza à meia-noite / ao voltar à aba — agenda e limpeza de suspensões usam o dia local correto. */
  const [diaCalendario, setDiaCalendario] = useState(() => toDateStr(new Date()));

  const vagasMapRef = useRef({});
  vagasMapRef.current = vagasMap;

  const profNamesRef = useRef(profNames);
  profNamesRef.current = profNames;

  const settingsSlotRef = useRef({
    pccuTotal: settings.pccuTotal,
    dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
    profissionalConfigPorSpec: settings.profissionalConfigPorSpec,
    atendimentoDiasTurnosPorSpec,
  });
  const manterReservaAoFecharModalRef = useRef(false);
  settingsSlotRef.current = {
    pccuTotal: settings.pccuTotal,
    dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
    profissionalConfigPorSpec: settings.profissionalConfigPorSpec,
    atendimentoDiasTurnosPorSpec,
  };

  const todayStr = diaCalendario;
  const listenDates = useMemo(
    () =>
      collectAtendimentoDatesForListener(
        new Date(),
        settings.feriados,
        settings.pontosFacultativos
      ),
    [todayStr, settings.feriados, settings.pontosFacultativos]
  );

  const escutaVagasFirestore =
    isRecepcaoPerfil(perfil) || !isAgenteOuDiretorPerfil(perfil) || paginaVisivel;

  useEffect(() => {
    const onVis = () => setPaginaVisivel(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!menuPerfilAberto) return;
    const handler = (e) => {
      if (menuPerfilRef.current && !menuPerfilRef.current.contains(e.target)) {
        setMenuPerfilAberto(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuPerfilAberto]);

  useEffect(() => {
    const atualizarDia = () => {
      const hoje = toDateStr(new Date());
      setDiaCalendario((prev) => (prev !== hoje ? hoje : prev));
    };
    atualizarDia();
    const id = setInterval(atualizarDia, 60_000);
    document.addEventListener("visibilitychange", atualizarDia);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", atualizarDia);
    };
  }, []);

  useEffect(() => {
    let unVagas = () => {};
    if (escutaVagasFirestore) {
      unVagas = listenVagasByAtendimentoDates(listenDates, (next) => {
        setVagasMap((prev) => (vagasOcupacaoIguaisParaUI(prev, next) ? prev : next));
      });
    }
    const unProf = listenProfissionais((next) => {
      setProfissionaisMap((prev) => (profissionaisMapIgual(prev, next) ? prev : next));
    });
    const unSet = listenSettings((next) => {
      setSettings((prev) => (settingsIguaisParaDashboard(prev, next) ? prev : next));
    });

    return () => {
      unVagas();
      unProf();
      unSet();
    };
  }, [listenDates, escutaVagasFirestore]);

  useEffect(() => {
    if (!isRecepcao || !perfil?.telefoneWhatsapp) return;
    const digits = String(perfil.telefoneWhatsapp).replace(/\D/g, "");
    if (digits.length < 10) return;
    const first = perfil.nome?.trim().split(/\s+/)[0] || "Recepção";
    updateSettings({
      recepcionistaAtivoWhatsapp: digits,
      recepcionistaAtivoNome: first,
      ultimoRecepcionistaWhatsapp: digits,
      ultimoRecepcionistaNome: first,
    }).catch(() => {});
  }, [isRecepcao, perfil?.id, perfil?.telefoneWhatsapp, perfil?.nome]);

  useEffect(() => {
    if (!isRecepcao) return;
    limparSuspensoesExpiradasSeNecessario(settings, diaCalendario).catch((e) =>
      console.error("limparSuspensoesExpiradas", e)
    );
  }, [isRecepcao, diaCalendario, settings.atendimentoSuspensoPorSpec, settings.atendimentoSuspensoSlots]);

  useEffect(() => {
    if (!modal?.reservaFirestoreVagaId || !user?.uid) return undefined;
    const id = modal.reservaFirestoreVagaId;
    const uid = user.uid;
    return () => {
      if (manterReservaAoFecharModalRef.current) {
        manterReservaAoFecharModalRef.current = false;
        return;
      }
      liberarReservaSolicitacaoAgente(id, uid).catch(() => {});
    };
  }, [modal?.reservaFirestoreVagaId, user?.uid]);

  const handleAbrirFilePicker = () => {
    setMenuPerfilAberto(false);
    fileInputRef.current?.click();
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    e.target.value = "";
    setUploadandoFoto(true);
    try {
      const url = await uploadFotoPerfil(user.uid, file);
      await updateUser(user.uid, { fotoPerfil: url });
      setFotoPerfilLocal(url);
      showToast("Foto de perfil atualizada.", "success");
    } catch (err) {
      showToast(err?.message || "Não foi possível salvar a foto.", "danger");
    } finally {
      setUploadandoFoto(false);
    }
  };

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const abrirModalSolicitacao = useCallback(
    async (ctx) => {
      if (!isRecepcao && !estaDentroJanelaSolicitacaoAgendamento(ctx.windowType, new Date(), ctx.specKey)) {
        showToast(msgForaJanelaSolicitacaoAgendamento(ctx.windowType, ctx.specKey), "danger");
        return;
      }
      if (
        !isRecepcao &&
        ctx.windowType === "prev" &&
        ctx.podeAgendarPrev === false
      ) {
        showToast(
          msgForaDiaAgendamentoPrev(
            {
              key: ctx.specKey,
              agendaQualquerDiaUtil: ctx.agendaQualquerDiaUtil,
            },
            settings.profissionalConfigPorSpec || {}
          ),
          "danger"
        );
        return;
      }
      const id = vagaDocId(ctx.atendimentoDate, ctx.specKey, ctx.sessIdx);
      const total = sessionTotalEffective(ctx.dayKey, ctx.specKey, ctx.sessIdx, settings.pccuTotal, {
        atendimentoDateStr: ctx.atendimentoDate,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
        profissionalConfigPorSpec: settings.profissionalConfigPorSpec,
        atendimentoDiasTurnosPorSpec,
      });
      const meta = {
        atendimentoDate: ctx.atendimentoDate,
        specKey: ctx.specKey,
        sessIdx: ctx.sessIdx,
        dayKey: ctx.dayKey,
        total,
      };
      let liberarId = null;
      if (ctx.livresEncaixe === 1 && user?.uid) {
        const nomeReserva =
          perfil?.nome?.trim() || user?.displayName?.trim() || "Usuário";
        try {
          const r = await tryReservaSolicitacaoAgente(id, meta, {
            nome: nomeReserva,
            uid: user.uid,
          });
          if (!r.aplicouReserva) {
            showToast("Vaga indisponível. Atualize a tela.", "warning");
            return;
          }
          liberarId = id;
        } catch (e) {
          if (e?.code === "RESERVADA_OUTRO") {
            showToast(
              `Vaga reservada por ${e.outroNome || "outro usuário"}. Aguarde ou escolha outro horário.`,
              "warning"
            );
            return;
          }
          console.error(e);
          showToast(e?.message || "Não foi possível reservar a vaga. Tente de novo.", "danger");
          return;
        }
      }
      setModal({
        ...ctx,
        agenteNomeDefault: perfil?.nome ?? "",
        type: "agendar",
        reservaFirestoreVagaId: liberarId,
      });
    },
    [user, perfil, settings.pccuTotal, settings.dentQuartaVisitaDomiciliarDesde, settings.profissionalConfigPorSpec, atendimentoDiasTurnosPorSpec, isRecepcao]
  );

  const handleToggleAtendimentoEncerrado = useCallback(
    async (specKey, atendimentoDate, encerrar, turno) => {
      if (!isRecepcao) return;
      try {
        await setAtendimentoEncerradoFlag(specKey, atendimentoDate, encerrar, turno);
        showToast(
          encerrar
            ? "Aviso de encerramento enviado para agentes e direção."
            : "Aviso de encerramento removido.",
          "success"
        );
      } catch (e) {
        console.error(e);
        showToast("Não foi possível atualizar. Tente de novo.", "danger");
      }
    },
    [isRecepcao]
  );

  const handleSuspenderAtendimentoSpec = useCallback(
    async (specKey, payload) => {
      if (!isRecepcao) return;
      try {
        if (payload?.modo === "pontual") {
          await addAtendimentoSuspensoSlot(specKey, payload.data, payload.escopo, payload.motivo || "");
          showToast("Suspensão nesta data registrada.", "success");
        } else {
          await setSpecAtendimentoSuspenso(specKey, {
            desde: payload.desde,
            indefinido: payload.indefinido,
            ate: payload.ate,
          });
          showToast("Suspensão de agendamento registrada.", "success");
        }
      } catch (e) {
        console.error(e);
        showToast(e?.message || "Não foi possível suspender. Tente de novo.", "danger");
      }
    },
    [isRecepcao]
  );

  const handleRemoverSuspensaoPontual = useCallback(
    async (slotKey) => {
      if (!isRecepcao) return;
      try {
        await removeAtendimentoSuspensoSlot(slotKey);
        showToast("Suspensão pontual removida.", "success");
      } catch (e) {
        console.error(e);
        showToast("Não foi possível remover. Tente de novo.", "danger");
      }
    },
    [isRecepcao]
  );

  const handleReativarAtendimentoSpec = useCallback(
    async (specKey, diasSemana, atendimentoDiasTurnos) => {
      if (!isRecepcao) return;
      try {
        await clearSpecAtendimentoSuspenso(specKey, diasSemana);
        const prof = Object.values(profissionaisMap).find((p) => p.specKey === specKey || p.id === specKey);
        const norm = normalizeAtendimentoDiasTurnosParaSpec(specKey, atendimentoDiasTurnos || {});

        if (prof?.id) {
          if (norm && Object.keys(norm).length > 0) {
            await updateProfissional(prof.id, { atendimentoDiasTurnos: norm });
          } else {
            await updateProfissional(prof.id, { atendimentoDiasTurnos: deleteField() });
          }
          await updateSettings({
            atendimentoDiasTurnosPorSpec: { [specKey]: deleteField() },
          });
        } else if (norm && Object.keys(norm).length > 0) {
          await updateSettings({
            atendimentoDiasTurnosPorSpec: { [specKey]: norm },
          });
        } else {
          await updateSettings({
            atendimentoDiasTurnosPorSpec: { [specKey]: deleteField() },
          });
        }
        showToast("Atendimento reativado na agenda.", "success");
      } catch (e) {
        console.error(e);
        showToast("Não foi possível reativar. Tente de novo.", "danger");
      }
    },
    [isRecepcao, profissionaisMap]
  );

  const handleSlotAction = useCallback(
    async ({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, action, silent }) => {
      if (!isRecepcao) return;
      const {
        pccuTotal,
        dentQuartaVisitaDomiciliarDesde,
        profissionalConfigPorSpec,
        atendimentoDiasTurnosPorSpec: diasTurnosMap,
      } = settingsSlotRef.current;
      const total = sessionTotalEffective(dayKey, specKey, sessIdx, pccuTotal, {
        atendimentoDateStr: atendimentoDate,
        dentQuartaVisitaDomiciliarDesde,
        profissionalConfigPorSpec,
        atendimentoDiasTurnosPorSpec: diasTurnosMap,
      });
      if (!total) return;

      const id = vagaId || vagaDocId(atendimentoDate, specKey, sessIdx);
      const vdb = vagasMapRef.current[id] || {};
      let used = Number(vdb.used) || 0;
      let reserved = Number(vdb.reserved) || 0;
      const limparReservaSolicitacao = !!vdb.reservaSolicitacao;

      const livre = () => total - used - reserved;

      switch (action) {
        case "incOcupada":
          if (livre() <= 0) return;
          used += 1;
          break;
        case "decOcupada":
          used = Math.max(0, used - 1);
          break;
        case "incReserva":
          if (livre() <= 0) return;
          reserved += 1;
          break;
        case "decReserva":
          reserved = Math.max(0, reserved - 1);
          break;
        case "confirmarReserva":
          if (reserved <= 0 || used >= total) return;
          reserved -= 1;
          used += 1;
          break;
        default:
          return;
      }

      while (used + reserved > total) {
        if (reserved > 0) reserved -= 1;
        else used -= 1;
      }

      await setVaga(id, {
        atendimentoDate,
        specKey,
        sessIdx,
        dayKey,
        used,
        reserved,
        total,
        ...(limparReservaSolicitacao ? { reservaSolicitacao: deleteField() } : {}),
      });

      const nomeProf = profNamesRef.current[specKey] || specKey;

      if (used + reserved >= total) {
        await registrarNotificacaoVagasEsgotadas(specKey, nomeProf);
        if (!silent) {
          showToast(`Vagas esgotadas — ${nomeProf}. Agentes notificados.`, "danger");
        }
      } else if (!silent) {
        if (action === "incOcupada" || action === "confirmarReserva") {
          showToast("Vaga confirmada.", "success");
        } else if (action === "incReserva") {
          showToast("Vaga reservada (em confirmação).", "success");
        } else if (action === "decOcupada" || action === "decReserva") {
          showToast("Atualizado.", "info");
        }
      }
    },
    [isRecepcao]
  );

  const handleEnviarSolicit = useCallback(
    async ({
      specKey,
      dayKey,
      sessIdx,
      sessLabel,
      atendimentoDate,
      windowType,
      solicitacaoEncaminhamentoObrigatorio,
      somenteEncaixe,
      pccuOnly,
      livresEncaixe,
      paciente,
      dataNascimentoPaciente,
      documentoPaciente,
      telefonePaciente,
      nomeAgenteSaude,
      observacaoExtra,
      medicoTipo,
      coletaExamesRotina,
      docFile,
      docFiles,
      cartaoSusFile,
      whatsappBlankWindow,
      podeAgendarPrev,
      agendaQualquerDiaUtil,
    }) => {
      const fecharPreAbaWa = () => {
        try {
          if (whatsappBlankWindow && !whatsappBlankWindow.closed) whatsappBlankWindow.close();
        } catch {
          /* ignore */
        }
      };

      const permiteRecepcaoFisio = specKey === "fisio";
      if (isRecepcao && !permiteRecepcaoFisio) {
        fecharPreAbaWa();
        showToast("Use os botões de ocupação e reserva nos cartões.", "danger");
        return;
      }
      if (!isRecepcao && !estaDentroJanelaSolicitacaoAgendamento(windowType, new Date(), specKey)) {
        fecharPreAbaWa();
        showToast(msgForaJanelaSolicitacaoAgendamento(windowType, specKey), "danger");
        return;
      }
      if (!isRecepcao && windowType === "prev" && podeAgendarPrev === false) {
        fecharPreAbaWa();
        showToast(
          msgForaDiaAgendamentoPrev(
            { key: specKey, agendaQualquerDiaUtil },
            settings.profissionalConfigPorSpec || {}
          ),
          "danger"
        );
        return;
      }
      const { digits: waDigits, destino: waDestino } = resolveWhatsappDestinoSolicitacao(settings, {
        somenteEncaixe,
        isDiretor,
      });
      if (waDigits.length < 10) {
        fecharPreAbaWa();
        showToast(
          waDestino === "direcao"
            ? "WhatsApp da direção não cadastrado. Configure em Config. → Usuários."
            : "WhatsApp da recepção não cadastrado. Configure em Config. → Usuários.",
          "danger"
        );
        return;
      }
      const toastWaEnviado =
        waDestino === "direcao"
          ? "WhatsApp aberto. Envie para a direção."
          : "WhatsApp aberto. Envie para a recepção.";

      const meta = SPEC_META[specKey] || {};
      const nomeProf = profNames[specKey] || specKey;
      const funcao = meta.role || "";
      const profissionalLinha =
        funcao && nomeProf !== funcao ? `${nomeProf} (${funcao})` : nomeProf;
      const solicitacaoColetaExames =
        coletaExamesRotina === true ||
        (specKey === "tecnicoEnfermagem" && /\bcoleta de exames\b/i.test(String(sessLabel || "")));

      const encaminhamentoFisio = solicitacaoEncaminhamentoObrigatorio === true || specKey === "fisio";
      if (encaminhamentoFisio) {
        if (!docFile) {
          fecharPreAbaWa();
          showToast("A foto do encaminhamento é obrigatória.", "danger");
          return;
        }
        let fotoDocumentoUrl = "";
        try {
          fotoDocumentoUrl = await uploadDocumentoPacienteSolicitacao(docFile);
        } catch (e) {
          console.error(e);
          const msgErro = String(e?.message || "");
          if (/failed to fetch/i.test(msgErro)) {
            throw new Error(
              "Não foi possível enviar a imagem (falha de conexão com o Firebase Storage). Verifique internet, configuração do Firebase e regras do bucket."
            );
          }
          throw new Error(
            msgErro ||
              "Não foi possível enviar a imagem. Verifique o Firebase Storage, as regras e a conexão."
          );
        }
        const msg = montarMensagemSolicitacaoWhatsApp({
          solicitacaoFisioEncaminhamento: true,
          profissionalLinha,
          sessLabel,
          atendimentoDate,
          medicoTipo,
          paciente: paciente?.trim() || "",
          documentoPaciente: documentoPaciente?.trim() || "",
          telefonePaciente: telefonePaciente || "",
          nomeAgenteSaude: nomeAgenteSaude?.trim() || "",
          observacaoExtra: observacaoExtra?.trim() || "",
          fotoDocumentoUrl,
        });
        if (whatsappBlankWindow) {
          abrirWhatsAppNavegandoJanela(whatsappBlankWindow, waDigits, msg);
        } else {
          abrirWhatsAppComTexto(waDigits, msg);
        }
        showToast(toastWaEnviado, "success");
        return;
      }

      if (solicitacaoColetaExames) {
        const arquivos =
          Array.isArray(docFiles) && docFiles.length
            ? docFiles
            : docFile
              ? [docFile]
              : [];
        if (!arquivos.length) {
          fecharPreAbaWa();
          showToast("Anexe ao menos uma foto do pedido de exame.", "danger");
          return;
        }
        let cartaoSusUrl = "";
        let fotoDocumentoUrls = [];
        try {
          [cartaoSusUrl, fotoDocumentoUrls] = await Promise.all([
            cartaoSusFile
              ? uploadDocumentoPacienteSolicitacao(cartaoSusFile)
              : Promise.resolve(""),
            uploadDocumentosPacienteSolicitacao(arquivos),
          ]);
        } catch (e) {
          console.error(e);
          const msgErro = String(e?.message || "");
          if (/failed to fetch/i.test(msgErro)) {
            throw new Error(
              "Não foi possível enviar as imagens (falha de conexão com o Firebase Storage). Verifique internet, configuração do Firebase e regras do bucket."
            );
          }
          throw new Error(
            msgErro ||
              "Não foi possível enviar as imagens. Verifique o Firebase Storage, as regras e a conexão."
          );
        }
        const msg = montarMensagemSolicitacaoWhatsApp({
          solicitacaoColetaExames: true,
          profissionalLinha,
          sessLabel,
          atendimentoDate,
          medicoTipo,
          paciente: paciente?.trim() || "",
          dataNascimentoIso: dataNascimentoPaciente || "",
          documentoPaciente: documentoPaciente || "",
          cartaoSusUrl,
          observacaoExtra: observacaoExtra?.trim() || "",
          fotoDocumentoUrls,
        });
        if (whatsappBlankWindow) {
          abrirWhatsAppNavegandoJanela(whatsappBlankWindow, waDigits, msg);
        } else {
          abrirWhatsAppComTexto(waDigits, msg);
        }
        showToast(toastWaEnviado, "success");
        return;
      }

      let fotoDocumentoUrl = "";
      if (docFile) {
        try {
          fotoDocumentoUrl = await uploadDocumentoPacienteSolicitacao(docFile);
        } catch (e) {
          console.error(e);
          const msgErro = String(e?.message || "");
          if (/failed to fetch/i.test(msgErro)) {
            throw new Error(
              "Não foi possível enviar a imagem (falha de conexão com o Firebase Storage). Verifique internet, configuração do Firebase e regras do bucket."
            );
          }
          throw new Error(
            msgErro ||
              "Não foi possível enviar a imagem. Verifique o Firebase Storage, as regras e a conexão."
          );
        }
      }

      const nomePac =
        paciente?.trim() || (fotoDocumentoUrl ? "Paciente (documento em anexo)" : "");

      const msg = montarMensagemSolicitacaoWhatsApp({
        specKey,
        sessLabel,
        pccuOnly: pccuOnly === true,
        livresEncaixe: typeof livresEncaixe === "number" ? livresEncaixe : 0,
        profissionalLinha,
        atendimentoDate,
        medicoTipo,
        paciente: nomePac,
        dataNascimentoIso: dataNascimentoPaciente || "",
        documentoPaciente: documentoPaciente || "",
        observacaoExtra: observacaoExtra?.trim() || "",
        fotoDocumentoUrl: fotoDocumentoUrl || "",
        coletaExamesRotina: solicitacaoColetaExames,
        somenteEncaixe: somenteEncaixe === true,
      });

      if (whatsappBlankWindow) {
        abrirWhatsAppNavegandoJanela(whatsappBlankWindow, waDigits, msg);
      } else {
        abrirWhatsAppComTexto(waDigits, msg);
      }
      showToast(toastWaEnviado, "success");
    },
    [isRecepcao, isDiretor, profNames, settings, user]
  );

  const handleConfirmarVagaSolicitacao = useCallback(
    async ({ specKey, dayKey, sessIdx, atendimentoDate }) => {
      const {
        pccuTotal,
        dentQuartaVisitaDomiciliarDesde,
        profissionalConfigPorSpec,
        atendimentoDiasTurnosPorSpec: diasTurnosMap,
      } = settingsSlotRef.current;
      const total = sessionTotalEffective(dayKey, specKey, sessIdx, pccuTotal, {
        atendimentoDateStr: atendimentoDate,
        dentQuartaVisitaDomiciliarDesde,
        profissionalConfigPorSpec,
        atendimentoDiasTurnosPorSpec: diasTurnosMap,
      });

      const id = vagaDocId(atendimentoDate, specKey, sessIdx);
      const vdb = vagasMapRef.current[id] || {};
      let used = Number(vdb.used) || 0;
      let reserved = Number(vdb.reserved) || 0;
      const limparReservaSolicitacao = !!vdb.reservaSolicitacao;
      const livre = total ? total - used - reserved : 0;

      if (reserved > 0 && (!total || used < total)) {
        reserved -= 1;
        used += 1;
      } else if (livre > 0) {
        used += 1;
      } else {
        showToast("Não há vagas disponíveis para esta sessão.", "danger");
        manterReservaAoFecharModalRef.current = true;
        setModal(null);
        return;
      }

      if (total) {
        while (used + reserved > total) {
          if (reserved > 0) reserved -= 1;
          else used -= 1;
        }
      }

      try {
        await setVaga(id, {
          atendimentoDate,
          specKey,
          sessIdx,
          dayKey,
          used,
          reserved,
          ...(total ? { total } : {}),
          ...(limparReservaSolicitacao ? { reservaSolicitacao: deleteField() } : {}),
        });

        const nomeProf = profNamesRef.current[specKey] || specKey;

        if (total && used + reserved >= total) {
          await registrarNotificacaoVagasEsgotadas(specKey, nomeProf);
          showToast(`Vagas esgotadas — ${nomeProf}. Agentes notificados.`, "danger");
        } else {
          showToast("Vaga preenchida.", "success");
        }
      } catch (e) {
        console.error(e);
        showToast("Não foi possível preencher a vaga. Tente de novo.", "danger");
        throw e;
      }

      manterReservaAoFecharModalRef.current = true;
      setModal(null);
    },
    []
  );

  const allTabs = isRecepcao ? [...TABS_BASE, { key: "config", label: "Config." }] : TABS_BASE;

  const customSpecKeys = useMemo(
    () => listaSpecKeysCustom(profissionaisMap, settings.profissionalConfigPorSpec || {}),
    [profissionaisMap, settings.profissionalConfigPorSpec]
  );

  const specsVisiveis = useMemo(
    () =>
      buildVisibleSegments({
        today: new Date(),
        feriados: settings.feriados,
        pontosFacultativos: settings.pontosFacultativos,
        vagasMap,
        pccuTotal: settings.pccuTotal,
        recepcao: isRecepcao,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
        atendimentoSuspensoPorSpec: settings.atendimentoSuspensoPorSpec || {},
        atendimentoSuspensoSlots: settings.atendimentoSuspensoSlots || {},
        atendimentoDiasAtivosPorSpec: settings.atendimentoDiasAtivosPorSpec || {},
        atendimentoDiasTurnosPorSpec,
        specKeysDesativados: settings.specKeysDesativados || [],
        profissionalConfigPorSpec: settings.profissionalConfigPorSpec || {},
        customSpecKeys,
      }),
    [
      todayStr,
      settings.feriados,
      settings.pontosFacultativos,
      vagasMap,
      settings.pccuTotal,
      isRecepcao,
      settings.dentQuartaVisitaDomiciliarDesde,
      settings.atendimentoSuspensoPorSpec,
      settings.atendimentoSuspensoSlots,
      settings.atendimentoDiasAtivosPorSpec,
      atendimentoDiasTurnosPorSpec,
      settings.specKeysDesativados,
      settings.profissionalConfigPorSpec,
      customSpecKeys,
    ]
  );

  const avisosPreview = useMemo(
    () =>
      computeAvisosPreview({
        hojeStr: todayStr,
        isRecepcao,
        incluirAvisosOperacionais: isAgenteOuDiretorPerfil(perfil) || isRecepcaoPerfil(perfil),
        specs: specsVisiveis,
        profissionaisMap,
        profNames,
        feriados: settings.feriados,
        pontosFacultativos: settings.pontosFacultativos,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
        atendimentoEncerradoMap: settings.atendimentoEncerradoPorSpecData || {},
        atendimentoSuspensoPorSpec: settings.atendimentoSuspensoPorSpec || {},
        atendimentoSuspensoSlots: settings.atendimentoSuspensoSlots || {},
        atendimentoDiasAtivosPorSpec: settings.atendimentoDiasAtivosPorSpec || {},
        specKeysDesativados: settings.specKeysDesativados || [],
      }),
    [
      todayStr,
      isRecepcao,
      perfil,
      specsVisiveis,
      profissionaisMap,
      profNames,
      settings.feriados,
      settings.pontosFacultativos,
      settings.dentQuartaVisitaDomiciliarDesde,
      settings.atendimentoEncerradoPorSpecData,
      settings.atendimentoSuspensoPorSpec,
      settings.atendimentoSuspensoSlots,
      settings.atendimentoDiasAtivosPorSpec,
      settings.specKeysDesativados,
    ]
  );

  const avisosFingerprint = useMemo(
    () => avisosPreview.map((i) => `${i.badge}|${i.title}|${i.preview}`).join("§"),
    [avisosPreview]
  );

  const [avisosVistosFingerprint, setAvisosVistosFingerprint] = useState(
    () => localStorage.getItem("avisosVistosFingerprint") || ""
  );

  const avisosPreviewVisivel = avisosFingerprint !== avisosVistosFingerprint ? avisosPreview : [];

  const handleNavigateToAvisos = useCallback(() => {
    localStorage.setItem("avisosVistosFingerprint", avisosFingerprint);
    setAvisosVistosFingerprint(avisosFingerprint);
    setTab("avisos");
  }, [avisosFingerprint]);

  return (
    <div style={styles.app}>
      <header style={styles.hdr}>
        <div style={styles.hdrLeft}>
          <AppLogo size={32} title="Agendamentos UBS São João" />
          <div>
            <h1 style={styles.hdrTitle}>Agendamentos UBS São João</h1>
            <p style={styles.hdrSub}>
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>
        <div style={styles.hdrRight}>
          <div ref={menuPerfilRef} style={{ position: "relative" }}>
            <button
              onClick={() => setMenuPerfilAberto((v) => !v)}
              style={styles.avatarBtn}
              disabled={uploadandoFoto}
              aria-label="Menu do perfil"
            >
              {fotoAtual ? (
                <img src={fotoAtual} alt="Foto de perfil" style={styles.avatarImg} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              )}
            </button>
            {menuPerfilAberto && (
              <div style={styles.dropdown}>
                <button onClick={handleAbrirFilePicker} style={styles.dropdownItem}>
                  {fotoAtual ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
                </button>
                <div style={styles.dropdownDivider} />
                <button onClick={logout} style={{ ...styles.dropdownItem, color: "#DC2626" }}>
                  Sair
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFotoChange}
          />
        </div>
      </header>

      <nav style={styles.nav}>
        {allTabs.map((t) => (
          <button
            key={t.key}
            style={{ ...styles.navBtn, ...(tab === t.key ? styles.navBtnActive : {}) }}
            onClick={() => setTab(t.key)}
          >
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              {t.label}
              {t.key === "avisos" && avisosPreview.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -9,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#EF4444",
                    border: "1.5px solid #fff",
                    flexShrink: 0,
                  }}
                />
              )}
            </span>
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {tab === "vagas" && (
          <TabVagas
            specs={specsVisiveis}
            profissionaisMap={profissionaisMap}
            isRecepcao={isRecepcao}
            onSlotAction={handleSlotAction}
            atendimentoEncerradoMap={settings.atendimentoEncerradoPorSpecData || {}}
            onToggleAtendimentoEncerrado={
              isRecepcao ? handleToggleAtendimentoEncerrado : undefined
            }
            atendimentoSuspensoPorSpec={settings.atendimentoSuspensoPorSpec || {}}
            atendimentoSuspensoSlots={settings.atendimentoSuspensoSlots || {}}
            specKeysDesativados={settings.specKeysDesativados || []}
            onSuspenderAtendimentoSpec={isRecepcao ? handleSuspenderAtendimentoSpec : undefined}
            onSolicitar={isRecepcao ? undefined : abrirModalSolicitacao}
            dentQuartaVisitaDomiciliarDesde={settings.dentQuartaVisitaDomiciliarDesde}
            profissionalConfigPorSpec={settings.profissionalConfigPorSpec || {}}
            usuarioUid={user?.uid ?? ""}
            isDiretor={isDiretor}
            avisosPreview={avisosPreviewVisivel}
            onNavigateToAvisos={handleNavigateToAvisos}
          />
        )}
        {tab === "avisos" && (
          <TabAvisos
            isRecepcao={isRecepcao}
            incluirAvisosOperacionais={isAgenteOuDiretorPerfil(perfil) || isRecepcaoPerfil(perfil)}
            specs={specsVisiveis}
            profissionaisMap={profissionaisMap}
            profNames={profNames}
            feriados={settings.feriados}
            pontosFacultativos={settings.pontosFacultativos}
            dentQuartaVisitaDomiciliarDesde={settings.dentQuartaVisitaDomiciliarDesde}
            atendimentoEncerradoMap={settings.atendimentoEncerradoPorSpecData || {}}
            atendimentoSuspensoPorSpec={settings.atendimentoSuspensoPorSpec || {}}
            atendimentoSuspensoSlots={settings.atendimentoSuspensoSlots || {}}
            atendimentoDiasAtivosPorSpec={settings.atendimentoDiasAtivosPorSpec || {}}
            specKeysDesativados={settings.specKeysDesativados || []}
            onRemoverSuspensaoPontual={isRecepcao ? handleRemoverSuspensaoPontual : undefined}
            onReativarAtendimentoSpec={isRecepcao ? handleReativarAtendimentoSpec : undefined}
          />
        )}
        {tab === "cronograma" && (
          <TabCronograma
            cronogramaUbs={settings.cronogramaUbs ?? cronogramaUbsVazio()}
            specKeysDesativados={settings.specKeysDesativados || []}
            profNames={profNames}
            podeEditar={podeEditarCronogramaUbs(perfil)}
            showToast={showToast}
          />
        )}
        {tab === "config" && isRecepcao && (
          <TabConfig
            profNames={profNames}
            profissionaisMap={profissionaisMap}
            profissionalConfigPorSpec={settings.profissionalConfigPorSpec || {}}
            specKeysDesativados={settings.specKeysDesativados || []}
            showToast={showToast}
            isRecepcao={isRecepcao}
          />
        )}
      </main>

      {modal && (
        <ModalAgendar
          ctx={modal}
          profNames={profNames}
          onSubmit={handleEnviarSolicit}
          onClose={() => setModal(null)}
          onConfirmarVaga={handleConfirmarVagaSolicitacao}
          onCancelarAposEnvio={() => setModal(null)}
          recepcaoWhatsappOk={digitosWhatsappRecepcaoParaSolicitacao(settings).length >= 10}
          direcaoEncaixeWhatsappOk={digitosWhatsappDirecaoEncaixeParaSolicitacao(settings).length >= 10}
          isDiretor={isDiretor}
          profissionalConfigPorSpec={settings.profissionalConfigPorSpec || {}}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

const styles = {
  app: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F8FAFC" },
  hdr: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 18px",
    background: "#fff",
    borderBottom: "1px solid #E2E8F0",
    boxShadow: "0 1px 6px rgba(15,23,42,0.07)",
    flexWrap: "wrap",
    gap: 10,
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  hdrLeft: { display: "flex", alignItems: "center", gap: 12 },
  hdrRight: { display: "flex", alignItems: "center", gap: 8 },
  hdrTitle: { fontSize: 15, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.01em" },
  hdrSub: { fontSize: 12, color: "#64748B", margin: "2px 0 0", textTransform: "capitalize" },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "2px solid #C7D2FE",
    background: "#EEF2FF",
    color: "#4338CA",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "50%",
    display: "block",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    boxShadow: "0 4px 20px rgba(15,23,42,0.12)",
    minWidth: 200,
    zIndex: 100,
    overflow: "hidden",
  },
  dropdownItem: {
    display: "block",
    width: "100%",
    padding: "10px 16px",
    background: "transparent",
    border: "none",
    textAlign: "left",
    fontSize: 14,
    color: "#334155",
    cursor: "pointer",
    fontWeight: 500,
  },
  dropdownDivider: {
    height: 1,
    background: "#F1F5F9",
    margin: "4px 0",
  },
  nav: {
    display: "flex",
    gap: 0,
    padding: "0 12px",
    background: "#fff",
    borderBottom: "1px solid #E2E8F0",
    overflowX: "auto",
    position: "sticky",
    top: 57,
    zIndex: 40,
  },
  navBtn: {
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 500,
    border: "none",
    borderBottom: "2.5px solid transparent",
    cursor: "pointer",
    background: "transparent",
    color: "#64748B",
    whiteSpace: "nowrap",
    borderRadius: 0,
    marginBottom: -1,
  },
  navBtnActive: {
    color: "#4338CA",
    fontWeight: 700,
    borderBottom: "2.5px solid #4F46E5",
    background: "transparent",
  },
  main: { flex: 1, padding: "18px 16px", overflowY: "auto" },
};
