/**
 * Favicon SVG Generator and DOM Updater
 *
 * 状態表現（中央コア点灯方式）：
 * - 待機中 (rec=0, enc=0): 中央コアがスタンバイグレー
 * - 録画中 (rec>0, enc=0): 中央コアが鮮烈な赤（RECランプ点灯）
 * - エンコード中 (rec=0, enc>0): 中央コアがグレー + 右上にグリーンバッジ
 * - 両方 (rec>0, enc>0): 中央コアが赤 + 右上にグリーンバッジ
 */

const DEFAULT_SVG_FAVICON = '/icon/favicon.svg';
const DEFAULT_PNG_FAVICON = '/icon/favicon.png';

/**
 * 録画中・エンコード中の状態に応じた Favicon SVG 文字列を生成する
 */
export function generateFaviconSvg(isRecording: boolean, isEncoding: boolean): string {
    // 中央コア（RECボタン）のグラデーション定義
    // 録画中は赤、待機中はスレートグレー
    const coreGrad = isRecording
        ? `
    <radialGradient id="epgdeck-core-grad" cx="38%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ff5252"/>
      <stop offset="85%" stop-color="#dc2626"/>
    </radialGradient>`
        : `
    <radialGradient id="epgdeck-core-grad" cx="38%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="85%" stop-color="#64748b"/>
    </radialGradient>`;

    // エンコード中バッジ（右上グリーン）
    const encBadge = isEncoding
        ? `
  <!-- ENC Badge: Green Dot (Right Top) -->
  <g id="favicon-enc-badge">
    <circle cx="106" cy="22" r="18" fill="#10b981" stroke="#ffffff" stroke-width="5"/>
    <circle cx="101" cy="17" r="5" fill="#ffffff" opacity="0.6"/>
  </g>`
        : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024" fill="none">
  <defs>
    <linearGradient id="epgdeck-blue-grad" x1="2" y1="2" x2="126" y2="126" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>${coreGrad}
  </defs>
  <!-- Edge-to-Edge Extra Bold Blue "D" Stroke (width=26, margin=2px) -->
  <path d="M15 15 H65 C91 15, 113 37, 113 64 C113 91, 91 113, 65 113 H15 Z" fill="none" stroke="url(#epgdeck-blue-grad)" stroke-width="26" stroke-linejoin="round"/>
  <!-- Center Core Circle (cx=60, r=30) -->
  <circle cx="60" cy="64" r="30" fill="url(#epgdeck-core-grad)"/>
  <ellipse cx="51" cy="55" rx="9.5" ry="5.5" transform="rotate(-30 51 55)" fill="#ffffff" opacity="0.45"/>
${encBadge}
</svg>`;
}

/**
 * DOM の <link rel="icon"> を更新する
 */
export function updateFavicon(svgContent: string | null): void {
    if (typeof document === 'undefined') return;

    const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");

    if (!svgContent) {
        // デフォルトアイコンに復帰
        links.forEach(link => {
            if (link.dataset.originalHref) {
                link.href = link.dataset.originalHref;
                delete link.dataset.originalHref;
            } else if (link.type === 'image/svg+xml') {
                link.href = DEFAULT_SVG_FAVICON;
            } else {
                link.href = DEFAULT_PNG_FAVICON;
            }
        });
        return;
    }

    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

    links.forEach(link => {
        if (!link.dataset.originalHref) {
            link.dataset.originalHref = link.href;
        }
        link.href = dataUrl;
    });

    if (links.length === 0) {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.type = 'image/svg+xml';
        newLink.href = dataUrl;
        document.head.appendChild(newLink);
    }
}
