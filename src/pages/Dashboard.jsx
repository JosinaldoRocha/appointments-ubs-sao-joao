// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import AppLogo from "../components/AppLogo";
import { logout } from "../services/auth";
import {
  listenVagasByAtendimentoDates,
  listenVagasChangesByAtendimentoDatesSince,
  setVaga,
  listenProfissionais,
  registrarNotificacaoVagasEsgotadas,
  listenSettings,
  getVagasByAtendimentoDates,
  getProfissionaisSnapshot,
  getSettingsSnapshot,
  listenProfissionaisChangesSince,
  listenSettingsChangesSince,
  updateSettings,
  setAtendimentoEncerradoFlag,
  digitosWhatsappRecepcaoParaSolicitacao,
  tryReservaSolicitacaoAgente,
  liberarReservaSolicitacaoAgente,
  confirmarSolicitacaoOcupaVaga,
} from "../services/db";
import {
  buildVisibleSegments,
  vagaDocId,
  toDateStr,
  DEFAULT_PCCU_TOTAL,
  DEFAULT_PROF_NAMES,
  collectAtendimentoDatesForListener,
  SPEC_META,
  sessionTotalEffective,
  estaDentroExpedienteUbs,
  MSG_FORA_EXPEDIENTE_UBS,
  addDaysLocal,
  shouldShowAvisoVisitaDomiciliarAmanha,
  avisoSemAtendimentoUbAmanha,
} from "../services/scheduleConfig";
import { uploadDocumentoPacienteSolicitacao } from "../services/storageUpload";
import {
  montarMensagemSolicitacaoWhatsApp,
  abrirWhatsAppComTexto,
  abrirWhatsAppNavegandoJanela,
} from "../services/whatsappSolicitacao";
import TabVagas from "../components/TabVagas";
import TabConfig from "../components/TabConfig";
import ModalAgendar from "../components/ModalAgendar";
import Toast from "../components/Toast";
import { isRecepcaoPerfil, isAgenteOuDiretorPerfil } from "../utils/perfilRole";
import { loadDashboardDailySnapshot, saveDashboardDailySnapshot } from "../services/dailySyncCache";

const TABS = [{ key: "vagas", label: "Vagas" }];

export default function Dashboard() {
  const { perfil, user } = useAuth();
  const isRecepcao = isRecepcaoPerfil(perfil);

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
    ultimoRecepcionistaWhatsapp: "",
    ultimoRecepcionistaNome: "",
    atendimentoEncerradoPorSpecData: {},
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [syncMode, setSyncMode] = useState("syncing");

  const todayStr = toDateStr(new Date());
  const listenDates = useMemo(
    () =>
      collectAtendimentoDatesForListener(
        new Date(),
        settings.feriados,
        settings.pontosFacultativos
      ),
    [todayStr, settings.feriados, settings.pontosFacultativos]
  );

  const syncScopeKey = useMemo(() => {
    const uid = user?.uid || "anon";
    const role = isRecepcao ? "recepcao" : "agente-direcao";
    return `${uid}:${role}`;
  }, [user?.uid, isRecepcao]);

  useEffect(() => {
    let ativo = true;
    let unVagas = () => {};
    let unProf = () => {};
    let unSet = () => {};
    let fallbackAtivo = false;

    function ativarFallbackTempoReal() {
      if (fallbackAtivo) return;
      fallbackAtivo = true;
      setSyncMode("full");
      unVagas();
      unProf();
      unSet();
      unVagas = listenVagasByAtendimentoDates(listenDates, setVagasMap);
      unProf = listenProfissionais(setProfissionaisMap);
      unSet = listenSettings(setSettings);
      console.warn("Sincronização incremental indisponível. Usando listeners completos.");
    }

    async function initSync() {
      const cached = loadDashboardDailySnapshot(syncScopeKey, todayStr);
      let baseVagas = {};
      let baseProfissionais = {};
      let baseSettings = null;
      let syncFrom = 0;

      if (cached) {
        baseVagas = cached.vagasMap || {};
        baseProfissionais = cached.profissionaisMap || {};
        baseSettings = cached.settings || null;
        syncFrom = Number(cached.lastSyncAt) || 0;
      } else {
        const [vagasSnap, profSnap, settingsSnap] = await Promise.all([
          getVagasByAtendimentoDates(listenDates),
          getProfissionaisSnapshot(),
          getSettingsSnapshot(),
        ]);
        if (!ativo) return;
        baseVagas = vagasSnap.data || {};
        baseProfissionais = profSnap.data || {};
        baseSettings = settingsSnap;
        syncFrom = Math.max(vagasSnap.maxUpdatedAt || 0, profSnap.maxUpdatedAt || 0, settingsSnap._syncUpdatedAt || 0);
      }

      if (!ativo) return;
      setVagasMap(baseVagas);
      setProfissionaisMap(baseProfissionais);
      if (baseSettings) setSettings((prev) => ({ ...prev, ...baseSettings }));
      setLastSyncAt(syncFrom);
      setSyncMode("incremental");

      unVagas = listenVagasChangesByAtendimentoDatesSince(
        listenDates,
        syncFrom,
        ({ data, maxUpdatedAt }) => {
          setVagasMap((prev) => ({ ...prev, ...data }));
          setLastSyncAt((prev) => Math.max(prev, maxUpdatedAt || 0));
        },
        ativarFallbackTempoReal
      );
      unProf = listenProfissionaisChangesSince(
        syncFrom,
        ({ data, maxUpdatedAt }) => {
          setProfissionaisMap((prev) => ({ ...prev, ...data }));
          setLastSyncAt((prev) => Math.max(prev, maxUpdatedAt || 0));
        },
        ativarFallbackTempoReal
      );
      unSet = listenSettingsChangesSince(
        syncFrom,
        ({ data, maxUpdatedAt }) => {
          setSettings((prev) => ({ ...prev, ...data }));
          setLastSyncAt((prev) => Math.max(prev, maxUpdatedAt || 0));
        },
        ativarFallbackTempoReal
      );
    }

    initSync().catch((e) => console.error("Falha ao inicializar sincronização diária:", e));

    return () => {
      ativo = false;
      unVagas();
      unProf();
      unSet();
    };
  }, [listenDates, syncScopeKey, todayStr]);

  useEffect(() => {
    if (!syncScopeKey || !todayStr) return;
    const t = setTimeout(() => {
      saveDashboardDailySnapshot(syncScopeKey, {
        dayKey: todayStr,
        lastSyncAt,
        vagasMap,
        profissionaisMap,
        settings,
      });
    }, 150);
    return () => clearTimeout(t);
  }, [syncScopeKey, todayStr, lastSyncAt, vagasMap, profissionaisMap, settings]);

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
    if (!modal?.reservaFirestoreVagaId || !user?.uid) return undefined;
    const id = modal.reservaFirestoreVagaId;
    const uid = user.uid;
    return () => {
      liberarReservaSolicitacaoAgente(id, uid).catch(() => {});
    };
  }, [modal?.reservaFirestoreVagaId, user?.uid]);

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const abrirModalSolicitacao = useCallback(
    async (ctx) => {
      const id = vagaDocId(ctx.atendimentoDate, ctx.specKey, ctx.sessIdx);
      const total = sessionTotalEffective(ctx.dayKey, ctx.specKey, ctx.sessIdx, settings.pccuTotal, {
        atendimentoDateStr: ctx.atendimentoDate,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
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
            showToast("A última vaga não está mais disponível. Atualize a tela.", "warning");
            return;
          }
          liberarId = id;
        } catch (e) {
          if (e?.code === "RESERVADA_OUTRO") {
            showToast(
              `Última vaga reservada por ${e.outroNome || "outro profissional"}. Aguarde ou escolha outro horário.`,
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
    [user, perfil, settings.pccuTotal, settings.dentQuartaVisitaDomiciliarDesde]
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

  const handleSlotAction = useCallback(
    async ({ specKey, dayKey, sessIdx, atendimentoDate, action, silent }) => {
      if (!isRecepcao) return;
      const total = sessionTotalEffective(dayKey, specKey, sessIdx, settings.pccuTotal, {
        atendimentoDateStr: atendimentoDate,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
      });
      if (!total) return;

      const id = vagaDocId(atendimentoDate, specKey, sessIdx);
      const vdb = vagasMap[id] || {};
      let used = Number(vdb.used) || 0;
      let reserved = Number(vdb.reserved) || 0;

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
      });

      const nomeProf = profNames[specKey] || specKey;

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
    [
      isRecepcao,
      vagasMap,
      profNames,
      settings.pccuTotal,
      settings.dentQuartaVisitaDomiciliarDesde,
    ]
  );

  const handleEnviarSolicit = useCallback(
    async ({
      specKey,
      dayKey,
      sessIdx,
      sessLabel,
      atendimentoDate,
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
      docFile,
      whatsappBlankWindow,
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
        showToast("O fluxo de solicitar vaga é para agentes de saúde. Use os botões de ocupação e reserva nas vagas.", "danger");
        return;
      }
      if (!isRecepcao && !estaDentroExpedienteUbs(new Date())) {
        fecharPreAbaWa();
        showToast(MSG_FORA_EXPEDIENTE_UBS, "danger");
        return;
      }
      const waDigits = digitosWhatsappRecepcaoParaSolicitacao(settings);
      if (waDigits.length < 10) {
        fecharPreAbaWa();
        showToast(
          "Cadastre o WhatsApp do recepcionista em Config. → Usuários. O pedido será enviado para o recepcionista que estiver logado ou para o último que entrou no sistema.",
          "danger"
        );
        return;
      }

      const idVaga = vagaDocId(atendimentoDate, specKey, sessIdx);
      const totalSlots = sessionTotalEffective(dayKey, specKey, sessIdx, settings.pccuTotal, {
        atendimentoDateStr: atendimentoDate,
        dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
      });
      const metaVaga = {
        atendimentoDate,
        specKey,
        sessIdx,
        dayKey,
        total: totalSlots,
      };
      const deveConfirmarVagaNoFirestore =
        !isRecepcao &&
        typeof livresEncaixe === "number" &&
        livresEncaixe > 0 &&
        totalSlots > 0;

      const meta = SPEC_META[specKey] || {};
      const nomeProf = profNames[specKey] || specKey;
      const funcao = meta.role || "";
      const profissionalLinha =
        funcao && nomeProf !== funcao ? `${nomeProf} (${funcao})` : nomeProf;

      const runConfirm = async () => {
        if (!deveConfirmarVagaNoFirestore || !user?.uid) return;
        const r = await confirmarSolicitacaoOcupaVaga(idVaga, metaVaga, user.uid);
        if (r.esgotou) {
          try {
            await registrarNotificacaoVagasEsgotadas(specKey, nomeProf);
          } catch (e) {
            console.error(e);
          }
        }
      };

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
          throw new Error(
            e?.message ||
              "Não foi possível enviar a imagem. Verifique o Supabase Storage, as políticas e a conexão."
          );
        }
        try {
          await runConfirm();
        } catch (e) {
          fecharPreAbaWa();
          if (e?.code === "RESERVADA_OUTRO") {
            showToast(
              `Não foi possível confirmar — vaga em uso por ${e.outroNome || "outro profissional"}. Atualize a tela.`,
              "danger"
            );
            return;
          }
          if (e?.code === "VAGA_INDISPONIVEL") {
            showToast("Esta vaga não está mais disponível. Atualize a tela.", "danger");
            return;
          }
          console.error(e);
          showToast(e?.message || "Não foi possível confirmar a vaga.", "danger");
          return;
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
        showToast("WhatsApp aberto — envie a mensagem para a recepção.", "success");
        setModal(null);
        return;
      }

      let fotoDocumentoUrl = "";
      if (docFile) {
        try {
          fotoDocumentoUrl = await uploadDocumentoPacienteSolicitacao(docFile);
        } catch (e) {
          console.error(e);
          throw new Error(
            e?.message ||
              "Não foi possível enviar a imagem. Verifique o Supabase Storage, as políticas e a conexão."
          );
        }
      }

      try {
        await runConfirm();
      } catch (e) {
        fecharPreAbaWa();
        if (e?.code === "RESERVADA_OUTRO") {
          showToast(
            `Não foi possível confirmar — vaga em uso por ${e.outroNome || "outro profissional"}. Atualize a tela.`,
            "danger"
          );
          return;
        }
        if (e?.code === "VAGA_INDISPONIVEL") {
          showToast("Esta vaga não está mais disponível. Atualize a tela.", "danger");
          return;
        }
        console.error(e);
        showToast(e?.message || "Não foi possível confirmar a vaga.", "danger");
        return;
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
        somenteEncaixe: somenteEncaixe === true,
      });

      if (whatsappBlankWindow) {
        abrirWhatsAppNavegandoJanela(whatsappBlankWindow, waDigits, msg);
      } else {
        abrirWhatsAppComTexto(waDigits, msg);
      }
      showToast("WhatsApp aberto — envie a mensagem para a recepção.", "success");
      setModal(null);
    },
    [isRecepcao, profNames, settings, user]
  );

  const allTabs = isRecepcao
    ? [...TABS, { key: "config", label: "Config." }]
    : TABS;

  const specsVisiveis = buildVisibleSegments({
    today: new Date(),
    feriados: settings.feriados,
    pontosFacultativos: settings.pontosFacultativos,
    vagasMap,
    pccuTotal: settings.pccuTotal,
    recepcao: isRecepcao,
    dentQuartaVisitaDomiciliarDesde: settings.dentQuartaVisitaDomiciliarDesde,
  });

  const avisoVisitaDomiciliarAmanha = useMemo(() => {
    if (!isAgenteOuDiretorPerfil(perfil)) return null;
    if (!settings.dentQuartaVisitaDomiciliarDesde) return null;
    if (!shouldShowAvisoVisitaDomiciliarAmanha(todayStr, settings.dentQuartaVisitaDomiciliarDesde)) {
      return null;
    }
    const amanhaIso = addDaysLocal(todayStr, 1);
    const nomeDent = profNames.dentFernando || DEFAULT_PROF_NAMES.dentFernando;
    const dataFmt = new Date(amanhaIso + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return { nomeDent, dataFmt };
  }, [perfil, todayStr, settings.dentQuartaVisitaDomiciliarDesde, profNames]);

  const avisoSemAtendimentoAmanha = useMemo(() => {
    if (!isAgenteOuDiretorPerfil(perfil)) return null;
    const r = avisoSemAtendimentoUbAmanha(todayStr, settings.feriados, settings.pontosFacultativos);
    if (!r) return null;
    const dataFmt = new Date(r.iso + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return { ...r, dataFmt };
  }, [perfil, todayStr, settings.feriados, settings.pontosFacultativos]);

  const syncLabel = useMemo(() => {
    if (syncMode === "full") return "Modo completo (fallback)";
    if (syncMode === "incremental" && !lastSyncAt) return "Sincronizado";
    if (!lastSyncAt) return "Sincronizando...";
    const dt = new Date(lastSyncAt);
    if (Number.isNaN(dt.getTime())) return "Sincronizando...";
    return `Sincronizado às ${dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, [lastSyncAt, syncMode]);

  const syncBadgeStyle = useMemo(() => {
    if (syncMode === "full") {
      return {
        ...styles.syncBadge,
        color: "#92400E",
        background: "#FFFBEB",
        border: "1px solid #FCD34D",
      };
    }
    if (syncMode === "incremental") {
      return {
        ...styles.syncBadge,
        color: "#166534",
        background: "#ECFDF5",
        border: "1px solid #86EFAC",
      };
    }
    return styles.syncBadge;
  }, [syncMode]);

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
          <span style={syncBadgeStyle}>{syncLabel}</span>
          <span style={styles.perfilBadge}>{perfil?.nome?.split(" ")[0]}</span>
          <button style={styles.logoutBtn} onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <nav style={styles.nav}>
        {allTabs.map((t) => (
          <button
            key={t.key}
            style={{ ...styles.navBtn, ...(tab === t.key ? styles.navBtnActive : {}) }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {avisoVisitaDomiciliarAmanha && (
        <div style={styles.avisoVisitaDomiciliar} role="status">
          <strong>Aviso —</strong> amanhã ({avisoVisitaDomiciliarAmanha.dataFmt}), o{" "}
          {avisoVisitaDomiciliarAmanha.nomeDent} não terá atendimento na unidade pela manhã: estará
          realizando <strong>visitas domiciliares</strong>. A agenda de quarta-feira (manhã) permanece
          reservada para esse fim.
        </div>
      )}

      {avisoSemAtendimentoAmanha && (
        <div style={styles.avisoFeriadoAmanha} role="status">
          {avisoSemAtendimentoAmanha.eFeriado && avisoSemAtendimentoAmanha.ePontoFacultativo ? (
            <>
              <strong>Feriado e ponto facultativo —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) está
              cadastrado nas duas listas na UBS.{" "}
            </>
          ) : avisoSemAtendimentoAmanha.eFeriado ? (
            <>
              <strong>Feriado —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) é feriado na UBS.{" "}
            </>
          ) : (
            <>
              <strong>Ponto facultativo —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) é ponto
              facultativo na UBS.{" "}
            </>
          )}
          <strong>Não haverá atendimento agendado</strong> nesse dia.
        </div>
      )}

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
            onSolicitar={isRecepcao ? undefined : abrirModalSolicitacao}
            dentQuartaVisitaDomiciliarDesde={settings.dentQuartaVisitaDomiciliarDesde}
            usuarioUid={user?.uid ?? ""}
          />
        )}
        {tab === "config" && isRecepcao && (
          <TabConfig
            profNames={profNames}
            profissionaisMap={profissionaisMap}
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
          recepcaoWhatsappOk={digitosWhatsappRecepcaoParaSolicitacao(settings).length >= 10}
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
    padding: "10px 16px",
    background: "#fff",
    borderBottom: "0.5px solid #E2E8F0",
    flexWrap: "wrap",
    gap: 8,
  },
  hdrLeft: { display: "flex", alignItems: "center", gap: 10 },
  hdrRight: { display: "flex", alignItems: "center", gap: 8 },
  syncBadge: {
    fontSize: 11,
    color: "#1D4ED8",
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    padding: "4px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  hdrTitle: { fontSize: 14, fontWeight: 600, color: "#0F172A", margin: 0 },
  hdrSub: { fontSize: 11, color: "#64748B", margin: 0, textTransform: "capitalize" },
  perfilBadge: {
    fontSize: 12,
    color: "#475569",
    background: "#F1F5F9",
    padding: "4px 10px",
    borderRadius: 6,
  },
  logoutBtn: {
    fontSize: 12,
    color: "#DC2626",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
  },
  nav: {
    display: "flex",
    gap: 2,
    padding: "6px 12px",
    background: "#fff",
    borderBottom: "0.5px solid #E2E8F0",
    overflowX: "auto",
  },
  navBtn: {
    padding: "6px 14px",
    fontSize: 13,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "#64748B",
    borderRadius: 6,
    whiteSpace: "nowrap",
  },
  navBtnActive: { background: "#F1F5F9", color: "#0F172A", fontWeight: 600 },
  avisoVisitaDomiciliar: {
    margin: "0 12px 0",
    padding: "10px 14px",
    fontSize: 13,
    lineHeight: 1.45,
    color: "#1E3A5F",
    background: "linear-gradient(90deg, #DBEAFE 0%, #E0F2FE 100%)",
    border: "1px solid #93C5FD",
    borderRadius: 8,
  },
  avisoFeriadoAmanha: {
    margin: "8px 12px 0",
    padding: "10px 14px",
    fontSize: 13,
    lineHeight: 1.45,
    color: "#7C2D12",
    background: "linear-gradient(90deg, #FFEDD5 0%, #FEF3C7 100%)",
    border: "1px solid #FDBA74",
    borderRadius: 8,
  },
  main: { flex: 1, padding: 14, overflowY: "auto" },
};
