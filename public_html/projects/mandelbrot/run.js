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
  zoomInFactor: 0.3,
  zoomOutFactor: 1.7,
  // Switch to perturbation below this pixel size (complex units per device
  // pixel). Above it, float64 coordinates are accurate enough.
  deepZoomPixelSize: 1e-12,
  // float64 pixel offsets underflow near 1e-308; stop zooming well before.
  minPixelSize: 1e-290,
  frameBudgetMs: 60,
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

// Moves the centre to a device-pixel position, then applies the zoom factor.
function recenter(state, px, py, zoomFactor) {
  const ps = pixelSize(state);
  let newZoom = state.zoom * zoomFactor;
  if (pixelSize({ zoom: newZoom, width: state.width }) < CONFIG.minPixelSize) {
    newZoom = state.zoom; // float64 deltas would underflow; stop zooming
  }

  setCenterBits(state, Fixed.bitsFor(Math.min(ps, ps * zoomFactor)));
  const c = state.center;
  c.x += Fixed.fromDouble((px - state.width / 2) * ps, c.bits);
  c.y += Fixed.fromDouble((state.height / 2 - py) * ps, c.bits);
  state.zoom = newZoom;
}

function locationQuery(state) {
  const c = state.center;
  const places = Math.max(17, Math.ceil(-Math.log10(pixelSize(state))) + 3);
  const x = Fixed.toDecimal(c.x, c.bits, places);
  const y = Fixed.toDecimal(c.y, c.bits, places);
  return `x=${x}&y=${y}&zoom=${state.zoom}`;
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
    maxIterations: 2500,
    coloring: {
      steps: 23,
      colors: [Colors.black, Colors.white],
      interior: Colors.black,
    },
    clickMode: "zoomIn",
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
  const zoom = parseFloat(params.get("zoom"));
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
    clear(state);
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
  const ps = pixelSize(state);
  const deep = ps < CONFIG.deepZoomPixelSize;
  const maxIter = state.maxIterations;
  const order = pixelsToCompute(state, maxIter);
  const reused = state.width * state.height - order.length;

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
  showLocation(state);
  showStatus(deep ? "starting deep render…" : "rendering…");
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
        requestAnimationFrame(() => renderFrame(state, job));
        return;
      }
    }
    if (ref) {
      const length = Math.min(ref.length, job.setup.maxIter + 1);
      job.setup.refX = ref.x.slice(0, length);
      job.setup.refY = ref.y.slice(0, length);
      job.setup.refLength = length;
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
  } else {
    showStatus(`${describeJob(state, job)} · ${Math.floor((100 * job.done) / job.total)}%`);
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
  parts.push(state.workers ? `${state.workers.length} workers` : "main thread");
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
function showLocation(state) {
  const el = document.querySelector("span.currentLocation");
  if (!el) return;
  const query = locationQuery(state);
  const link = document.createElement("a");
  link.href = "?" + query;
  link.textContent = query;
  el.replaceChildren(link);
}

function showStatus(text) {
  const el = document.querySelector("span.renderStatus");
  if (el) el.textContent = text;
}

function onCanvasClick(e) {
  // offsetX/Y are CSS pixels inside the border; convert to device pixels.
  const scale = state.width / state.canvas.clientWidth;
  const px = e.offsetX * scale,
    py = e.offsetY * scale;

  const factor =
    state.clickMode === "zoomIn"
      ? CONFIG.zoomInFactor
      : state.clickMode === "zoomOut"
        ? CONFIG.zoomOutFactor
        : 1;

  recenter(state, px, py, factor);
  render(state);
}

function clickModeZoomIn() {
  state.clickMode = "zoomIn";
}

function clickModeZoomOut() {
  state.clickMode = "zoomOut";
}

function clickModeCenter() {
  state.clickMode = "center";
}

function resize(state, width, height) {
  setCanvasSize(state, width, height);
  render(state);
}

function sizeXSmall() {
  resize(state, 140, 90);
}

function sizeSmall() {
  resize(state, 280, 180);
}

function sizeMedium() {
  resize(state, 560, 360);
}

function sizeLarge() {
  resize(state, 1120, 720);
}

function sizeFull() {
  resize(state, 2880, 1800);
}

function sizeCustom(x, y) {
  resize(state, x, y);
}

function generateImage() {
  const img = new Image();
  const output = document.querySelector("div.imageOutput");

  img.onload = function () {
    img.width = img.naturalWidth / state.dpr;
  };
  img.src = state.canvas.toDataURL();

  output.appendChild(document.createElement("br"));
  output.appendChild(img);
}

function iterations(e) {
  state.maxIterations = parseInt(e.target.value, 10);
  render(state);
}

// Main entry ---------------------------------------------
let state;

function start() {
  const canvas = document.getElementById("board");
  state = initialState(canvas);
  state.workers = createWorkerPool(state);
  applyUrlLocation(state);

  canvas.addEventListener("click", onCanvasClick);
  document.getElementById("rangeIterations").onchange = iterations;

  render(state);
}

window.addEventListener("DOMContentLoaded", start);
