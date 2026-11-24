// Jeu d'icônes unique (trait 1.75, 24 px), partagé par la page cerveau.
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="M11.5 2.8a.6.6 0 0 1 1 0l2.6 5.3 5.9.9a.6.6 0 0 1 .3 1l-4.2 4.1 1 5.8a.6.6 0 0 1-.9.6L12 17.8l-5.3 2.7a.6.6 0 0 1-.8-.6l1-5.8-4.3-4.1a.6.6 0 0 1 .3-1l5.9-.9z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  external: '<path d="M7 17 17 7M8 7h9v9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};

export function icon(name, { filled = false, cls = 'ico' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls + (filled ? ' filled' : ''));
  svg.innerHTML = PATHS[name] || '';
  return svg;
}
