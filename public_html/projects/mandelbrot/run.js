"use strict";

// Mandelbrot explorer
//
// Two rendering paths share the same banded colouring:
//
//  * Shallow zoom: plain float64 escape-time iteration. Produces exactly the
//    same iteration counts as a naive loop, just with shortcuts for points
//    that never escape (cardioid/bulb test and exact cycle detection).
//
//  * Deep zoom (pixel size below CONFIG.deepZoomPixelSize, where float64 can
//    no longer tell neighbouring pixels apart): perturbation theory. One
//    reference orbit is computed at the view centre in BigInt fixed point;
//    each pixel then iterates only its tiny offset from that orbit in
//    float64. "Rebasing" (Zhuoran, 2021) keeps the offset small, so a single
//    reference is enough and no glitch detection is needed.
//
// Pixels are computed in a pool of web workers (one per core), in chunks
// taken from a shuffled pixel order so the image sharpens evenly. If
// workers are unavailable, the same code runs on the main thread. Each
// kernel iterates 4 pixels at once to keep the CPU busy, and ranks are kept
// so changing the iteration limit only recomputes what it can change.

// Configuration ---------------------------------------------
const CONFIG = {
  // Complex-plane width shown across the canvas at zoom = 1. This is the
  // view the old version showed on a 2x (retina) display, so existing
  // bookmarks look the same there - and now look the same on every display.
  baseViewWidth: 11.2,
  // Default click / button zoom: 0.3 of the width per step, as before.
  zoomStep: 1 / 0.3,
  // Don't zoom out past a view this many times the default width.
  maxZoom: 4,
  // Scroll-wheel zoom: factor e^(k * deltaY pixels). Trackpad pinches
  // arrive as ctrl+wheel with much smaller deltas, so they get a larger k.
  wheelZoomRate: 0.0018,
  pinchWheelZoomRate: 0.012,
  // Wait this long after the last wheel/key step before rendering, so a
  // burst of steps renders once (the scaled preview shows in between).
  settleMs: 220,
  // Switch to perturbation below this pixel size (complex units per device
  // pixel). Above it, float64 coordinates are accurate enough.
  deepZoomPixelSize: 1e-12,
  // float64 pixel offsets underflow near 1e-308; stop zooming well before.
  minPixelSize: 1e-290,
  frameBudgetMs: 60,
  // Total memory for the workers' copies of the reference orbit.
  referenceMemoryBudget: 1e9,
  // Pixels iterated together per kernel loop (see "Escape-time kernels").
  lanes: 4,
};

// Types ---------------------------------------------
function Color(r, g, b, a) {
  return { r, g, b, a };
}

const Colors = {
  black: Color(0, 0, 0, 255),
  white: Color(255, 255, 255, 255),
};

// Fixed-point numbers ---------------------------------------------
// A fixed-point value is a BigInt v representing v / 2^bits. Only the view
// centre and the reference orbit need this; everything per-pixel is float64.
const Fixed = {
  // Bits needed to address pixels of the given size, plus guard bits.
  bitsFor(pixelSize) {
    const needed = Math.ceil(-Math.log2(pixelSize)) + 64;
    return Math.max(64, Math.ceil(needed / 32) * 32);
  },

  rescale(v, fromBits, toBits) {
    return toBits >= fromBits
      ? v << BigInt(toBits - fromBits)
      : v >> BigInt(fromBits - toBits);
  },

  // Exact for every finite double: reads the IEEE 754 fields directly, so
  // tiny offsets at extreme zoom are not rounded away.
  fromDouble(x, bits) {
    if (x === 0) return 0n;
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    const hi = view.getUint32(0);
    const biasedExp = (hi >>> 20) & 0x7ff;
    let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(view.getUint32(4));
    let exp = -1074; // subnormal
    if (biasedExp !== 0) {
      mantissa |= 1n << 52n;
      exp = biasedExp - 1075;
    }
    // |x| = mantissa * 2^exp; shift to `bits` fractional bits, rounding.
    const shift = exp + bits;
    let v;
    if (shift >= 0) {
      v = mantissa << BigInt(shift);
    } else {
      const s = BigInt(-shift);
      v = (mantissa + (1n << (s - 1n))) >> s;
    }
    return x < 0 ? -v : v;
  },

  toDouble(v, bits) {
    // Number(bigint) rounds correctly; scaling by a power of two is exact.
    // Past 1000 bits, 2^-bits underflows and Number(v) may overflow, so split
    // the scaling while keeping full relative precision for tiny values.
    if (bits <= 1000) return Number(v) * 2 ** -bits;
    const s = bits - 1000;
    const hi = v >> BigInt(s);
    if (hi > 1n << 60n || hi < -(1n << 60n)) return Number(hi) * 2 ** -1000;
    return Number(v) * 2 ** -s * 2 ** -1000;
  },

  // Parses "-1.75", "3.95e-8", ... exactly. Returns null if invalid.
  fromDecimal(text, bits) {
    const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?\s*$/i.exec(
      String(text)
    );
    if (!m) return null;
    const fraction = m[3] || "";
    const digits = m[2] + fraction;
    if (digits === "") return null;

    const exp10 = (m[4] ? parseInt(m[4], 10) : 0) - fraction.length;
    if (Math.abs(exp10) > 4000) return null;

    const mantissa = BigInt(digits);
    let v;
    if (exp10 >= 0) {
      v = (mantissa * 10n ** BigInt(exp10)) << BigInt(bits);
    } else {
      const d = 10n ** BigInt(-exp10);
      v = ((mantissa << BigInt(bits)) + d / 2n) / d;
    }
    return m[1] === "-" ? -v : v;
  },

  toDecimal(v, bits, places) {
    const negative = v < 0n;
    if (negative) v = -v;
    const B = BigInt(bits);
    const scale = 10n ** BigInt(places);
    let whole = v >> B;
    let frac = ((v & ((1n << B) - 1n)) * scale + (1n << (B - 1n))) >> B;
    if (frac >= scale) {
      whole += 1n;
      frac -= scale;
    }
    let s = whole.toString();
    if (frac > 0n) {
      s += "." + frac.toString().padStart(places, "0").replace(/0+$/, "");
    }
    return negative && (whole > 0n || frac > 0n) ? "-" + s : s;
  },
};

// Escape-time kernels ---------------------------------------------
// A kernel computes the rank of each pixel in a list: the number of
// iterations after z = c before |z| reaches 2, or maxIter if it never does
// (PROVEN_INTERIOR if it provably never will). The numbering matches the
// original version, so bands line up with old renders.
//
// Kernels iterate several pixels ("lanes") in one loop. Each iteration
// depends on the previous one, so a single pixel leaves the CPU waiting on
// its multiplier; independent lanes fill that gap (about 2x with 4 lanes).
// When a lane's pixel finishes, the lane takes the next pixel in the list.
// The per-lane code is written once below and expanded for each lane with
// `new Function`. Lanes never interact, so every rank is identical to
// iterating one pixel at a time.

const PROVEN_INTERIOR = 2147483647; // never escapes, at any iteration count

function laneNames(lanes) {
  return Array.from({ length: lanes }, (_, i) => "_" + i);
}

// Shallow zoom, float64:  z' = z^2 + c
//  * Main cardioid and period-2 bulb are skipped outright.
//  * Cycle detection: every 32 iterations each lane compares z with a copy
//    saved at power-of-two intervals (Brent). Exact equality means the
//    float64 orbit is periodic, so it can never escape. All lanes share one
//    32-iteration grid so a finishing lane doesn't cut the others' blocks
//    short.
function buildDoubleKernel(lanes) {
  const L = laneNames(lanes);
  const load = (l) => `
    p${l} = -1;
    while (next < count) {
      const k = next++;
      const idx = indices[k];
      const px = idx % width, py = (idx - px) / width;
      const cx = left + px * ps, cy = top - py * ps;
      const xq = cx - 0.25, q = xq * xq + cy * cy, xb = cx + 1;
      if (q * (q + xq) <= 0.25 * cy * cy || xb * xb + cy * cy <= 0.0625) {
        ranks[k] = ${PROVEN_INTERIOR};
        continue;
      }
      p${l} = k; cx${l} = cx; cy${l} = cy; zx${l} = cx; zy${l} = cy;
      x2${l} = cx * cx; y2${l} = cy * cy; i${l} = 0;
      sx${l} = cx; sy${l} = cy; ns${l} = 32;
      live++;
      break;
    }
    if (p${l} < 0) { cx${l} = cy${l} = zx${l} = zy${l} = x2${l} = y2${l} = 0; }`;
  const finish = (l, rank) => `{ ranks[p${l}] = ${rank}; live--; ${load(l)} }`;

  return new Function("indices", "ranks", "width", "left", "top", "ps", "maxIter", `
    const count = indices.length;
    let next = 0, live = 0, g = 0;
    ${L.map((l) => `let p${l} = -1, cx${l} = 0, cy${l} = 0, zx${l} = 0, zy${l} = 0, x2${l} = 0, y2${l} = 0, i${l} = 0, sx${l} = 0, sy${l} = 0, ns${l} = 32;`).join("\n")}
    ${L.map(load).join("\n")}
    while (live > 0) {
      let block = 32 - (g & 31);
      ${L.map((l) => `if (p${l} >= 0 && maxIter - i${l} < block) block = maxIter - i${l};`).join("\n")}
      let s = 0;
      while (s < block && ${L.map((l) => `x2${l} + y2${l} < 4`).join(" && ")}) {
        ${L.map((l) => `zy${l} = 2 * zx${l} * zy${l} + cy${l}; zx${l} = x2${l} - y2${l} + cx${l}; x2${l} = zx${l} * zx${l}; y2${l} = zy${l} * zy${l};`).join("\n")}
        s++;
      }
      g += s;
      const check = s > 0 && (g & 31) === 0;
      ${L.map((l) => `
      if (p${l} >= 0) {
        i${l} += s;
        if (x2${l} + y2${l} >= 4) ${finish(l, `i${l}`)}
        else if (i${l} >= maxIter) ${finish(l, "maxIter")}
        else if (check) {
          if (zx${l} === sx${l} && zy${l} === sy${l}) ${finish(l, PROVEN_INTERIOR)}
          else if (i${l} >= ns${l}) { sx${l} = zx${l}; sy${l} = zy${l}; ns${l} *= 2; }
        }
      }`).join("\n")}
    }
    return 0;`);
}

// Deep zoom: iterate delta = z - Z (Z = reference orbit) in float64:
//   delta' = 2 Z delta + delta^2 + dc      (dc = pixel offset from reference)
// Rebase (delta = z, restart the reference) when the pixel's orbit is
// closer to 0 than to the reference, or the reference runs out.
//
// With `detect`, pixels inside minibrots stop early: each lane remembers its
// orbit's closest approach to 0 (the search restarts at power-of-two
// iteration counts so it settles on the attracting cycle) and a return to
// within a relative 1/maxIter^2 of it counts as periodic. Near 0 the deltas
// keep full precision, and the tolerance shrinks with maxIter so slowly
// escaping orbits near parabolic points are not mistaken for cycles. Tested
// against exact iteration with no false interiors; returns how many pixels
// it stopped early so the caller can turn it off where it never fires.
function buildPerturbedKernel(lanes, detect) {
  const L = laneNames(lanes);
  const load = (l) => `
    if (next < count) {
      const k = next++;
      const idx = indices[k];
      const px = idx % width, py = (idx - px) / width;
      p${l} = k; dcx${l} = (px - halfW) * ps; dcy${l} = (halfH - py) * ps;
      live++;
    } else { p${l} = -1; dcx${l} = 0; dcy${l} = 0; }
    dx${l} = 0; dy${l} = 0; m${l} = 0; i${l} = 0; mag${l} = 0;
    hit${l} = 0; mn${l} = INF; sx${l} = 0; sy${l} = 0; nr${l} = 64;`;
  const finish = (l, rank) => `{ ranks[p${l}] = ${rank}; live--; ${load(l)} }`;
  const detectStep = (l) =>
    detect
      ? `
          if (mag${l} < 4 * mn${l}) {
            if (mn${l} !== INF) {
              const ex = zx - sx${l}, ey = zy - sy${l};
              if (ex * ex + ey * ey < tol2 * mn${l}) { hit${l} = 1; mag${l} = INF; }
            }
            if (mag${l} < mn${l}) { mn${l} = mag${l}; sx${l} = zx; sy${l} = zy; }
          }`
      : "";

  return new Function("indices", "ranks", "width", "height", "ps", "X", "Y", "refLength", "maxIter", `
    const count = indices.length, last = refLength - 1, halfW = width / 2, halfH = height / 2;
    const tol2 = 1 / (maxIter * maxIter * maxIter * maxIter);
    const INF = 1 / 0; // local: global lookups in the hot loop are slow in some engines
    let next = 0, live = 0, detected = 0;
    ${L.map((l) => `let p${l} = -1, dcx${l} = 0, dcy${l} = 0, dx${l} = 0, dy${l} = 0, m${l} = 0, i${l} = 0, mag${l} = 0, hit${l} = 0, mn${l} = INF, sx${l} = 0, sy${l} = 0, nr${l} = 64;`).join("\n")}
    ${L.map(load).join("\n")}
    while (live > 0) {
      let limit = maxIter;
      ${L.map((l) => `if (p${l} >= 0) {
        if (maxIter - i${l} < limit) limit = maxIter - i${l};
        ${detect ? `if (nr${l} - i${l} < limit) limit = nr${l} - i${l};` : ""}
      }`).join("\n")}
      let s = 0;
      while (s < limit && ${L.map((l) => `mag${l} < 4`).join(" && ")}) {
        ${L.map((l) => `{
          const Zx = X[m${l}], Zy = Y[m${l}];
          const nx = 2 * (Zx * dx${l} - Zy * dy${l}) + (dx${l} * dx${l} - dy${l} * dy${l}) + dcx${l};
          const ny = 2 * (Zx * dy${l} + Zy * dx${l}) + 2 * dx${l} * dy${l} + dcy${l};
          m${l}++;
          const zx = X[m${l}] + nx, zy = Y[m${l}] + ny;
          mag${l} = zx * zx + zy * zy;${detectStep(l)}
          if (mag${l} < nx * nx + ny * ny || m${l} === last) { dx${l} = zx; dy${l} = zy; m${l} = 0; }
          else { dx${l} = nx; dy${l} = ny; }
        }`).join("\n")}
        s++;
      }
      ${L.map((l) => `
      if (p${l} >= 0) {
        i${l} += s;
        if (hit${l}) { detected++; ${finish(l, "maxIter")} }
        else if (mag${l} >= 4) ${finish(l, `i${l} - 1`)}
        else if (i${l} >= maxIter) ${finish(l, "maxIter")}
        ${detect ? `else if (i${l} === nr${l}) { mn${l} = INF; nr${l} *= 2; }` : ""}
      } else if (mag${l} >= 4) { dx${l} = 0; dy${l} = 0; m${l} = 0; mag${l} = 0; }`).join("\n")}
    }
    return detected;`);
}

function laneKernels(lanes) {
  const cache = laneKernels.cache || (laneKernels.cache = {});
  if (!cache[lanes]) {
    cache[lanes] = {
      double: buildDoubleKernel(lanes),
      perturbed: buildPerturbedKernel(lanes, false),
      perturbedDetect: buildPerturbedKernel(lanes, true),
    };
  }
  return cache[lanes];
}

// Reference orbit Z_0 = 0, Z_{n+1} = Z_n^2 + C in fixed point, stored as
// float64. Computed incrementally so deep renders don't freeze the page,
// and extended in place when the iteration count is raised.
function createReferenceOrbit(cx, cy, bits, maxIter) {
  const x = new Float64Array(maxIter + 1);
  const y = new Float64Array(maxIter + 1);
  return {
    cx, cy, bits, maxIter, x, y,
    length: 1, zx: 0n, zy: 0n,
    escaped: false, // the orbit itself escaped, so it is complete at any maxIter
    done: false, // computed up to min(escape, maxIter)
  };
}

function extendReferenceOrbit(ref, maxIter) {
  if (maxIter <= ref.maxIter || ref.escaped) return;
  const x = new Float64Array(maxIter + 1);
  const y = new Float64Array(maxIter + 1);
  x.set(ref.x.subarray(0, ref.length));
  y.set(ref.y.subarray(0, ref.length));
  ref.x = x;
  ref.y = y;
  ref.maxIter = maxIter;
  ref.done = false;
}

function advanceReferenceOrbit(ref, deadline) {
  const P = BigInt(ref.bits),
    P1 = BigInt(ref.bits - 1);
  let zx = ref.zx,
    zy = ref.zy,
    n = ref.length;

  while (n <= ref.maxIter) {
    const x2 = (zx * zx) >> P,
      y2 = (zy * zy) >> P,
      xy2 = (zx * zy) >> P1; // 2xy
    zx = x2 - y2 + ref.cx;
    zy = xy2 + ref.cy;

    const fx = Fixed.toDouble(zx, ref.bits),
      fy = Fixed.toDouble(zy, ref.bits);
    ref.x[n] = fx;
    ref.y[n] = fy;
    n++;

    if (fx * fx + fy * fy > 4) {
      ref.escaped = true;
      break;
    }
    if ((n & 127) === 0 && performance.now() > deadline) break;
  }

  ref.done = ref.escaped || n > ref.maxIter;
  ref.zx = zx;
  ref.zy = zy;
  ref.length = n;
}

// Colouring ---------------------------------------------
// Banded palette: `steps` ranks to fade from one colour to the next. Built
// once per render as packed RGBA so each pixel is a single array write.
function buildPalette(coloring) {
  const { colors, steps } = coloring;
  const n = colors.length * steps;
  const bytes = new Uint8ClampedArray(n * 4);
  for (let rank = 0; rank < n; rank++) {
    const from = colors[Math.floor(rank / steps)];
    const to = colors[(Math.floor(rank / steps) + 1) % colors.length];
    const t = (rank % steps) / steps;
    bytes[rank * 4] = from.r + (to.r - from.r) * t;
    bytes[rank * 4 + 1] = from.g + (to.g - from.g) * t;
    bytes[rank * 4 + 2] = from.b + (to.b - from.b) * t;
    bytes[rank * 4 + 3] = from.a + (to.a - from.a) * t;
  }
  return new Uint32Array(bytes.buffer);
}

function packColor(c) {
  return new Uint32Array(new Uint8ClampedArray([c.r, c.g, c.b, c.a]).buffer)[0];
}

// View ---------------------------------------------
// The view is a high-precision centre plus a zoom; the visible width is
// CONFIG.baseViewWidth * zoom regardless of canvas size or pixel ratio.
function pixelSize(state) {
  return (CONFIG.baseViewWidth * state.zoom) / state.width;
}

function setCenterBits(state, bits) {
  const c = state.center;
  if (bits <= c.bits) return;
  c.x = Fixed.rescale(c.x, c.bits, bits);
  c.y = Fixed.rescale(c.y, c.bits, bits);
  c.bits = bits;
}

// Limits a zoom factor so the view stays between CONFIG.maxZoom and the
// smallest pixel float64 deltas can handle. A view already past a limit is
// not pushed further, but can move back.
function clampZoomFactor(state, factor) {
  const minZoom = (CONFIG.minPixelSize * state.width) / CONFIG.baseViewWidth;
  const lo = Math.min(state.zoom, minZoom);
  const hi = Math.max(state.zoom, CONFIG.maxZoom);
  const zoom = Math.min(hi, Math.max(lo, state.zoom * factor));
  return zoom / state.zoom;
}

// Moves the centre to a device-pixel position, then applies the zoom factor.
function recenter(state, px, py, zoomFactor) {
  const ps = pixelSize(state);
  const factor = clampZoomFactor(state, zoomFactor);

  setCenterBits(state, Fixed.bitsFor(Math.min(ps, ps * factor)));
  const c = state.center;
  c.x += Fixed.fromDouble((px - state.width / 2) * ps, c.bits);
  c.y += Fixed.fromDouble((state.height / 2 - py) * ps, c.bits);
  state.zoom *= factor;
}

// Zooms by `factor` keeping the point under device pixel (px, py) still.
function zoomAt(state, px, py, zoomFactor) {
  const factor = clampZoomFactor(state, zoomFactor);
  if (factor === 1) return;
  const ps = pixelSize(state);
  setCenterBits(state, Fixed.bitsFor(Math.min(ps, ps * factor)));
  const c = state.center;
  const shift = ps * (1 - factor);
  c.x += Fixed.fromDouble((px - state.width / 2) * shift, c.bits);
  c.y += Fixed.fromDouble((state.height / 2 - py) * shift, c.bits);
  state.zoom *= factor;
}

// Moves the image by (dx, dy) device pixels, as when dragging it.
function panBy(state, dx, dy) {
  const ps = pixelSize(state);
  setCenterBits(state, Fixed.bitsFor(ps));
  const c = state.center;
  c.x -= Fixed.fromDouble(dx * ps, c.bits);
  c.y += Fixed.fromDouble(dy * ps, c.bits);
}

// Fits the device-pixel rectangle (x0, y0)-(x1, y1) to the canvas.
function zoomToBox(state, x0, y0, x1, y1) {
  const w = Math.abs(x1 - x0),
    h = Math.abs(y1 - y0);
  const factor = Math.max(w / state.width, h / state.height);
  recenter(state, (x0 + x1) / 2, (y0 + y1) / 2, factor);
}

function currentView(state) {
  const c = state.center;
  return {
    x: c.x,
    y: c.y,
    bits: c.bits,
    zoom: state.zoom,
    ps: pixelSize(state),
    width: state.width,
    height: state.height,
  };
}

function setView(state, view) {
  state.center = { x: view.x, y: view.y, bits: view.bits };
  state.zoom = view.zoom;
}

// Preview ---------------------------------------------
// While the view moves, the last image is scaled and shifted to match it,
// so zooming and panning respond instantly. A render then starts from that
// preview and sharpens it, instead of starting from an empty canvas.
//
// `state.shown` is the view the canvas currently depicts. A gesture copies
// the canvas into `state.snapshot` once, with that view as `state.base`;
// every step redraws the snapshot for the current view.
function beginPreview(state) {
  if (state.base) return;
  state.job = null; // stop the running render from drawing over the preview
  if (!state.shown) return;
  const snap = state.snapshot || (state.snapshot = document.createElement("canvas"));
  snap.width = state.width;
  snap.height = state.height;
  snap.getContext("2d").drawImage(state.canvas, 0, 0);
  state.base = state.shown;
}

function drawPreview(state) {
  const ctx = state.ctx,
    base = state.base;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, state.width, state.height);
  if (!base) return;

  // Old pixel o maps to new pixel k * o + t: k is the change in scale, the
  // centre offset is measured in old pixels (y grows downwards on screen).
  const c = state.center;
  const bits = Math.max(c.bits, base.bits);
  const diff = (a, aBits, b, bBits) =>
    Fixed.toDouble(Fixed.rescale(a, aBits, bits) - Fixed.rescale(b, bBits, bits), bits);
  const k = base.ps / pixelSize(state);
  const dx = diff(c.x, c.bits, base.x, base.bits) / base.ps;
  const dy = -diff(c.y, c.bits, base.y, base.bits) / base.ps;
  if (![k, dx, dy].every(Number.isFinite)) return;

  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(
    k, 0, 0, k,
    state.width / 2 - (base.width / 2 + dx) * k,
    state.height / 2 - (base.height / 2 + dy) * k
  );
  ctx.drawImage(state.snapshot, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Shortest query that reproduces the view, e.g. x=-0.4141588&y=0.2702925&z=0.01082
//  * coordinates get two decimal places more than the pixel size needs
//    (within 1/100 of a pixel, so a larger screen still lands on the spot);
//  * small coordinates use scientific notation instead of leading zeros;
//  * the zoom keeps 4 significant figures (a 0.01% change in scale).
// Old links with long decimals and `zoom=` still load (see applyUrlLocation).
function locationQuery(state) {
  const c = state.center;
  const places = Math.max(1, Math.ceil(-Math.log10(pixelSize(state))) + 2);
  const x = compactDecimal(Fixed.toDecimal(c.x, c.bits, places));
  const y = compactDecimal(Fixed.toDecimal(c.y, c.bits, places));
  const z = Number(state.zoom.toPrecision(4));
  const iter = state.maxIterations === DEFAULT_ITERATIONS ? "" : `&iter=${state.maxIterations}`;
  return `x=${x}&y=${y}&z=${z}${iter}`;
}

// "-0.0000395134" -> "-3.95134e-5" when that is shorter (3+ leading zeros).
function compactDecimal(text) {
  const m = /^(-?)0\.(0{3,})(\d+)$/.exec(text);
  if (!m) return text;
  const [, sign, zeros, digits] = m;
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}e-${zeros.length + 1}`;
}

// Canvas setup ---------------------------------------------
function setCanvasSize(state, cssWidth, cssHeight) {
  const canvas = state.canvas;
  // The size must apply to the drawing area alone. Bootstrap's global
  // `box-sizing: border-box` would put the border inside it, so the browser
  // would shrink the buffer by a few pixels and blur the whole image.
  canvas.style.boxSizing = "content-box";
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";
  canvas.width = Math.round(cssWidth * state.dpr);
  canvas.height = Math.round(cssHeight * state.dpr);

  state.width = canvas.width;
  state.height = canvas.height;
  state.image = state.ctx.createImageData(state.width, state.height);
  state.pixels = new Uint32Array(state.image.data.buffer);
  state.pixelOrder = null;
  state.ranks = new Int32Array(state.width * state.height);
  state.ranksKey = null; // forces a full render at the new size
}

// Initial state setup ---------------------------------------------
function initialState(canvas) {
  const state = {
    canvas,
    ctx: canvas.getContext("2d"),
    dpr: window.devicePixelRatio || 1,
    center: { x: 0n, y: 0n, bits: 64 },
    zoom: 1,
    maxIterations: DEFAULT_ITERATIONS,
    coloring: {
      steps: 23,
      colors: [Colors.black, Colors.white],
      interior: Colors.black,
    },
    clickMode: "zoomIn",
    zoomStep: CONFIG.zoomStep,
    sizeMode: "fit",
    history: [], // earlier views, for "back"
    moving: false, // the view changed since the last render started
    renderTimer: 0,
    shown: null, // view the canvas depicts; see "Preview"
    base: null,
    snapshot: null,
    job: null,
    jobCount: 0,
    reference: null,
    workers: null,
    ranks: null,
    ranksKey: null,
    ranksMaxIter: 0,
  };
  setCanvasSize(state, canvas.width, canvas.height);
  return state;
}

function applyUrlLocation(state) {
  const params = new URLSearchParams(window.location.search);
  const iter = parseInt(params.get("iter"), 10);
  if (iter >= 1 && iter <= MAX_ITERATIONS) state.maxIterations = iter;

  const zoom = parseFloat(params.get("z") ?? params.get("zoom"));
  if (!(zoom > 0 && Number.isFinite(zoom))) return;

  const bits = Fixed.bitsFor(pixelSize({ zoom, width: state.width }));
  const x = Fixed.fromDecimal(params.get("x"), bits);
  const y = Fixed.fromDecimal(params.get("y"), bits);
  if (x === null || y === null) return;

  state.center = { x, y, bits };
  state.zoom = zoom;
}

// Pixel order ---------------------------------------------
// Pixels are drawn in a random order so the whole image sharpens at once.
// The shuffled order is cached per canvas size.
function pixelOrder(state) {
  const total = state.width * state.height;
  if (state.pixelOrder && state.pixelOrder.length === total) {
    return state.pixelOrder;
  }
  const order = new Uint32Array(total);
  for (let i = 0; i < total; i++) order[i] = i;
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  state.pixelOrder = order;
  return order;
}

function referenceOrbitFor(state, bits) {
  const c = state.center;
  const cx = Fixed.rescale(c.x, c.bits, bits);
  const cy = Fixed.rescale(c.y, c.bits, bits);
  const r = state.reference;
  if (r && r.cx === cx && r.cy === cy && r.bits === bits) {
    extendReferenceOrbit(r, state.maxIterations); // no-op if already long enough
    return r;
  }
  state.reference = createReferenceOrbit(cx, cy, bits, state.maxIterations);
  return state.reference;
}

function referenceReady(ref, maxIter) {
  return ref.escaped || ref.length > maxIter;
}

// Computes ranks for a list of pixel indices. `setup` holds everything a
// pixel needs, so this runs unchanged in a worker or on the main thread.
// Returns how many pixels interior detection stopped early.
function computeRanks(setup, indices, ranks, detect) {
  const kernels = laneKernels(setup.lanes);
  if (setup.deep) {
    const kernel = detect ? kernels.perturbedDetect : kernels.perturbed;
    return kernel(indices, ranks, setup.width, setup.height, setup.ps,
      setup.refX, setup.refY, setup.refLength, setup.maxIter);
  }
  return kernels.double(indices, ranks, setup.width, setup.left, setup.top,
    setup.ps, setup.maxIter);
}

// Worker pool ---------------------------------------------
// Workers are built from the kernel functions above (via their source
// text), so there is no second copy to keep in sync and no extra file to
// serve. Each worker receives a job's setup once, then chunks of pixel
// indices, and sends back the ranks.
function workerMain() {
  let setup = null,
    setupId = -1;
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === "setup") {
      setup = m.setup;
      setupId = m.id;
      return;
    }
    const ranks = new Int32Array(m.indices.length);
    const detected = m.id === setupId ? computeRanks(setup, m.indices, ranks, m.detect) : 0;
    self.postMessage(
      { id: m.id, indices: m.indices, ranks, detect: m.detect, detected },
      [m.indices.buffer, ranks.buffer]
    );
  };
}

function createWorkerPool(state) {
  if (typeof Worker === "undefined" || typeof Blob === "undefined") return null;
  const source =
    '"use strict";\n' +
    `const PROVEN_INTERIOR = ${PROVEN_INTERIOR};\n` +
    [laneNames, buildDoubleKernel, buildPerturbedKernel, laneKernels, computeRanks, workerMain]
      .map((f) => f.toString())
      .join("\n") +
    "\nworkerMain();\n";

  try {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const count = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4));
    const pool = [];
    for (let i = 0; i < count; i++) {
      const worker = new Worker(url);
      worker.setupId = -1;
      worker.busy = false;
      worker.onmessage = (e) => onWorkerResult(state, worker, e.data);
      worker.onerror = () => disableWorkers(state);
      pool.push(worker);
    }
    return pool;
  } catch (err) {
    return null;
  }
}

// If workers fail (blocked, crashed), render on the main thread instead.
function disableWorkers(state) {
  if (!state.workers) return;
  state.workers.forEach((w) => w.terminate());
  state.workers = null;
  render(state);
}

// Gives an idle worker the next chunk of the current job, if any.
function dispatch(state, worker) {
  const job = state.job;
  if (!job || !job.ready || job.next >= job.total) {
    worker.busy = false;
    return;
  }
  if (worker.setupId !== job.id) {
    if (job.workersUsed >= job.maxWorkers) {
      // Not needed for this job: drop any old reference orbit it holds.
      if (worker.setupId !== -1) worker.postMessage({ type: "setup", id: -1, setup: null });
      worker.setupId = -1;
      worker.busy = false;
      return;
    }
    job.workersUsed++;
    worker.postMessage({ type: "setup", id: job.id, setup: job.setup });
    worker.setupId = job.id;
  }
  const start = job.next;
  job.next = Math.min(job.total, start + job.chunkSize);
  const indices = job.order.slice(start, job.next);
  worker.busy = true;
  worker.sentAt = performance.now();
  worker.postMessage({ type: "chunk", id: job.id, indices, detect: job.detect }, [
    indices.buffer,
  ]);
}

function onWorkerResult(state, worker, msg) {
  const job = state.job;
  if (job && msg.id === job.id) {
    paint(state, job, msg.indices, msg.ranks);
    noteDetection(job, msg.detect, msg.indices.length, msg.detected);
    // Aim for chunks of ~30ms: small enough to cancel quickly on a new
    // click, large enough that messaging overhead stays negligible.
    const elapsed = performance.now() - worker.sentAt;
    if (elapsed < 15 && job.chunkSize < 65536) job.chunkSize *= 2;
    else if (elapsed > 60 && job.chunkSize > 64) job.chunkSize >>= 1;
  }
  dispatch(state, worker); // results from a superseded job are dropped
}

// Deep interior detection costs ~15% where it never fires. Pixels are
// rendered in shuffled order, so the first few thousand are a fair sample of
// the image: if detection stopped fewer than 1% of them early, turn it off
// for the rest of the render. Ranks are the same either way.
function noteDetection(job, detect, pixels, detected) {
  if (!detect || !job.detect) return;
  job.probed += pixels;
  job.detected += detected;
  if (job.probed >= 4096 && job.detected < 0.01 * job.probed) job.detect = false;
}

// Rank reuse ---------------------------------------------
// Ranks of the current view are kept between renders. A pixel's escape rank
// doesn't depend on the iteration limit, so when only the limit changes:
//  * raising it recomputes just the pixels that hadn't escaped yet
//    (proven-interior pixels stay as they are);
//  * lowering it needs no computation: late escapers turn interior.
// Returns the pixels that still need computing, in the shuffled order.
const UNKNOWN_RANK = -1;

function viewKey(state) {
  const c = state.center;
  return `${c.x}|${c.y}|${c.bits}|${state.zoom}|${state.width}x${state.height}`;
}

function pixelsToCompute(state, maxIter) {
  const order = pixelOrder(state);
  const ranks = state.ranks;
  const key = viewKey(state);

  if (key !== state.ranksKey) {
    state.ranksKey = key;
    state.ranksMaxIter = maxIter;
    ranks.fill(UNKNOWN_RANK);
    if (state.base) {
      // Start from the scaled previous image; every pixel is recomputed.
      drawPreview(state);
      state.image = state.ctx.getImageData(0, 0, state.width, state.height);
      state.pixels = new Uint32Array(state.image.data.buffer);
    } else {
      clear(state);
    }
    return order;
  }

  const previous = state.ranksMaxIter;
  const pixels = state.pixels;
  const interior = packColor(state.coloring.interior);
  for (let i = 0; i < ranks.length; i++) {
    const r = ranks[i];
    if (r === UNKNOWN_RANK || r === PROVEN_INTERIOR) continue;
    if (maxIter > previous) {
      if (r === previous) ranks[i] = UNKNOWN_RANK; // hadn't escaped: retry
    } else if (r >= maxIter) {
      ranks[i] = maxIter; // escapes too late for the new limit
      pixels[i] = interior;
    }
  }
  state.ranksMaxIter = maxIter;

  let count = 0;
  for (let i = 0; i < order.length; i++) if (ranks[order[i]] === UNKNOWN_RANK) count++;
  if (count === order.length) return order;
  const todo = new Uint32Array(count);
  for (let i = 0, k = 0; i < order.length; i++) {
    if (ranks[order[i]] === UNKNOWN_RANK) todo[k++] = order[i];
  }
  return todo;
}

// Rendering ---------------------------------------------
function render(state) {
  clearTimeout(state.renderTimer);
  const ps = pixelSize(state);
  const deep = ps < CONFIG.deepZoomPixelSize;
  const maxIter = state.maxIterations;
  const order = pixelsToCompute(state, maxIter);
  const reused = state.width * state.height - order.length;
  state.base = null;
  state.shown = currentView(state);
  state.moving = false;

  const setup = {
    deep,
    ps,
    lanes: CONFIG.lanes,
    width: state.width,
    height: state.height,
    maxIter,
    // float64 path: complex coordinate of the top-left pixel
    left: 0,
    top: 0,
    // perturbation path: filled in once the reference orbit is ready
    refX: null,
    refY: null,
    refLength: 0,
  };
  if (!deep) {
    const c = state.center;
    setup.left = Fixed.toDouble(c.x, c.bits) - (state.width / 2) * ps;
    setup.top = Fixed.toDouble(c.y, c.bits) + (state.height / 2) * ps;
  }

  const job = {
    id: ++state.jobCount,
    setup,
    ref: deep && order.length > 0 ? referenceOrbitFor(state, Fixed.bitsFor(ps)) : null,
    order,
    total: order.length,
    reused,
    next: 0, // pixels handed out
    done: 0, // pixels painted
    chunkSize: 1024,
    maxWorkers: Infinity, // lowered for long reference orbits
    workersUsed: 0,
    detect: deep, // deep interior detection; may switch off, see noteDetection
    probed: 0,
    detected: 0,
    ready: false,
    dirty: reused > 0, // reused pixels may have been recoloured
    lastDraw: 0,
    drawCost: 0,
    palette: buildPalette(state.coloring),
    interior: packColor(state.coloring.interior),
    startedAt: performance.now(),
  };

  state.job = job; // older jobs stop: their frames and results are ignored
  showView(state);
  saveLocationInUrl(state);
  showStatus(deep ? "starting deep render…" : "rendering…");
  showProgress(job.total > 0 ? 0 : 1);
  requestAnimationFrame(() => renderFrame(state, job));
}

function renderFrame(state, job) {
  if (state.job !== job) return;
  const now = performance.now();

  if (!job.ready) {
    const ref = job.ref;
    if (ref && !referenceReady(ref, job.setup.maxIter)) {
      advanceReferenceOrbit(ref, now + CONFIG.frameBudgetMs);
      if (!referenceReady(ref, job.setup.maxIter)) {
        const pct = Math.floor((100 * ref.length) / (job.setup.maxIter + 1));
        showStatus(`computing reference orbit… ${pct}%`);
        showProgress(0);
        requestAnimationFrame(() => renderFrame(state, job));
        return;
      }
    }
    if (ref) {
      const length = Math.min(ref.length, job.setup.maxIter + 1);
      // A full orbit is no longer written to, so it can be sent as is.
      job.setup.refX = length === ref.x.length ? ref.x : ref.x.slice(0, length);
      job.setup.refY = length === ref.y.length ? ref.y : ref.y.slice(0, length);
      job.setup.refLength = length;
      // Every worker gets its own copy of the orbit (16 bytes an iteration,
      // 160 MB at 10 million). Use fewer workers rather than run out of memory.
      job.maxWorkers = Math.max(1, Math.floor(CONFIG.referenceMemoryBudget / (16 * length)));
    }
    job.ready = true;
    if (state.workers) {
      state.workers.forEach((w) => w.busy || dispatch(state, w));
    }
  }

  if (!state.workers) renderOnMainThread(state, job, now + CONFIG.frameBudgetMs);

  // Redraw at most as often as the canvas can be uploaded comfortably.
  const finished = job.done >= job.total;
  if (job.dirty && (finished || now - job.lastDraw >= Math.max(16, job.drawCost * 4))) {
    const t = performance.now();
    state.ctx.putImageData(state.image, 0, 0);
    job.drawCost = performance.now() - t;
    job.lastDraw = t;
    job.dirty = false;
  }

  if (finished) {
    const seconds = ((performance.now() - job.startedAt) / 1000).toFixed(2);
    showStatus(`${describeJob(state, job)} · done in ${seconds}s`);
    showProgress(1);
  } else {
    showStatus(`${describeJob(state, job)} · ${Math.floor((100 * job.done) / job.total)}%`);
    showProgress(job.done / job.total);
    requestAnimationFrame(() => renderFrame(state, job));
  }
}

// Fallback when workers are unavailable.
function renderOnMainThread(state, job, deadline) {
  const ranks = new Int32Array(64);
  while (job.next < job.total && performance.now() < deadline) {
    const start = job.next;
    job.next = Math.min(job.total, start + 64);
    const indices = job.order.subarray(start, job.next);
    const r = ranks.subarray(0, indices.length);
    const detect = job.detect;
    const detected = computeRanks(job.setup, indices, r, detect);
    paint(state, job, indices, r);
    noteDetection(job, detect, indices.length, detected);
  }
}

function paint(state, job, indices, ranks) {
  const out = state.pixels,
    stored = state.ranks,
    palette = job.palette,
    bands = palette.length,
    interior = job.interior,
    maxIter = job.setup.maxIter;
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k],
      rank = ranks[k];
    stored[idx] = rank;
    out[idx] = rank >= maxIter ? interior : palette[rank % bands];
  }
  job.done += indices.length;
  job.dirty = true;
}

function describeJob(state, job) {
  const parts = [job.setup.deep ? `perturbation, ${Fixed.bitsFor(job.setup.ps)}-bit reference` : "float64"];
  if (job.setup.deep && job.detect && job.total > 0) parts.push("interior detection");
  parts.push(
    state.workers
      ? job.maxWorkers < state.workers.length
        ? `${job.maxWorkers} of ${state.workers.length} workers (memory)`
        : `${state.workers.length} workers`
      : "main thread"
  );
  if (job.reused > 0) {
    parts.push(`reused ${Math.round((100 * job.reused) / (job.reused + job.total))}%`);
  }
  return parts.join(" · ");
}

function clear(state) {
  state.ctx.clearRect(0, 0, state.width, state.height);
  state.pixels.fill(0);
}

// UI ---------------------------------------------
const $ = (selector) => document.querySelector(selector);

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

// 1 / zoom, e.g. "1×", "3.3×", "1,230×", "3.21 × 10⁹".
function formatMagnification(m) {
  if (m < 1e5) return `${Number(m.toPrecision(m < 10 ? 2 : 3)).toLocaleString("en-US")}×`;
  const [mantissa, exp] = m.toExponential(2).split("e");
  const power = String(Number(exp)).replace(/\d/g, (d) => SUPERSCRIPT[d]);
  return `${mantissa} × 10${power}`;
}

function showView(state) {
  showLocation(state);
  const mag = $("#magnification");
  if (mag) mag.textContent = formatMagnification(1 / state.zoom);
  const back = $("#backButton");
  if (back) back.disabled = state.history.length === 0;
}

function showLocation(state) {
  const el = document.querySelector("span.currentLocation");
  if (!el) return;
  const query = locationQuery(state);
  const link = document.createElement("a");
  link.href = "?" + query;
  link.textContent = query;
  el.replaceChildren(link);
}

// Keeps the address bar on the current view, so reloading or sharing the
// page comes back here. Browsers rate-limit replaceState, so this runs once
// per render rather than on every gesture step.
function saveLocationInUrl(state) {
  const isDefault = state.zoom === 1 && state.center.x === 0n && state.center.y === 0n;
  const query = isDefault && state.maxIterations === DEFAULT_ITERATIONS ? "" : "?" + locationQuery(state);
  try {
    history.replaceState(null, "", window.location.pathname + query);
  } catch (err) {
    // ignore: the link under "Location" still has it
  }
}

function showStatus(text) {
  const el = document.querySelector("span.renderStatus");
  if (el) el.textContent = text;
}

function showProgress(fraction) {
  const bar = $("#renderProgress");
  if (!bar) return;
  bar.style.transform = `scaleX(${fraction})`;
  bar.parentElement.classList.toggle("is-done", fraction >= 1);
}

// Navigation ---------------------------------------------
// Every view change goes through `navigate`: the preview updates at once,
// and the render starts after `delay` ms (0: now; null: not yet, the gesture
// renders when it ends). The view before a run of changes is kept for "back".
function navigate(state, change, delay = 0, remember = true) {
  if (!state.moving && remember) {
    state.history.push(currentView(state));
    if (state.history.length > 200) state.history.shift();
  }
  state.moving = true;
  beginPreview(state);
  change();
  drawPreview(state);
  showView(state);

  clearTimeout(state.renderTimer);
  if (delay === 0) {
    render(state);
    return;
  }
  showStatus("preview · renders when you stop moving");
  showProgress(0);
  if (delay !== null) state.renderTimer = setTimeout(() => render(state), delay);
}

function zoomCenter(state, factor) {
  navigate(state, () => zoomAt(state, state.width / 2, state.height / 2, factor), CONFIG.settleMs);
}

function goBack(state) {
  const view = state.history.pop();
  if (view) navigate(state, () => setView(state, view), 0, false);
}

function resetView(state) {
  navigate(state, () => setView(state, { x: 0n, y: 0n, bits: 64, zoom: 1 }));
}

// What a plain click does, depending on the click mode.
function clickAt(state, px, py) {
  const factor =
    state.clickMode === "zoomIn"
      ? 1 / state.zoomStep
      : state.clickMode === "zoomOut"
        ? state.zoomStep
        : 1;
  navigate(state, () => recenter(state, px, py, factor));
}

// Pointer position in device pixels (x, y) and CSS pixels (cssX, cssY).
function canvasPoint(state, e) {
  const rect = state.canvas.getBoundingClientRect();
  const scale = state.width / rect.width;
  const cssX = e.clientX - rect.left,
    cssY = e.clientY - rect.top;
  return { x: cssX * scale, y: cssY * scale, cssX, cssY };
}

// Mouse, pen and touch: click/tap uses the click mode, drag pans, shift-drag
// frames a box to zoom into, two fingers pan and pinch, the wheel (or a
// trackpad pinch) zooms around the pointer.
function attachPointerControls(state) {
  const canvas = state.canvas;
  const stage = $(".mb-stage");
  const box = $("#zoomBox");
  const pointers = new Map();
  let gesture = null; // press | pan | box | pinch | cancelled

  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const showBox = (a, b) => {
    box.style.left = Math.min(a.cssX, b.cssX) + "px";
    box.style.top = Math.min(a.cssY, b.cssY) + "px";
    box.style.width = Math.abs(a.cssX - b.cssX) + "px";
    box.style.height = Math.abs(a.cssY - b.cssY) + "px";
    box.hidden = false;
  };
  const hideBox = () => {
    box.hidden = true;
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); // no text selection or native drag
    canvas.setPointerCapture(e.pointerId);
    stage.focus({ preventScroll: true });
    const p = canvasPoint(state, e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      gesture = { type: "press", start: p, last: p, box: e.shiftKey };
    } else if (pointers.size === 2) {
      hideBox();
      stage.classList.remove("is-boxing");
      gesture = { type: "pinch", last: pinchInfo() };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = canvasPoint(state, e);
    pointers.set(e.pointerId, p);

    if (gesture.type === "pinch") {
      if (pointers.size < 2) return;
      const now = pinchInfo(),
        last = gesture.last;
      gesture.last = now;
      navigate(state, () => {
        panBy(state, now.x - last.x, now.y - last.y);
        if (now.dist > 0 && last.dist > 0) zoomAt(state, now.x, now.y, last.dist / now.dist);
      }, null);
      return;
    }
    if (gesture.type === "press") {
      const moved = Math.hypot(p.cssX - gesture.start.cssX, p.cssY - gesture.start.cssY);
      if (moved < 4) return;
      gesture.type = gesture.box ? "box" : "pan";
      stage.classList.add(gesture.type === "pan" ? "is-panning" : "is-boxing");
    }
    if (gesture.type === "pan") {
      const last = gesture.last;
      gesture.last = p;
      navigate(state, () => panBy(state, p.x - last.x, p.y - last.y), null);
    } else if (gesture.type === "box") {
      gesture.last = p;
      showBox(gesture.start, p);
    }
  });

  const end = (e) => {
    if (!pointers.delete(e.pointerId) || pointers.size > 0 || !gesture) return;
    const g = gesture;
    gesture = null;
    stage.classList.remove("is-panning", "is-boxing");
    hideBox();
    const cancelled = e.type === "pointercancel";

    if (g.type === "press" && !cancelled) {
      clickAt(state, g.start.x, g.start.y);
    } else if (g.type === "box" && !cancelled) {
      const w = Math.abs(g.last.cssX - g.start.cssX),
        h = Math.abs(g.last.cssY - g.start.cssY);
      if (w >= 8 && h >= 8) {
        navigate(state, () => zoomToBox(state, g.start.x, g.start.y, g.last.x, g.last.y));
      }
    } else if (state.moving) {
      render(state); // end of a pan or pinch
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  // Escape drops a box being drawn.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && gesture && gesture.type === "box") {
      gesture.type = "cancelled";
      stage.classList.remove("is-boxing");
      hideBox();
    }
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const rate = e.ctrlKey ? CONFIG.pinchWheelZoomRate : CONFIG.wheelZoomRate;
      const factor = Math.min(2, Math.max(0.5, Math.exp(e.deltaY * unit * rate)));
      const p = canvasPoint(state, e);
      navigate(state, () => zoomAt(state, p.x, p.y, factor), CONFIG.settleMs);
    },
    { passive: false }
  );

  // Safari reports trackpad pinches as gesture events, not ctrl+wheel. On
  // touch screens the pointer events above already handle pinching.
  let gestureScale = 1;
  canvas.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gestureScale = 1;
  });
  canvas.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (pointers.size >= 2) return;
    const factor = gestureScale / e.scale;
    gestureScale = e.scale;
    const p = canvasPoint(state, e);
    navigate(state, () => zoomAt(state, p.x, p.y, factor), CONFIG.settleMs);
  });
}

// + − zoom on the centre, 0 resets, Backspace goes back, arrows pan (unless
// another control, such as a link or the slider, has focus).
function attachKeyboardControls(state) {
  const stage = $(".mb-stage");
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
    const step = state.width * (e.shiftKey ? 0.4 : 0.12);

    switch (e.key) {
      case "+":
      case "=":
        zoomCenter(state, 1 / state.zoomStep);
        break;
      case "-":
      case "_":
        zoomCenter(state, state.zoomStep);
        break;
      case "0":
        resetView(state);
        break;
      case "Backspace":
        goBack(state);
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (!stage.contains(e.target) && e.target !== document.body) return;
        const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        navigate(state, () => panBy(state, dx, dy), CONFIG.settleMs);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  });
}

// On-screen pan pad. A press moves the view a fifth of its width; holding
// repeats, like a held key. The render waits until the arrows are released.
function attachPanPad(state) {
  const PAN_STEP = 0.2,
    REPEAT_DELAY = 400,
    REPEAT_EVERY = 160;

  document.querySelectorAll("[data-pan]").forEach((button) => {
    // Direction the view moves: the image itself moves the other way.
    const [ux, uy] = button.dataset.pan.split(",").map(Number);
    const step = (delay) => {
      const d = state.width * PAN_STEP;
      navigate(state, () => panBy(state, -ux * d, -uy * d), delay);
    };
    let timer = 0;

    const stop = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      if (state.moving) render(state);
    };
    const repeat = () => {
      step(null);
      timer = setTimeout(repeat, REPEAT_EVERY);
    };

    button.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      step(null);
      timer = setTimeout(repeat, REPEAT_DELAY);
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
    // Enter / Space on a focused arrow (pointer presses are handled above).
    button.addEventListener("click", (e) => {
      if (e.detail === 0) step(CONFIG.settleMs);
    });
  });
}

// Controls ---------------------------------------------
function clickModeZoomIn() {
  setClickMode("zoomIn");
}

function clickModeZoomOut() {
  setClickMode("zoomOut");
}

function clickModeCenter() {
  setClickMode("center");
}

function setClickMode(mode) {
  state.clickMode = mode;
  const stage = $(".mb-stage");
  if (stage) stage.dataset.mode = mode;
}

function resize(state, width, height) {
  beginPreview(state); // the old image, rescaled, shows while it renders
  setCanvasSize(state, width, height);
  render(state);
}

// Sizes in CSS pixels; the canvas has devicePixelRatio times as many.
const SIZES = {
  xs: [140, 90],
  s: [280, 180],
  m: [560, 360],
  l: [1120, 720],
  full: [2880, 1800],
};

// "Fit": as wide as the page allows, and not taller than the window.
function fitSize() {
  const viewport = $(".mb-viewport");
  const width = Math.max(200, Math.floor(viewport ? viewport.clientWidth : 280));
  const height = Math.round(Math.min(width * 0.75, Math.max(280, window.innerHeight * 0.7)));
  return [width, height];
}

function setSizeMode(mode) {
  state.sizeMode = mode;
  const [width, height] = mode === "fit" ? fitSize() : SIZES[mode];
  resize(state, width, height);
}

function sizeXSmall() {
  setSizeMode("xs");
}

function sizeSmall() {
  setSizeMode("s");
}

function sizeMedium() {
  setSizeMode("m");
}

function sizeLarge() {
  setSizeMode("l");
}

function sizeFull() {
  setSizeMode("full");
}

function sizeCustom(x, y) {
  resize(state, x, y);
}

function generateImage() {
  const output = document.querySelector("div.imageOutput");
  const magnification = formatMagnification(1 / state.zoom);
  const src = state.canvas.toDataURL();

  const img = new Image();
  img.src = src;
  // Shown at the page width (CSS); the PNG keeps its full resolution.
  img.alt = `Mandelbrot set at ${magnification} magnification`;

  const link = document.createElement("a");
  link.href = src;
  link.download = imageFileName(state);
  link.textContent = "Download PNG";

  const caption = document.createElement("figcaption");
  caption.append(`${state.width} × ${state.height} px · ${magnification} · `, link);

  const figure = document.createElement("figure");
  figure.className = "mb-shot";
  figure.append(img, caption);
  output.appendChild(figure);
  output.hidden = false;
  figure.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// e.g. mandelbrot_x=-1.7499977518652907_y=3.9513418543621205e-8_z=8.084e-22_2432x1260.png
// The location link's values, so the view can be found again, plus the
// image size in pixels. Past about 10^80 magnification the coordinates are
// cut short to keep the name within filesystem limits (255 characters).
function imageFileName(state) {
  const params = new URLSearchParams(locationQuery(state));
  const shorten = (value, max) => {
    if (value.length <= max) return value;
    const exp = /e-?\d+$/.exec(value);
    return value.slice(0, max - (exp ? exp[0].length : 0)) + (exp ? exp[0] : "");
  };
  const parts = [
    `x=${shorten(params.get("x"), 90)}`,
    `y=${shorten(params.get("y"), 90)}`,
    `z=${params.get("z")}`,
    `${state.width}x${state.height}`,
  ];
  return `mandelbrot_${parts.join("_")}.png`;
}

function copyLocation(state, button) {
  const url = window.location.origin + window.location.pathname + "?" + locationQuery(state);
  const label = button.textContent;
  const done = (text) => {
    button.textContent = text;
    setTimeout(() => (button.textContent = label), 1400);
  };
  if (!navigator.clipboard) return done("Not available");
  navigator.clipboard.writeText(url).then(
    () => done("Copied"),
    () => done("Copy failed")
  );
}

// The slider is logarithmic: its value is log10 of the iteration limit, so it
// covers 1,000 to 10,000,000 with useful resolution at both ends. Each step is
// rounded to two significant figures (2,500 / 13,000 / 1,200,000).
const MAX_ITERATIONS = 10000000;
const DEFAULT_ITERATIONS = 2500;
function sliderIterations(value) {
  const n = 10 ** parseFloat(value);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.min(MAX_ITERATIONS, Math.round(n / unit) * unit);
}

function showIterations(e) {
  document.getElementById("iterationsValue").textContent =
    sliderIterations(e.target.value).toLocaleString("en-US");
}

function iterations(e) {
  showIterations(e);
  state.maxIterations = sliderIterations(e.target.value);
  render(state);
}

function bindRadios(name, handler) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.addEventListener("change", () => input.checked && handler(input.value));
  });
}

function bindControls(state) {
  bindRadios("clickMode", setClickMode);
  bindRadios("zoomStep", (value) => (state.zoomStep = parseFloat(value)));
  bindRadios("size", setSizeMode);

  const slider = document.getElementById("rangeIterations");
  slider.value = Math.log10(state.maxIterations);
  showIterations({ target: slider });
  slider.onchange = iterations;
  slider.oninput = showIterations;

  $("#zoomInButton").addEventListener("click", () => zoomCenter(state, 1 / state.zoomStep));
  $("#zoomOutButton").addEventListener("click", () => zoomCenter(state, state.zoomStep));
  $("#backButton").addEventListener("click", () => goBack(state));
  $("#copyButton").addEventListener("click", (e) => copyLocation(state, e.currentTarget));
  $("#generateButton").addEventListener("click", generateImage);

  // Keep "Fit" fitted when the page width changes.
  const viewport = $(".mb-viewport");
  if (window.ResizeObserver && viewport) {
    let timer = 0,
      lastWidth = viewport.clientWidth;
    new ResizeObserver(() => {
      if (viewport.clientWidth === lastWidth) return;
      lastWidth = viewport.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(() => state.sizeMode === "fit" && setSizeMode("fit"), 150);
    }).observe(viewport);
  }
}

// Main entry ---------------------------------------------
let state;

function start() {
  const canvas = document.getElementById("board");
  state = initialState(canvas);
  state.workers = createWorkerPool(state);
  const [width, height] = fitSize();
  setCanvasSize(state, width, height);
  applyUrlLocation(state);

  bindControls(state);
  setClickMode(state.clickMode);
  attachPointerControls(state);
  attachKeyboardControls(state);
  attachPanPad(state);

  render(state);
}

window.addEventListener("DOMContentLoaded", start);
