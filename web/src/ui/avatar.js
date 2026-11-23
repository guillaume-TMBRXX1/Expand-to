// Portraits des dirigeants en SVG : style « toy » (grosse tête, grands yeux), couvre-chef selon le profil.
const SKINS = ['#f3d2b5', '#e0b08a', '#c68b5e', '#8d5a3b'];
const INK = '#2b2b33';

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const HATS = {
  merchant: (c) => `<ellipse cx="32" cy="17" rx="22" ry="5" fill="#f1c95a"/><path d="M19 17 Q20 5 32 5 Q44 5 45 17 Z" fill="#f1c95a"/><rect x="19.5" y="12.5" width="25" height="4" rx="2" fill="${c}"/>`,
  scholar: (c) => `<path d="M14 21 Q14 6 32 6 Q50 6 50 21 Q44 14 32 14 Q20 14 14 21Z" fill="#6b4a35"/><circle cx="25" cy="27" r="6.5" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="27" r="6.5" fill="none" stroke="${INK}" stroke-width="2"/><path d="M31.5 27h1" stroke="${INK}" stroke-width="2"/><rect x="26" y="44" width="12" height="3" rx="1.5" fill="${c}"/>`,
  builder: (c) => `<path d="M15 19 Q15 5 32 5 Q49 5 49 19 Z" fill="#f2b632"/><rect x="12" y="17" width="40" height="5" rx="2.5" fill="#e0a21f"/><rect x="29" y="5" width="6" height="12" rx="3" fill="${c}"/>`,
  diplomat: (c) => `<path d="M15 20 Q15 6 32 6 Q49 6 49 20 Z" fill="${c}"/><rect x="30" y="18" width="24" height="4" rx="2" fill="${shade(c, -30)}"/><path d="M26 49 l6 3 l6 -3 l-6 -3 Z" fill="${c}"/>`,
  explorer: (c) => `<path d="M14 21 Q14 4 32 4 Q50 4 50 21 Z" fill="${c}"/><rect x="13" y="17" width="38" height="6" rx="3" fill="${shade(c, -25)}"/><circle cx="32" cy="4" r="4" fill="#fff"/>`,
};

export function avatarSVG({ color, profile = 'explorer', skin = 0, size = 40, title = '' }) {
  const sk = SKINS[skin % SKINS.length];
  const hat = (HATS[profile] || HATS.explorer)(color);
  const glasses = profile === 'scholar';
  const eyes = glasses
    ? `<circle cx="25" cy="27" r="4.6" fill="#fff"/><circle cx="39" cy="27" r="4.6" fill="#fff"/><circle cx="25.6" cy="27.6" r="2.2" fill="${INK}"/><circle cx="39.6" cy="27.6" r="2.2" fill="${INK}"/>`
    : `<ellipse cx="25" cy="27" rx="5" ry="5.6" fill="#fff"/><ellipse cx="39" cy="27" rx="5" ry="5.6" fill="#fff"/><circle cx="25.8" cy="28" r="2.5" fill="${INK}"/><circle cx="39.8" cy="28" r="2.5" fill="${INK}"/><path d="M20 20.5 q5 -2 9 0 M35 20.5 q5 -2 9 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${title}">
    <rect width="64" height="64" rx="16" fill="${shade(color, 70)}"/>
    <path d="M12 64 Q12 46 32 46 Q52 46 52 64 Z" fill="${color}"/>
    <path d="M28 46 v6 M36 46 v6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="13.5" cy="29" r="4" fill="${sk}"/><circle cx="50.5" cy="29" r="4" fill="${sk}"/>
    <circle cx="32" cy="28" r="18" fill="${sk}"/>
    ${eyes}
    <ellipse cx="32" cy="34" rx="3" ry="2.4" fill="${shade(sk, -25)}"/>
    <path d="M27 39.5 q5 3.5 10 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${hat}
  </svg>`;
}
