// App icons for the installable web app / Android: a steel medallion with a gold crown over crossed swords.
// usage: node tools/make-icons.mjs  →  icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png, icons/apple-180.png
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const emblem = (pad) => `
  <g transform="translate(256 256) scale(${(1 - pad * 2).toFixed(3)}) translate(-256 -256)">
    <circle cx="256" cy="256" r="236" fill="url(#steel)" stroke="#07080a" stroke-width="10"/>
    <circle cx="256" cy="256" r="222" fill="none" stroke="url(#gold)" stroke-width="14"/>
    <circle cx="256" cy="256" r="204" fill="none" stroke="#07080a" stroke-width="4" opacity=".7"/>
    <circle cx="256" cy="270" r="150" fill="url(#glow)"/>
    ${[-1, 1].map(s => `
    <g transform="rotate(${s * 38} 256 300)">
      <path d="M244 110 L256 86 L268 110 L266 330 L246 330 Z" fill="url(#blade)" stroke="#20242a" stroke-width="3"/>
      <rect x="214" y="330" width="84" height="16" rx="6" fill="url(#gold)" stroke="#3b2a12" stroke-width="3"/>
      <rect x="248" y="346" width="16" height="52" rx="5" fill="#4a2f1b" stroke="#23160b" stroke-width="3"/>
      <circle cx="256" cy="408" r="13" fill="url(#gold)" stroke="#3b2a12" stroke-width="3"/>
    </g>`).join('')}
    <path d="M150 238 L178 150 L216 200 L256 128 L296 200 L334 150 L362 238 Z" fill="url(#gold)" stroke="#3b2a12" stroke-width="6" stroke-linejoin="round"/>
    <rect x="150" y="236" width="212" height="36" rx="6" fill="url(#gold)" stroke="#3b2a12" stroke-width="6"/>
    ${[178, 256, 334].map((x, i) => `<circle cx="${x}" cy="${[150, 128, 150][i]}" r="11" fill="#f6dc98" stroke="#3b2a12" stroke-width="4"/>`).join('')}
    <circle cx="256" cy="254" r="10" fill="#b8243a" stroke="#3b2a12" stroke-width="3"/>
    <circle cx="206" cy="254" r="7" fill="#2f5fb0" stroke="#3b2a12" stroke-width="3"/>
    <circle cx="306" cy="254" r="7" fill="#2f5fb0" stroke="#3b2a12" stroke-width="3"/>
  </g>`;

const svg = (bg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="steel" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#4a4f57"/><stop offset=".6" stop-color="#23262b"/><stop offset="1" stop-color="#0e0f11"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".45" stop-color="#e2b65e"/><stop offset="1" stop-color="#8a6424"/></linearGradient>
    <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa3ad"/><stop offset=".5" stop-color="#f1f4f7"/><stop offset="1" stop-color="#7d858e"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f6dc98" stop-opacity=".28"/><stop offset="1" stop-color="#f6dc98" stop-opacity="0"/></radialGradient>
  </defs>
  ${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''}
  ${emblem(pad)}
</svg>`;

mkdirSync('icons', { recursive: true });
const make = (bg, pad, size, file) => sharp(Buffer.from(svg(bg, pad))).resize(size, size).png().toFile('icons/' + file);
await make(null, 0, 192, 'icon-192.png');
await make(null, 0, 512, 'icon-512.png');
await make('#101114', 0.1, 512, 'maskable-512.png'); // maskable: the emblem inside the safe circle on a full background
await make('#101114', 0.04, 180, 'apple-180.png');
console.log('icons ready');
