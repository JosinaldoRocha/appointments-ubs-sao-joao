// src/components/Toast.jsx
export default function Toast({ msg, type = "info" }) {
  const colors = {
    info:    { bg: "#EFF6FF", border: "#93C5FD", text: "#1E40AF" },
    success: { bg: "#F0FDF4", border: "#86EFAC", text: "#166534" },
    danger:  { bg: "#FFF1F2", border: "#FDA4AF", text: "#9F1239" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E" },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
      boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 200,
      maxWidth: "90vw", textAlign: "center",
      animation: "fadeUp 0.2s ease",
    }}>
      {msg}
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
