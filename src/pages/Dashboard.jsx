// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "../services/db";
import {
  buildVisibleSegments,
  vagaDocId,
  toDateStr,
  BASE_SCHEDULE,
  DEFAULT_PCCU_TOTAL,
  collectAtendimentoDatesForListener,
  SPEC_META,
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
import { isRecepcaoPerfil } from "../utils/perfilRole";

const TABS = [{ key: "vagas", label: "Vagas" }];

function sessionTotal(dayKey, specKey, sessIdx, pccuTotal) {
  const spec = BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey);
  const sess = spec?.sessions?.[sessIdx];
  if (!sess) return 0;
  if (sess.pccuOnly) return pccuTotal ?? sess.total ?? DEFAULT_PCCU_TOTAL;
  return sess.total;
}

export default function Dashboard() {
  const { perfil } = useAuth();
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
    fernandoForaUnidade: false,
    pccuTotal: DEFAULT_PCCU_TOTAL,
    recepcionistaAtivoWhatsapp: "",
    recepcionistaAtivoNome: "",
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const todayStr = toDateStr(new Date());
  const listenDates = useMemo(
    () => collectAtendimentoDatesForListener(new Date(), settings.fernandoForaUnidade),
    [todayStr, settings.fernandoForaUnidade]
  );

  useEffect(() => {
    const unVagas = listenVagasByAtendimentoDates(listenDates, setVagasMap);
    const unProf = listenProfissionais(setProfissionaisMap);
    const unSet = listenSettings(setSettings);
    return () => {
      unVagas();
      unProf();
      unSet();
    };
  }, [listenDates]);

  useEffect(() => {
    if (!isRecepcao || !perfil?.telefoneWhatsapp) return;
    const digits = String(perfil.telefoneWhatsapp).replace(/\D/g, "");
    if (digits.length < 10) return;
    const first = perfil.nome?.trim().split(/\s+/)[0] || "Recepção";
    updateSettings({
      recepcionistaAtivoWhatsapp: digits,
      recepcionistaAtivoNome: first,
    }).catch(() => {});
  }, [isRecepcao, perfil?.id, perfil?.telefoneWhatsapp, perfil?.nome]);

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const handleSlotAction = useCallback(
    async ({ specKey, dayKey, sessIdx, atendimentoDate, action, silent }) => {
      if (!isRecepcao) return;
      const total = sessionTotal(dayKey, specKey, sessIdx, settings.pccuTotal);
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
    [isRecepcao, vagasMap, profNames, settings.pccuTotal]
  );

  const handleEnviarSolicit = useCallback(
    async ({
      specKey,
      dayKey,
      sessIdx,
      sessLabel,
      atendimentoDate,
      solicitacaoEncaminhamentoObrigatorio,
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
      const waDigits = String(settings.recepcionistaAtivoWhatsapp || "").replace(/\D/g, "");
      if (waDigits.length < 10) {
        fecharPreAbaWa();
        showToast(
          "Cadastre o WhatsApp do recepcionista em Config. → Usuários e peça para ele abrir o app neste aparelho.",
          "danger"
        );
        return;
      }

      const meta = SPEC_META[specKey] || {};
      const nomeProf = profNames[specKey] || specKey;
      const funcao = meta.role || "";
      const profissionalLinha =
        funcao && nomeProf !== funcao ? `${nomeProf} (${funcao})` : nomeProf;

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

      const nomePac =
        paciente?.trim() || (fotoDocumentoUrl ? "Paciente (documento em anexo)" : "");

      const msg = montarMensagemSolicitacaoWhatsApp({
        profissionalLinha,
        sessLabel,
        atendimentoDate,
        medicoTipo,
        paciente: nomePac,
        dataNascimentoIso: dataNascimentoPaciente || "",
        documentoPaciente: documentoPaciente || "",
        observacaoExtra: observacaoExtra?.trim() || "",
        fotoDocumentoUrl: fotoDocumentoUrl || "",
      });

      if (whatsappBlankWindow) {
        abrirWhatsAppNavegandoJanela(whatsappBlankWindow, waDigits, msg);
      } else {
        abrirWhatsAppComTexto(waDigits, msg);
      }
      showToast("WhatsApp aberto — envie a mensagem para a recepção.", "success");
      setModal(null);
    },
    [isRecepcao, profNames, settings]
  );

  const allTabs = isRecepcao
    ? [...TABS, { key: "config", label: "Config." }]
    : TABS;

  const specsVisiveis = buildVisibleSegments({
    today: new Date(),
    feriados: settings.feriados,
    fernandoFora: settings.fernandoForaUnidade,
    vagasMap,
    pccuTotal: settings.pccuTotal,
  });

  return (
    <div style={styles.app}>
      <header style={styles.hdr}>
        <div style={styles.hdrLeft}>
          <AppLogo size={32} title="UBS Agendamentos" />
          <div>
            <h1 style={styles.hdrTitle}>UBS Agendamentos</h1>
            <p style={styles.hdrSub}>
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            {settings.feriados?.length > 0 && (
              <p style={styles.hdrHint}>
                {settings.feriados.length} feriado(s) cadastrado(s) — o dia útil de agendamento é
                calculado automaticamente.
              </p>
            )}
          </div>
        </div>
        <div style={styles.hdrRight}>
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

      <main style={styles.main}>
        {tab === "vagas" && (
          <TabVagas
            specs={specsVisiveis}
            profissionaisMap={profissionaisMap}
            isRecepcao={isRecepcao}
            onSlotAction={handleSlotAction}
            onSolicitar={
              isRecepcao
                ? undefined
                : (ctx) =>
                    setModal({
                      ...ctx,
                      agenteNomeDefault: perfil?.nome ?? "",
                      type: "agendar",
                    })
            }
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
          recepcaoWhatsappOk={
            String(settings.recepcionistaAtivoWhatsapp || "").replace(/\D/g, "").length >= 10
          }
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
  hdrTitle: { fontSize: 14, fontWeight: 600, color: "#0F172A", margin: 0 },
  hdrSub: { fontSize: 11, color: "#64748B", margin: 0, textTransform: "capitalize" },
  hdrHint: { fontSize: 10, color: "#0369A1", margin: "4px 0 0", maxWidth: 320 },
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
  main: { flex: 1, padding: 14, overflowY: "auto" },
};
