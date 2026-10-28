import type { TextBox } from "./indexing";

/** Bound all four displayed corners, including vertical schedule headings. */
export function displayedTextBox(item: { str: string; width: number; height: number; transform: number[] }, viewport: number[]): TextBox {
  const t = item.transform;
  const angle = Math.atan2(viewport[1] * t[0] + viewport[3] * t[1], viewport[0] * t[0] + viewport[2] * t[1]);
  const x = viewport[0] * t[4] + viewport[2] * t[5] + viewport[4];
  const y = viewport[1] * t[4] + viewport[3] * t[5] + viewport[5];
  const scale = Math.hypot(viewport[0], viewport[1]);
  const dx = item.width * scale * Math.cos(angle), dy = item.width * scale * Math.sin(angle);
  const ux = item.height * scale * Math.sin(angle), uy = -item.height * scale * Math.cos(angle);
  const xs = [x, x + dx, x + ux, x + dx + ux], ys = [y, y + dy, y + uy, y + dy + uy];
  return { text: item.str.trim(), x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
