// src/components/Toast.jsx
const TONES = {
  info:    { accent: "#6366F1", icon: "ℹ", bg: "#fff" },
  success: { accent: "#16A34A", icon: "✓", bg: "#fff" },
  danger:  { accent: "#DC2626", icon: "✕", bg: "#fff" },
  warning: { accent: "#D97706", icon: "⚠", bg: "#fff" },
};

export default function Toast({ msg, type = "info" }) {
  const t = TONES[type] || TONES.info;
  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: t.bg,
      borderLeft: `4px solid ${t.accent}`,
      border: `1px solid #E2E8F0`,
      borderLeftColor: t.accent,
      color: "#1E293B",
      padding: "12px 18px 12px 14px",
      borderRadius: 10,
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 1.45,
      boxShadow: "0 8px 28px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.08)",
      zIndex: 200,
      maxWidth: "min(92vw, 400px)",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      animation: "toastSlideUp 0.2s ease",
    }}>
      <span style={{
        fontSize: 15,
        fontWeight: 700,
        color: t.accent,
        lineHeight: 1.45,
        flexShrink: 0,
        marginTop: 1,
      }}>
        {t.icon}
      </span>
      <span>{msg}</span>
    </div>
  );
}
