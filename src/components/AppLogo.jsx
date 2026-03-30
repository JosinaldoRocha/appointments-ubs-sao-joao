// Ícone da UBS: calendário + cruz de saúde (mesmo asset que public/icons/app-icon.svg)
const ICON_SRC = `${process.env.PUBLIC_URL}/icons/app-icon.svg`;

export default function AppLogo({ size = 32, style, title }) {
  return (
    <img
      src={ICON_SRC}
      alt={title ?? ""}
      title={title}
      width={size}
      height={size}
      draggable={false}
      style={{ display: "block", flexShrink: 0, ...style }}
    />
  );
}
