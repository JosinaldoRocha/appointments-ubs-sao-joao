// src/pages/PainelVagas.jsx
// Tela pública (sem login), pensada para um tablet/celular fixo no balcão da recepção:
// alterna entre os profissionais configurados, mostrando a quantidade de vagas disponíveis
// para o próximo atendimento em tempo real. Em telas grandes (tablet ou computador) na
// horizontal, mostra dois profissionais ao mesmo tempo lado a lado (revezando o par a cada
// 10s); em celular ou tela pequena, mostra um por vez (revezando a cada 5s). Lê só o
// doc-espelho `settings/painelVagasPublico` (sem dados de paciente) — ver firestore.rules.
import { useEffect, useMemo, useRef, useState } from "react";
import { listenPainelVagasPublico } from "../services/db";
import {
  SPEC_META,
  DAY_LABEL,
  JS_DAY_TO_KEY,
  parseDateStr,
  addDaysLocal,
  toDateStr,
} from "../services/scheduleConfig";

/** Um profissional por vez: revezamento a cada 5s. */
const ALTERNANCIA_MS_UNICO = 5000;
/** Tela dividida (2 profissionais ao mesmo tempo): revezamento do par a cada 10s. */
const ALTERNANCIA_MS_SPLIT = 10000;
const STALE_TICK_MS = 15000;
const STALE_LIMIT_MS = 5 * 60 * 1000;
/** Telas grandes (tablet ou computador): menor lado ≥ 600px — exclui celulares mesmo deitados. */
const TELA_GRANDE_MIN_SIZE = 600;

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  useEffect(() => {
    function onResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return size;
}

/** "amanhã" quando for o caso; senão o dia da semana + data (ex.: "Segunda-feira (13/07)"). */
function formatDataAtendimentoLabel(dataStr) {
  if (!dataStr) return "amanhã";
  if (dataStr === addDaysLocal(toDateStr(new Date()), 1)) return "amanhã";
  const dow = JS_DAY_TO_KEY[parseDateStr(dataStr).getDay()];
  const diaSemana = DAY_LABEL[dow];
  const dataFormatada = new Date(dataStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  return diaSemana ? `${diaSemana} (${dataFormatada})` : dataFormatada;
}

function ConteudoItem({ item }) {
  const meta = SPEC_META[item.specKey] || {};
  const accent = meta.tc || "#0C447C";
  const label = formatDataAtendimentoLabel(item.atendimentoDate);

  const profissionalBlock = (
    <>
      <p style={{ ...S.profName, color: accent }}>{item.nome}</p>
      {meta.role && (
        <p style={{ ...S.profFuncao, background: meta.bg || "#EEF2FF", color: accent }}>
          {meta.role}
        </p>
      )}
    </>
  );

  if (item.livre == null) {
    return (
      <>
        <p style={S.statusText}>Sem atendimento previsto</p>
        {profissionalBlock}
      </>
    );
  }
  if (item.livre === 0) {
    return (
      <>
        <p style={S.statusText}>Vagas esgotadas para {label}</p>
        {profissionalBlock}
      </>
    );
  }
  return (
    <>
      <p style={{ ...S.bigNumber, color: accent }}>{item.livre}</p>
      <p style={S.subText}>
        {item.livre === 1 ? "vaga disponível" : "vagas disponíveis"} para {label}
      </p>
      {profissionalBlock}
    </>
  );
}

export default function PainelVagas() {
  const [mirror, setMirror] = useState({ ativo: false, itens: [], atualizadoEm: null });
  const [activeIndex, setActiveIndex] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wakeLockRef = useRef(null);
  const { width, height } = useViewportSize();

  useEffect(() => listenPainelVagasPublico(setMirror), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), STALE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const itensValidos = useMemo(
    () => (mirror.itens || []).filter((it) => it && it.specKey),
    [mirror.itens]
  );

  // Modo split: grupos de 2 em 2; se a quantidade for ímpar, o último grupo fica com 1
  // (sozinho, exibido em tela cheia, com a duração do modo único).
  const grupos = useMemo(() => {
    const out = [];
    for (let i = 0; i < itensValidos.length; i += 2) {
      out.push(
        i + 1 < itensValidos.length
          ? [itensValidos[i], itensValidos[i + 1]]
          : [itensValidos[i]]
      );
    }
    return out;
  }, [itensValidos]);

  const isLandscape = width > height;
  const isTelaGrande = Math.min(width, height) >= TELA_GRANDE_MIN_SIZE;
  const splitMode = isTelaGrande && isLandscape && itensValidos.length >= 2;

  useEffect(() => {
    setActiveIndex(0);
    setGroupIndex(0);
  }, [itensValidos.length]);

  // Modo único (um profissional por vez): revezamento fixo a cada 5s.
  useEffect(() => {
    if (splitMode) return;
    if (!mirror.ativo || itensValidos.length <= 1) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % itensValidos.length);
    }, ALTERNANCIA_MS_UNICO);
    return () => clearInterval(id);
  }, [mirror.ativo, itensValidos.length, splitMode]);

  // Modo split: revezamento por grupo, com duração de acordo com o tamanho do grupo atual
  // (par → 10s, o último sozinho quando ímpar → 5s).
  useEffect(() => {
    if (!splitMode) return;
    if (!mirror.ativo || grupos.length <= 1) return;
    const grupoAtual = grupos[groupIndex % grupos.length];
    const duracao = grupoAtual?.length === 1 ? ALTERNANCIA_MS_UNICO : ALTERNANCIA_MS_SPLIT;
    const id = setTimeout(() => {
      setGroupIndex((i) => (i + 1) % grupos.length);
    }, duracao);
    return () => clearTimeout(id);
  }, [mirror.ativo, splitMode, grupos, groupIndex]);

  useEffect(() => {
    async function reacquireWakeLock() {
      if (document.visibilityState === "visible" && engaged && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock?.request("screen");
        } catch {
          // sem suporte ou negado — degrada sem tela cheia/wake lock
        }
      }
    }
    document.addEventListener("visibilitychange", reacquireWakeLock);
    return () => document.removeEventListener("visibilitychange", reacquireWakeLock);
  }, [engaged]);

  const handleEngage = async () => {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // sem suporte — segue em viewport normal
    }
    try {
      // Em tela cheia, alguns navegadores (Chrome/Android) só acompanham a rotação física
      // do aparelho se isso for pedido explicitamente com lock("any") — unlock() sozinho
      // não é suficiente nesse modo.
      await screen.orientation?.lock?.("any");
    } catch {
      // sem suporte — segue com a orientação padrão do navegador
    }
    try {
      wakeLockRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      // sem suporte — recomenda-se desabilitar o bloqueio de tela no próprio tablet
    }
    setEngaged(true);
  };

  if (!engaged) {
    return (
      <div style={S.wrap}>
        <button style={S.engageBtn} onClick={handleEngage}>
          Iniciar exibição em tela cheia
        </button>
      </div>
    );
  }

  const atualizadoEmMs =
    mirror.atualizadoEm && typeof mirror.atualizadoEm.toMillis === "function"
      ? mirror.atualizadoEm.toMillis()
      : null;
  const stale = mirror.ativo && atualizadoEmMs != null && now - atualizadoEmMs > STALE_LIMIT_MS;

  if (!mirror.ativo) {
    return (
      <div style={S.wrap}>
        <p style={S.idleText}>Painel aguardando início pela recepção</p>
      </div>
    );
  }

  if (stale) {
    return (
      <div style={S.wrap}>
        <p style={S.idleText}>Atualizando informações...</p>
      </div>
    );
  }

  if (itensValidos.length === 0) {
    return (
      <div style={S.wrap}>
        <p style={S.idleText}>Painel aguardando configuração pela recepção</p>
      </div>
    );
  }

  if (splitMode) {
    const grupoAtual = grupos[groupIndex % grupos.length] || [];
    if (grupoAtual.length === 1) {
      // Sobra ímpar: exibido sozinho, em tela cheia, como no modo único.
      return (
        <div style={S.wrap}>
          <ConteudoItem item={grupoAtual[0]} />
        </div>
      );
    }
    const [itemA, itemB] = grupoAtual;
    return (
      <div style={S.splitWrap}>
        <div style={S.splitHalf}>
          <ConteudoItem item={itemA} />
        </div>
        <div style={S.splitDivider} />
        <div style={S.splitHalf}>
          <ConteudoItem item={itemB} />
        </div>
      </div>
    );
  }

  const item = itensValidos[activeIndex % itensValidos.length];
  const accent = SPEC_META[item.specKey]?.tc || "#0C447C";

  return (
    <div style={S.wrap}>
      {itensValidos.length > 1 && (
        <div style={S.dots}>
          {itensValidos.map((it, i) => (
            <span
              key={it.specKey}
              style={{
                ...S.dot,
                background: i === activeIndex % itensValidos.length ? accent : "#E2E8F0",
              }}
            />
          ))}
        </div>
      )}
      <ConteudoItem item={item} />
    </div>
  );
}

const S = {
  wrap: {
    position: "relative",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#F8FAFC",
    textAlign: "center",
    padding: "4vmin",
    boxSizing: "border-box",
  },
  splitWrap: {
    position: "relative",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    display: "flex",
    flexDirection: "row",
    background: "#F8FAFC",
  },
  splitHalf: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "4vmin 3vmin",
    boxSizing: "border-box",
  },
  splitDivider: {
    width: 3,
    height: "80%",
    alignSelf: "center",
    background: "#CBD5E1",
    borderRadius: 999,
    flexShrink: 0,
  },
  engageBtn: {
    fontSize: 28,
    fontWeight: 700,
    padding: "32px 48px",
    borderRadius: 16,
    border: "none",
    background: "#0C447C",
    color: "#fff",
    cursor: "pointer",
  },
  idleText: {
    fontSize: "min(8vmin, 32px)",
    fontWeight: 600,
    color: "#64748B",
  },
  bigNumber: {
    fontSize: "min(40vmin, 320px)",
    fontWeight: 800,
    lineHeight: 1,
    margin: 0,
  },
  subText: {
    fontSize: "min(7vmin, 48px)",
    fontWeight: 600,
    color: "#334155",
    marginTop: "2vmin",
  },
  statusText: {
    fontSize: "min(9vmin, 56px)",
    fontWeight: 700,
    color: "#B91C1C",
    maxWidth: "90vw",
  },
  profName: {
    fontSize: "min(10vmin, 64px)",
    fontWeight: 700,
    marginTop: "2vmin",
  },
  profFuncao: {
    fontSize: "min(7vmin, 44px)",
    fontWeight: 800,
    marginTop: "1.5vmin",
    padding: "0.5vmin 3vmin",
    borderRadius: 999,
    display: "inline-block",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dots: {
    position: "absolute",
    top: 24,
    display: "flex",
    gap: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
  },
};
