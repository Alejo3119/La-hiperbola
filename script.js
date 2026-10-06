/* =========================================================
   El Universo de la Hipérbola — script.js
   Dibujo en Canvas, laboratorio, cálculos y minijuego
   ========================================================= */
'use strict';

/* Paleta centralizada: permite que los gráficos, etiquetas y estados del juego mantengan los mismos colores. */
const COLORS = {
  grid: 'rgba(120, 140, 255, 0.07)',
  gridMajor: 'rgba(120, 140, 255, 0.18)',
  axis: 'rgba(200, 210, 255, 0.55)',
  text: 'rgba(170, 185, 230, 0.75)',
  curve: '#00e5ff',
  asym: '#a855f7',
  rect: 'rgba(168, 85, 247, 0.45)',
  focus: '#ff3ea5',
  vertex: '#ffd23f',
  center: '#ffffff',
  target: '#ff9f1c',
  ok: '#22ff9a',
  bad: '#ff4d6d'
};

/* =========================================================
   1. UTILIDADES MATEMÁTICAS
   ========================================================= */
// Atajos para seleccionar elementos del HTML y reutilizarlos en el código.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Número con formato bonito (signo menos real, máx. 2 decimales) */
function num(n, dec = 2) {
  const f = 10 ** dec;
  let r = Math.round(n * f) / f;
  if (Object.is(r, -0)) r = 0;
  return (r < 0 ? '−' : '') + Math.abs(r);
}

/** Fracción reducida p/q con enteros */
function fraction(p, q) {
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  if (q < 0) { p = -p; q = -q; }
  return q === 1 ? `${p}` : `${p}/${q}`;
}

/** x/y como fracción exacta (x, y son múltiplos de 0.5) */
function ratio(x, y) {
  return fraction(Math.round(x * 2), Math.round(y * 2));
}

/** √N = k·√m */
function simplifySqrt(N) {
  for (let i = Math.floor(Math.sqrt(N)); i > 1; i--) {
    if (N % (i * i) === 0) return { k: i, m: N / (i * i) };
  }
  return { k: 1, m: N };
}

/** Forma exacta de √N / D (con aproximación decimal cuando hace falta) */
function radicalOver(N, D) {
  const { k, m } = simplifySqrt(N);
  const g = gcd(k, D);
  const p = k / g, q = D / g;
  const value = Math.sqrt(N) / D;
  let exact;
  if (m === 1) exact = q === 1 ? `${p}` : `${p}/${q}`;
  else exact = `${p === 1 ? '' : p}√${m}${q === 1 ? '' : '/' + q}`;
  const isInt = m === 1 && q === 1;
  return { exact, value, text: isInt ? exact : `${exact} ≈ ${value.toFixed(3)}` };
}

/** Todos los elementos geométricos de una hipérbola */
/* A partir de a, b, h, k y la orientación, calcula el centro, focos, vértices,
   pendiente de las asíntotas y demás datos necesarios para dibujar y explicar la figura. */
function geometry(p) {
  const H = p.orient === 'h';
  const c = Math.hypot(p.a, p.b);
  return {
    c,
    e: c / p.a,
    slope: H ? p.b / p.a : p.a / p.b,
    foci: H ? [[p.h + c, p.k], [p.h - c, p.k]] : [[p.h, p.k + c], [p.h, p.k - c]],
    vertices: H ? [[p.h + p.a, p.k], [p.h - p.a, p.k]] : [[p.h, p.k + p.a], [p.h, p.k - p.a]],
    rect: H ? { w: p.a, hgt: p.b } : { w: p.b, hgt: p.a }
  };
}

/** Puntos de las dos ramas (forma paramétrica con cosh / sinh) */
/* Genera muchos puntos de ambas ramas usando funciones hiperbólicas. Al unirlos,
   el canvas obtiene una curva suave en lugar de una figura formada por pocos segmentos. */
function branches(p, steps = 360) {
  const T = Math.acosh(Math.max(2, 40 / Math.min(p.a, p.b)));
  const res = [];
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = -T + (2 * T * i) / steps;
      const ch = Math.cosh(t), sh = Math.sinh(t);
      if (p.orient === 'h') pts.push([p.h + s * p.a * ch, p.k + p.b * sh]);
      else pts.push([p.h + p.b * sh, p.k + s * p.a * ch]);
    }
    res.push(pts);
  }
  return res;
}

/* =========================================================
   2. PLANO CARTESIANO EN CANVAS
   ========================================================= */
class Plane {
  constructor(canvas, range = 10) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = range;
    this.resize();
  }

  /* Ajusta la resolución interna al tamaño visible para que el dibujo se vea nítido
     tanto en pantallas normales como en pantallas de alta densidad. */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(r.width, 1);
    this.h = Math.max(r.height, 1);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(this.w, this.h) / (2 * this.range);
    this.ox = this.w / 2;
    this.oy = this.h / 2;
  }

  X(x) { return this.ox + x * this.scale; }
  Y(y) { return this.oy - y * this.scale; }
  toWorld(px, py) { return { x: (px - this.ox) / this.scale, y: (this.oy - py) / this.scale }; }

  drawGrid() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    const xMax = this.ox / this.scale, yMax = this.oy / this.scale;

    c.lineWidth = 1;
    for (let i = Math.ceil(-xMax); i <= xMax; i++) {
      c.strokeStyle = i % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
      c.beginPath(); c.moveTo(this.X(i) + 0.5, 0); c.lineTo(this.X(i) + 0.5, this.h); c.stroke();
    }
    for (let j = Math.ceil(-yMax); j <= yMax; j++) {
      c.strokeStyle = j % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
      c.beginPath(); c.moveTo(0, this.Y(j) + 0.5); c.lineTo(this.w, this.Y(j) + 0.5); c.stroke();
    }

    // Ejes
    c.strokeStyle = COLORS.axis;
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, this.oy); c.lineTo(this.w, this.oy); c.stroke();
    c.beginPath(); c.moveTo(this.ox, 0); c.lineTo(this.ox, this.h); c.stroke();

    // Números
    const step = this.scale < 22 ? 5 : 2;
    c.fillStyle = COLORS.text;
    c.font = '11px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let i = Math.ceil(-xMax); i <= xMax; i++) {
      if (i !== 0 && i % step === 0) c.fillText(num(i), this.X(i), this.oy + 5);
    }
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let j = Math.ceil(-yMax); j <= yMax; j++) {
      if (j !== 0 && j % step === 0) c.fillText(num(j), this.ox - 6, this.Y(j));
    }
    c.textAlign = 'left';
    c.fillText('x', this.w - 14, this.oy - 10);
    c.fillText('y', this.ox + 8, 12);
  }

  line(x1, y1, x2, y2, color, width = 1.5, dash = null) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.beginPath();
    c.moveTo(this.X(x1), this.Y(y1));
    c.lineTo(this.X(x2), this.Y(y2));
    c.stroke();
    c.restore();
  }

  polyline(pts, color, width = 2.5, glow = 0) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.beginPath();
    pts.forEach((p, i) => {
      const X = this.X(p[0]), Y = this.Y(p[1]);
      i ? c.lineTo(X, Y) : c.moveTo(X, Y);
    });
    c.stroke();
    c.restore();
  }

  circle(x, y, R, color, width = 1, dash = null) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.beginPath();
    c.arc(this.X(x), this.Y(y), R * this.scale, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  rect(x, y, w, h, color) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color.replace(/[\d.]+\)$/, '0.06)');
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    const X = this.X(x - w), Y = this.Y(y + h);
    c.fillRect(X, Y, 2 * w * this.scale, 2 * h * this.scale);
    c.strokeRect(X, Y, 2 * w * this.scale, 2 * h * this.scale);
    c.restore();
  }

  dot(x, y, color, r = 5, label = null) {
    const c = this.ctx;
    const X = this.X(x), Y = this.Y(y);
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 14;
    c.fillStyle = color;
    c.beginPath(); c.arc(X, Y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1.5;
    c.stroke();
    if (label) {
      c.font = '600 12px "JetBrains Mono", monospace';
      c.fillStyle = color;
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(label, X + 8, Y - 6);
    }
    c.restore();
  }
}

/* Dibuja la hipérbola completa con sus elementos */
/* Reúne el dibujo completo: curva, centro y, según las opciones activadas,
   rectángulo auxiliar, asíntotas, focos y vértices. */
function drawHyperbola(P, p, opts = {}) {
  const g = geometry(p);

  if (opts.rect) {
    P.rect(p.h, p.k, g.rect.w, g.rect.hgt, COLORS.rect);
    P.circle(p.h, p.k, g.c, 'rgba(255, 62, 165, 0.35)', 1, [2, 6]);
  }

  if (opts.asym) {
    const L = 200;
    const col = opts.asymColor || COLORS.asym;
    P.line(p.h - L, p.k - g.slope * L, p.h + L, p.k + g.slope * L, col, 1.5, [8, 6]);
    P.line(p.h - L, p.k + g.slope * L, p.h + L, p.k - g.slope * L, col, 1.5, [8, 6]);
  }

  branches(p).forEach((b) => P.polyline(b, opts.color || COLORS.curve, opts.width || 3, 16));

  P.dot(p.h, p.k, COLORS.center, 3.5, opts.labels ? 'C' : null);

  if (opts.vert) {
    g.vertices.forEach((v, i) => P.dot(v[0], v[1], COLORS.vertex, opts.small ? 3.5 : 5, opts.labels ? `V${i ? '₂' : '₁'}` : null));
  }
  if (opts.foci) {
    g.foci.forEach((f, i) => P.dot(f[0], f[1], COLORS.focus, opts.small ? 4 : 6, opts.labels ? `F${i ? '₂' : '₁'}` : null));
  }
  return g;
}

/* =========================================================
   3. CONTROLES (slider + campo numérico sincronizados)
   ========================================================= */
function paintFill(range) {
  const min = parseFloat(range.min), max = parseFloat(range.max);
  const pct = ((parseFloat(range.value) - min) / (max - min)) * 100;
  range.style.setProperty('--fill', `${pct}%`);
}

/* Mantiene sincronizados el deslizador y la caja numérica. Cada cambio actualiza
   el estado del laboratorio o juego y pide recalcular la información mostrada. */
function bindControl(prefix, key, state, onChange) {
  const range = document.getElementById(`${prefix}${key}-range`);
  const input = document.getElementById(`${prefix}${key}-num`);
  const step = parseFloat(range.step);

  const set = (value, silent = false) => {
    let v = parseFloat(value);
    if (Number.isNaN(v)) { input.value = state[key]; return; }
    v = Math.min(parseFloat(range.max), Math.max(parseFloat(range.min), v));
    v = Math.round(v / step) * step;
    state[key] = v;
    range.value = v;
    input.value = v;
    paintFill(range);
    if (!silent) onChange();
  };

  range.addEventListener('input', (e) => set(e.target.value));
  input.addEventListener('change', (e) => set(e.target.value));
  paintFill(range);
  return set;
}

function bindOrientation(group, state, onChange) {
  const buttons = $$(`[data-orient-group="${group}"] .seg`);
  const set = (orient, silent = false) => {
    state.orient = orient;
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.orient === orient));
    if (!silent) onChange();
  };
  buttons.forEach((b) => b.addEventListener('click', () => set(b.dataset.orient)));
  return set;
}

/* =========================================================
   4. LABORATORIO
   ========================================================= */
const LAB_DEFAULT = { orient: 'h', a: 3, b: 2, h: 0, k: 0 };
const lab = { ...LAB_DEFAULT };
const show = { asym: true, rect: true, foci: true, vert: true, focal: false };
let labPlane;
const labSetters = {};

/* Término (x − h)² con signos correctos */
function sqTerm(v, center) {
  if (Math.abs(center) < 1e-9) return `${v}²`;
  return `(${v} ${center > 0 ? '−' : '+'} ${num(Math.abs(center))})²`;
}
function linTerm(v, center) {
  if (Math.abs(center) < 1e-9) return v;
  return `${v} ${center > 0 ? '−' : '+'} ${num(Math.abs(center))}`;
}

function equationHTML(p) {
  const A = num(p.a * p.a), B = num(p.b * p.b);
  const X = sqTerm('x', p.h), Y = sqTerm('y', p.k);
  const [first, second] = p.orient === 'h' ? [X, Y] : [Y, X];
  return `<span class="frac"><span>${first}</span><span>${A}</span></span> −
          <span class="frac"><span>${second}</span><span>${B}</span></span> = 1`;
}

/* Convierte los parámetros actuales en explicaciones: ecuación, focos, vértices,
   asíntotas y medidas. Así los números visibles siempre corresponden al gráfico. */
function updateLabInfo() {
  const p = lab;
  const g = geometry(p);
  const H = p.orient === 'h';
  const N = Math.round(4 * (p.a * p.a + p.b * p.b));
  const cR = radicalOver(N, 2);
  const eR = radicalOver(N, Math.round(2 * p.a));

  // Ecuación
  $('#eqCanon').innerHTML = equationHTML(p);
  $('#eqType').textContent = H
    ? 'Hipérbola horizontal: sus ramas se abren a izquierda y derecha.'
    : 'Hipérbola vertical: sus ramas se abren hacia arriba y abajo.';

  // c
  $('#valC').textContent = `c = √(${num(p.a * p.a)} + ${num(p.b * p.b)}) = ${cR.text}`;

  // e
  $('#valE').textContent = `e = c/a = ${eR.text}`;
  $('#eMeter').style.width = `${Math.min(100, ((g.e - 1) / 3) * 100)}%`;
  $('#eNote').textContent = g.e < 1.3
    ? 'e cercana a 1 → ramas «cerradas», muy curvadas.'
    : g.e < 2 ? 'e intermedia → apertura moderada.'
    : 'e grande → ramas muy abiertas, casi rectas.';

  // Asíntotas
  const m = H ? ratio(p.b, p.a) : ratio(p.a, p.b);
  const mTxt = m === '1' ? '' : m.includes('/') ? `(${m})` : m;
  const xPart = Math.abs(p.h) < 1e-9 ? 'x' : `(${linTerm('x', p.h)})`;
  $('#valAsym').textContent = `${linTerm('y', p.k)} = ±${mTxt}${xPart}`;
  $('#asymNote').textContent = `Pendientes: ±${m}  (${H ? '±b/a' : '±a/b'})`;

  // Focos
  const hS = num(p.h), kS = num(p.k);
  $('#valFoci').textContent = H
    ? `(${Math.abs(p.h) < 1e-9 ? '' : hS + ' '}± ${cR.exact}, ${kS})`
    : `(${hS}, ${Math.abs(p.k) < 1e-9 ? '' : kS + ' '}± ${cR.exact})`;
  $('#fociNote').textContent = `F₁(${num(g.foci[0][0])}, ${num(g.foci[0][1])})   F₂(${num(g.foci[1][0])}, ${num(g.foci[1][1])})`;

  // Vértices
  $('#valVert').textContent = `V₁(${num(g.vertices[0][0])}, ${num(g.vertices[0][1])})  V₂(${num(g.vertices[1][0])}, ${num(g.vertices[1][1])})`;

  // Ejes y lado recto
  const lr = fraction(Math.round(8 * p.b * p.b), Math.round(4 * p.a));
  const lrTxt = lr.includes('/') ? `${lr} ≈ ${num(2 * p.b * p.b / p.a)}` : lr;
  $('#valAxes').innerHTML =
    `Eje transverso: 2a = <strong>${num(2 * p.a)}</strong><br>` +
    `Eje conjugado: 2b = <strong>${num(2 * p.b)}</strong><br>` +
    `Lado recto: 2b²/a = <strong>${lrTxt}</strong>`;

  // Pequeño destello visual en los valores
  ['#valC', '#valE', '#valAsym', '#valFoci'].forEach((id) => {
    const el = $(id);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  });
}

/* Se ejecuta repetidamente durante la animación. Dibuja el plano y, si se activa,
   muestra un punto P y sus distancias a los focos para ilustrar la propiedad focal. */
function drawLab(time) {
  const P = labPlane;
  P.drawGrid();
  const g = drawHyperbola(P, lab, { ...show, labels: true });

  // Propiedad focal animada
  if (show.focal) {
    const s = 1.5 * Math.sin(time / 1500);
    const pt = lab.orient === 'h'
      ? [lab.h + lab.a * Math.cosh(s), lab.k + lab.b * Math.sinh(s)]
      : [lab.h + lab.b * Math.sinh(s), lab.k + lab.a * Math.cosh(s)];
    const [F1, F2] = g.foci;
    P.line(F1[0], F1[1], pt[0], pt[1], COLORS.focus, 2);
    P.line(F2[0], F2[1], pt[0], pt[1], COLORS.vertex, 2);
    P.dot(pt[0], pt[1], '#ffffff', 6, 'P');

    const d1 = dist(pt, F1), d2 = dist(pt, F2);
    $('#focalBox').innerHTML =
      `<span style="color:var(--pink)">PF₁ = ${d1.toFixed(3)}</span> &nbsp;·&nbsp; ` +
      `<span style="color:var(--yellow)">PF₂ = ${d2.toFixed(3)}</span><br>` +
      `|PF₁ − PF₂| = <strong>${Math.abs(d1 - d2).toFixed(3)}</strong> = 2a = <strong>${num(2 * lab.a)}</strong> ✔`;
  }
}

function initLab() {
  labPlane = new Plane($('#labCanvas'), 10);
  const onChange = () => updateLabInfo();

  ['a', 'b', 'h', 'k'].forEach((key) => { labSetters[key] = bindControl('', key, lab, onChange); });
  labSetters.orient = bindOrientation('lab', lab, onChange);

  const toggles = { showAsym: 'asym', showRect: 'rect', showFoci: 'foci', showVert: 'vert', showFocal: 'focal' };
  Object.entries(toggles).forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      show[key] = el.checked;
      if (key === 'focal' && !el.checked) {
        $('#focalBox').textContent = 'Activa «Propiedad focal» para ver un punto P recorrer la curva.';
      }
    });
  });

  $('#resetLab').addEventListener('click', () => {
    ['a', 'b', 'h', 'k'].forEach((key) => labSetters[key](LAB_DEFAULT[key], true));
    labSetters.orient(LAB_DEFAULT.orient, true);
    updateLabInfo();
  });

  // Coordenadas del cursor
  const canvas = $('#labCanvas');
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const w = labPlane.toWorld(e.clientX - r.left, e.clientY - r.top);
    const p = lab, H = p.orient === 'h';
    const dx = w.x - p.h, dy = w.y - p.k;
    const val = H ? dx * dx / (p.a * p.a) - dy * dy / (p.b * p.b)
                  : dy * dy / (p.a * p.a) - dx * dx / (p.b * p.b);
    const near = Math.abs(val - 1) < 0.08 ? '  ← ¡sobre la curva!' : '';
    $('#labCoords').textContent = `(${w.x.toFixed(1)}, ${w.y.toFixed(1)})${near}`;
  });
  canvas.addEventListener('pointerleave', () => {
    $('#labCoords').textContent = 'Mueve el cursor sobre el plano';
  });

  updateLabInfo();
}

/* =========================================================
   5. MINIJUEGO «APUNTA AL FOCO»
   ========================================================= */
const game = {
  user: { orient: 'h', a: 1, b: 1, h: 0, k: 0 },
  target: null,
  markers: [],
  type: 'points',
  score: 0,
  streak: 0,
  round: 1,
  attempts: 0,
  hints: 0,
  solved: false,
  particles: []
};
let gamePlane;
const gameSetters = {};
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

/* Crea un reto aleatorio. A veces exige pasar por puntos y otras ubicar los focos;
   en ambos casos se construye una solución matemática válida antes de mostrársela al usuario. */
function newChallenge() {
  const type = Math.random() < 0.5 ? 'points' : 'focus';
  const orient = Math.random() < 0.5 ? 'h' : 'v';
  let a, b, h, k;

  if (type === 'focus') {
    // Terna pitagórica para que los focos queden en puntos enteros (c = 5)
    [a, b] = Math.random() < 0.5 ? [3, 4] : [4, 3];
    h = randInt(-2, 2);
    k = randInt(-2, 2);
  } else {
    a = randInt(1, 4);
    b = randInt(1, 4);
    h = randInt(-3, 3);
    k = randInt(-3, 3);
  }

  const t = { orient, a, b, h, k };
  const g = geometry(t);
  const markers = [];

  if (type === 'focus') {
    markers.push({ type: 'focus', x: g.foci[0][0], y: g.foci[0][1], name: 'F₁' });
    markers.push({ type: 'focus', x: g.foci[1][0], y: g.foci[1][1], name: 'F₂' });
    const vi = Math.random() < 0.5 ? 0 : 1;
    markers.push({ type: 'vertex', x: g.vertices[vi][0], y: g.vertices[vi][1], name: 'V' });
  } else {
    markers.push({ type: 'vertex', x: g.vertices[0][0], y: g.vertices[0][1], name: 'V₁' });
    markers.push({ type: 'vertex', x: g.vertices[1][0], y: g.vertices[1][1], name: 'V₂' });
    const s = Math.random() < 0.5 ? 1 : -1;      // rama
    const tt = (Math.random() < 0.5 ? 1 : -1) * 0.9;
    const pt = orient === 'h'
      ? [h + s * a * Math.cosh(tt), k + b * Math.sinh(tt)]
      : [h + b * Math.sinh(tt), k + s * a * Math.cosh(tt)];
    markers.push({ type: 'point', x: pt[0], y: pt[1], name: 'P' });
  }
  markers.forEach((m) => (m.state = 'idle'));

  Object.assign(game, { target: t, markers, type, attempts: 0, hints: 0, solved: false });

  if (type === 'focus') {
    $('#chTitle').textContent = '⭐ Reto: Apunta al foco';
    $('#chText').textContent = 'Haz que los focos de tu hipérbola (puntos rosados) caigan sobre las estrellas F₁ y F₂, y que uno de sus vértices esté en V.';
  } else {
    $('#chTitle').textContent = '🎯 Reto: Pasa por los puntos';
    $('#chText').textContent = 'Ajusta tu hipérbola para que sus vértices coincidan con V₁ y V₂ y la curva pase por el punto P.';
  }
  $('#hintText').textContent = '';
  $('#hintBtn').disabled = false;
  $('#checkBtn').disabled = false;
  $('#nextBtn').classList.remove('pulse');
  $('#nextBtn').textContent = 'Nuevo reto →';
  setFeedback('', '');
  $('#gameWrap').classList.remove('win');
  updateScoreboard();
}

/* Verifica una marca objetivo con una pequeña tolerancia. Esta tolerancia evita que
   diferencias mínimas por decimales hagan que una respuesta visualmente correcta falle. */
function markerOk(m, u) {
  const g = geometry(u);
  const tol = 0.15;
  if (m.type === 'vertex') return g.vertices.some((v) => dist(v, [m.x, m.y]) < tol);
  if (m.type === 'focus') return g.foci.some((f) => dist(f, [m.x, m.y]) < tol);
  const dx = m.x - u.h, dy = m.y - u.k;
  const val = u.orient === 'h'
    ? dx * dx / (u.a * u.a) - dy * dy / (u.b * u.b)
    : dy * dy / (u.a * u.a) - dx * dx / (u.b * u.b);
  return Math.abs(val - 1) < 0.06;
}

function setFeedback(cls, html) {
  const fb = $('#feedback');
  fb.className = 'feedback';
  void fb.offsetWidth;          // reinicia la animación
  if (cls) fb.classList.add(cls);
  fb.innerHTML = html;
}

function bump(id) {
  const el = document.getElementById(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function updateScoreboard() {
  $('#score').textContent = game.score;
  $('#streak').textContent = game.streak > 0 ? `${game.streak}🔥` : '0';
  $('#round').textContent = game.round;
}

/* Revisa todos los objetivos del reto, actualiza los aciertos y calcula puntaje,
   racha y mensaje de retroalimentación sin cambiar la figura elegida por el usuario. */
function checkAnswer() {
  if (game.solved) return;
  let okCount = 0;
  game.markers.forEach((m) => {
    const ok = markerOk(m, game.user);
    m.state = ok ? 'ok' : 'bad';
    if (ok) okCount++;
  });

  if (okCount === game.markers.length) {
    const base = Math.max(40, 100 - 20 * game.attempts - 30 * game.hints);
    const bonus = 20 * game.streak;
    const pts = base + bonus;
    game.score += pts;
    game.streak++;
    game.solved = true;
    setFeedback('ok', `¡Correcto! +${pts} puntos${bonus ? `<small>Incluye bono de racha +${bonus}</small>` : ''}`);
    $('#gameWrap').classList.add('win');
    $('#checkBtn').disabled = true;
    $('#hintBtn').disabled = true;
    $('#nextBtn').textContent = 'Siguiente reto →';
    $('#nextBtn').classList.add('pulse');
    spawnParticles();
    bump('score');
    bump('streak');
  } else {
    game.attempts++;
    game.streak = 0;
    const faltan = game.markers.length - okCount;
    const extra = game.attempts >= 2 && game.hints < 3 ? ' ¿Necesitas una pista?' : '';
    setFeedback('bad', `Inténtalo de nuevo<small>Te ${faltan === 1 ? 'falta 1 objetivo' : `faltan ${faltan} objetivos`} (en rojo).${extra}</small>`);
    const wrap = $('#gameWrap');
    wrap.classList.remove('lose');
    void wrap.offsetWidth;
    wrap.classList.add('lose');
  }
  updateScoreboard();
}

function giveHint() {
  if (game.solved || game.hints >= 3) return;
  const t = game.target;
  game.hints++;
  const lines = [
    `Centro (${num(t.h)}, ${num(t.k)}) · orientación ${t.orient === 'h' ? 'horizontal' : 'vertical'}`,
    `a = ${num(t.a)}`,
    `b = ${num(t.b)}${game.type === 'focus' ? '  (recuerda: c² = a² + b²)' : ''}`
  ];
  $('#hintText').innerHTML = lines.slice(0, game.hints).map((l) => `💡 ${l}`).join('<br>');
  if (game.hints >= 3) $('#hintBtn').disabled = true;
}

function spawnParticles() {
  const P = gamePlane;
  const cols = [COLORS.ok, COLORS.curve, COLORS.asym, COLORS.focus, COLORS.vertex];
  game.markers.forEach((m) => {
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4;
      game.particles.push({
        x: P.X(m.x), y: P.Y(m.y),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, color: cols[i % cols.length]
      });
    }
  });
}

function drawTarget(P, m, color, pulse) {
  const c = P.ctx;
  const X = P.X(m.x), Y = P.Y(m.y);
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 16;
  c.lineWidth = 2;

  // Anillo pulsante
  c.beginPath(); c.arc(X, Y, 12 * pulse, 0, Math.PI * 2); c.stroke();

  if (m.type === 'focus') {
    // Estrella
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 3.5 : 8;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(X + r * Math.cos(ang), Y + r * Math.sin(ang));
    }
    c.closePath(); c.fill();
  } else {
    // Mira
    c.beginPath();
    c.moveTo(X - 7, Y); c.lineTo(X + 7, Y);
    c.moveTo(X, Y - 7); c.lineTo(X, Y + 7);
    c.stroke();
    c.beginPath(); c.arc(X, Y, 3, 0, Math.PI * 2); c.fill();
  }

  c.shadowBlur = 0;
  c.font = '600 12px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.textBaseline = 'bottom';
  c.fillText(`${m.name}(${num(m.x, 1)}, ${num(m.y, 1)})`, X + 14, Y - 8);
  c.restore();
}

function drawGame(time) {
  const P = gamePlane;
  P.drawGrid();
  drawHyperbola(P, game.user, {
    asym: true, asymColor: 'rgba(168, 85, 247, 0.4)',
    foci: true, vert: true, small: true,
    color: game.solved ? COLORS.ok : COLORS.curve
  });

  const pulse = 1 + 0.25 * Math.sin(time / 250);
  game.markers.forEach((m) => {
    const col = m.state === 'ok' ? COLORS.ok : m.state === 'bad' ? COLORS.bad : COLORS.target;
    drawTarget(P, m, col, pulse);
  });

  // Partículas de celebración
  const c = P.ctx;
  game.particles = game.particles.filter((p) => p.life > 0);
  game.particles.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.015;
    c.globalAlpha = Math.max(0, p.life);
    c.fillStyle = p.color;
    c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
  });
  c.globalAlpha = 1;
}

function initGame() {
  gamePlane = new Plane($('#gameCanvas'), 10);

  const onChange = () => {
    // Al mover los controles, los objetivos vuelven a su color neutro
    if (!game.solved) game.markers.forEach((m) => (m.state = 'idle'));
  };
  ['a', 'b', 'h', 'k'].forEach((key) => { gameSetters[key] = bindControl('g-', key, game.user, onChange); });
  gameSetters.orient = bindOrientation('game', game.user, onChange);

  $('#checkBtn').addEventListener('click', checkAnswer);
  $('#hintBtn').addEventListener('click', giveHint);
  $('#nextBtn').addEventListener('click', () => {
    if (!game.solved) game.streak = 0;   // saltar un reto rompe la racha
    game.round++;
    ['a', 'b'].forEach((k) => gameSetters[k](1, true));
    ['h', 'k'].forEach((k) => gameSetters[k](0, true));
    gameSetters.orient('h', true);
    newChallenge();
  });

  newChallenge();
}

/* =========================================================
   6. HERO (SVG animado)
   ========================================================= */
/* Construye el dibujo SVG de la portada. SVG es útil aquí porque conserva nitidez
   al cambiar de tamaño y permite animar un punto recorriendo una de las ramas. */
function buildHero() {
  const svg = $('#heroSvg');
  if (!svg) return;
  const p = { orient: 'h', a: 2.4, b: 1.8, h: 0, k: 0 };
  const g = geometry(p);
  const toPath = (pts) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(3)} ${(-q[1]).toFixed(3)}`).join(' ');

  // Ramas acotadas a la vista
  const T = 2.2, steps = 120;
  const br = [1, -1].map((s) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = -T + (2 * T * i) / steps;
      pts.push([s * p.a * Math.cosh(t), p.b * Math.sinh(t)]);
    }
    return toPath(pts);
  });
  const m = g.slope, L = 10;

  svg.innerHTML = `
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.18" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <line class="h-axis" x1="-10" y1="0" x2="10" y2="0"/>
    <line class="h-axis" x1="0" y1="-8" x2="0" y2="8"/>
    <line class="h-asym" x1="${-L}" y1="${m * L}" x2="${L}" y2="${-m * L}"/>
    <line class="h-asym" x1="${-L}" y1="${-m * L}" x2="${L}" y2="${m * L}"/>
    <path id="heroRight" class="h-curve" pathLength="1" filter="url(#glow)" d="${br[0]}"/>
    <path class="h-curve delay" pathLength="1" filter="url(#glow)" d="${br[1]}"/>
    <circle class="h-vertex" cx="${p.a}" cy="0" r="0.18"/>
    <circle class="h-vertex" cx="${-p.a}" cy="0" r="0.18"/>
    <circle class="h-focus" cx="${g.c}" cy="0" r="0.24" filter="url(#glow)"/>
    <circle class="h-focus" cx="${-g.c}" cy="0" r="0.24" filter="url(#glow)"/>
    <text class="h-label" x="${g.c - 0.3}" y="-0.5">F₁</text>
    <text class="h-label" x="${-g.c - 0.3}" y="-0.5">F₂</text>
    <circle class="h-mover" r="0.2" filter="url(#glow)">
      <animateMotion dur="7s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear">
        <mpath href="#heroRight"/>
      </animateMotion>
    </circle>`;
}

/* =========================================================
   7. INTERFAZ GENERAL (menú, tarjetas, scroll)
   ========================================================= */
/* Conecta las interacciones generales de la página: menú móvil, tarjetas giratorias,
   aparición gradual de contenido y resaltado de la sección activa. */
function initUI() {
  // Menú móvil
  const toggle = $('#menuToggle'), links = $('#navLinks');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  $$('#navLinks a').forEach((a) => a.addEventListener('click', () => links.classList.remove('open')));

  // Tarjetas giratorias
  $$('.flip-card').forEach((card) => card.addEventListener('click', () => card.classList.toggle('flipped')));

  // Aparición al hacer scroll
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => revealObs.observe(el));

  // Enlace activo en el menú
  const navObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        $$('#navLinks a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => navObs.observe(s));
}

/* =========================================================
   8. BUCLE DE ANIMACIÓN Y ARRANQUE
   ========================================================= */
const visible = { lab: true, game: true };

/* Bucle de animación: se solicita el siguiente fotograma y solo se redibujan los
   canvas que están visibles, para evitar trabajo innecesario. */
function loop(time) {
  if (visible.lab) drawLab(time);
  if (visible.game) drawGame(time);
  requestAnimationFrame(loop);
}

/* Punto de inicio: espera a que el documento exista, prepara cada módulo y activa
   los observadores que detectan visibilidad y cambios de tamaño. */
document.addEventListener('DOMContentLoaded', () => {
  buildHero();
  initUI();
  initLab();
  initGame();

  // Solo se dibuja el canvas que está en pantalla
  const canvasObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { visible[e.target.dataset.key] = e.isIntersecting; });
  });
  canvasObs.observe($('#labCanvas'));
  canvasObs.observe($('#gameCanvas'));

  // Redimensionar
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { labPlane.resize(); gamePlane.resize(); }, 120);
  });

  requestAnimationFrame(loop);
});
