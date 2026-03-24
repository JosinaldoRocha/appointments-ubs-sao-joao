// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { logout } from "../services/auth";
import {
  listenVagasByAtendimentoDates,
  setVaga,
  listenSolicitacoes,
  criarSolicitacao,
  atualizarSolicitacao,
  listenListaEspera,
  adicionarEspera,
  removerEspera,
  listenProfissionais,
  registrarNotificacaoVagasEsgotadas,
  listenSettings,
  addAuditLog,
} from "../services/db";
import {
  buildVisibleSegments,
  vagaDocId,
  toDateStr,
  BASE_SCHEDULE,
  inferAtendimentoDateForDayKey,
  DEFAULT_PCCU_TOTAL,
  collectAtendimentoDatesForListener,
} from "../services/scheduleConfig";
import TabVagas from "../components/TabVagas";
import TabSolicit from "../components/TabSolicitacoes";
import TabEspera from "../components/TabEspera";
import TabConfig from "../components/TabConfig";
import ModalAgendar from "../components/ModalAgendar";
import Toast from "../components/Toast";

const TABS = [
  { key: "vagas", label: "Vagas" },
  { key: "solicitacoes", label: "Solicitações" },
  { key: "espera", label: "Lista de espera" },
];

function sessionTotal(dayKey, specKey, sessIdx, pccuTotal) {
  const spec = BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey);
  const sess = spec?.sessions?.[sessIdx];
  if (!sess) return 0;
  if (sess.pccuOnly) return pccuTotal ?? sess.total ?? DEFAULT_PCCU_TOTAL;
  return sess.total;
}

export default function Dashboard() {
  const { user, perfil } = useAuth();
  const isRecepcao = perfil?.role === "recepcao";
  const isDiretor = perfil?.role === "diretor";

  const [tab, setTab] = useState("vagas");
  const [vagasMap, setVagasMap] = useState({});
  const [solicit, setSolicit] = useState([]);
  const [espera, setEspera] = useState([]);
  const [profNames, setProfNames] = useState({});
  const [settings, setSettings] = useState({
    feriados: [],
    fernandoForaUnidade: false,
    pccuTotal: DEFAULT_PCCU_TOTAL,
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
    const unSol = listenSolicitacoes(setSolicit);
    const unEsp = listenListaEspera(setEspera);
    const unProf = listenProfissionais((data) => {
      const names = {};
      Object.entries(data).forEach(([k, v]) => {
        names[k] = v.nome;
      });
      setProfNames(names);
    });
    const unSet = listenSettings(setSettings);
    return () => {
      unVagas();
      unSol();
      unEsp();
      unProf();
      unSet();
    };
  }, [listenDates]);

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const logAudit = useCallback(
    async (tipo, detalhe, meta = {}) => {
      if (!isRecepcao || !user?.uid) return;
      try {
        await addAuditLog({
          tipo,
          detalhe,
          usuarioId: user.uid,
          usuarioNome: perfil?.nome || "",
          meta,
        });
      } catch {
        /* silencioso */
      }
    },
    [isRecepcao, user?.uid, perfil?.nome]
  );

  const handleSlotAction = useCallback(
    async ({ specKey, dayKey, sessIdx, atendimentoDate, action, silent }) => {
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
      const sessLabel =
        BASE_SCHEDULE[dayKey]?.specs.find((s) => s.key === specKey)?.sessions[sessIdx]?.label || "";

      await logAudit(`vaga_${action}`, `${nomeProf} · ${sessLabel} (${atendimentoDate})`, {
        atendimentoDate,
        specKey,
        dayKey,
        sessIdx,
        used,
        reserved,
        total,
      });

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
    [vagasMap, profNames, settings.pccuTotal, logAudit]
  );

  const handleSolicit = useCallback(
    async (id, status, specKey, dayKey, sessIdx, atendimentoDate) => {
      const att = atendimentoDate || inferAtendimentoDateForDayKey(dayKey);
      await atualizarSolicitacao(id, { status });
      if (status === "aprovado") {
        await handleSlotAction({
          specKey,
          dayKey,
          sessIdx,
          atendimentoDate: att,
          action: "incOcupada",
          silent: true,
        });
        showToast("Agendamento confirmado!", "success");
      } else {
        await logAudit("solicitacao_recusada", `Solicitação ${id}`, { solicitacaoId: id });
        showToast("Solicitação recusada.", "danger");
      }
    },
    [handleSlotAction, logAudit]
  );

  const handleEnviarSolicit = useCallback(
    async ({
      specKey,
      dayKey,
      sessIdx,
      sessLabel,
      atendimentoDate,
      paciente,
      telefone,
    }) => {
      await criarSolicitacao({
        paciente,
        telefone,
        agenteNome: perfil?.nome ?? "",
        agenteId: perfil?.id,
        specKey,
        dayKey,
        sessIdx,
        sessLabel,
        atendimentoDate,
        specNome: profNames[specKey] || specKey,
      });
      showToast("Solicitação enviada! Aguarde a confirmação da recepção.", "success");
      setModal(null);
    },
    [perfil, profNames]
  );

  const handleEspera = useCallback(
    async ({ paciente, telefone }) => {
      await adicionarEspera({
        paciente,
        telefone,
        agenteNome: perfil?.nome ?? "",
        agenteId: perfil?.id,
      });
      showToast("Paciente adicionado à lista de espera.", "success");
      setModal(null);
    },
    [perfil]
  );

  const pendentes = solicit.filter((s) => s.status === "pendente").length;
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
          <div style={styles.logo}>+</div>
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
            {t.key === "solicitacoes" && pendentes > 0 && (
              <span style={styles.badge}>{pendentes}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {tab === "vagas" && (
          <TabVagas
            specs={specsVisiveis}
            profNames={profNames}
            isRecepcao={isRecepcao}
            onSlotAction={handleSlotAction}
            onSolicitar={(ctx) => setModal({ type: "agendar", ...ctx })}
            onEspera={(ctx) => setModal({ type: "espera", ...ctx })}
          />
        )}
        {tab === "solicitacoes" && (
          <TabSolicit
            solicitacoes={solicit}
            profNames={profNames}
            isRecepcao={isRecepcao}
            onHandle={handleSolicit}
          />
        )}
        {tab === "espera" && (
          <TabEspera
            lista={espera}
            isRecepcao={isRecepcao}
            isAgente={!isRecepcao && !isDiretor}
            onRemover={removerEspera}
            onAdicionar={() => setModal({ type: "espera" })}
          />
        )}
        {tab === "config" && isRecepcao && (
          <TabConfig profNames={profNames} showToast={showToast} />
        )}
      </main>

      {modal && (
        <ModalAgendar
          ctx={modal}
          profNames={profNames}
          onSubmit={modal.type === "espera" ? handleEspera : handleEnviarSolicit}
          onClose={() => setModal(null)}
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
  logo: {
    width: 32,
    height: 32,
    background: "#E6F1FB",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    color: "#0C447C",
    fontWeight: 700,
  },
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
    position: "relative",
  },
  navBtnActive: { background: "#F1F5F9", color: "#0F172A", fontWeight: 600 },
  badge: {
    position: "absolute",
    top: 2,
    right: 4,
    minWidth: 16,
    height: 16,
    background: "#DC2626",
    color: "#fff",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 3px",
  },
  main: { flex: 1, padding: 14, overflowY: "auto" },
};
