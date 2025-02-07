// Types ---------------------------------------------
function Point(x, y) {
  return {
    x: x,
    y: y,
  };
}

function ViewPort(tl, br) {
  return {
    tl: tl,
    br: br,
  };
}

function Color(r, g, b, a) {
  return {
    r: r,
    g: g,
    b: b,
    a: a,
  };
}

const Colors = {
  black: Color(0, 0, 0, 255),
  white: Color(255, 255, 255, 255),
};

// Helper math functions
function complexAbs(p) {
  return Math.sqrt(Math.pow(p.x, 2) + Math.pow(p.y, 2));
}

function rangeAt(a, b, x) {
  return a + (b - a) * x;
}

function colorRangeAt(c1, c2, z) {
  return Color(
    rangeAt(c1.r, c2.r, z),
    rangeAt(c1.g, c2.g, z),
    rangeAt(c1.b, c2.b, z),
    rangeAt(c1.a, c2.a, z)
  );
}

// Canvas setup ---------------------------------------------
function setUpCanvas(ctx, canvas) {
  // messy canvas crap
  if (window.devicePixelRatio > 1) {
    setUpCanvasDimensions(canvas);
  }
}

function setUpCanvasDimensions(canvas) {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  canvas.width = canvasWidth * window.devicePixelRatio;
  canvas.height = canvasHeight * window.devicePixelRatio;
  canvas.style.width = canvasWidth + "px";
  canvas.style.height = canvasHeight + "px";
}

// Initial state setup ---------------------------------------------
function initialState(canvas) {
  const ctx = canvas.getContext("2d");
  const ctxScale = window.devicePixelRatio;

  setUpCanvas(ctx, canvas);

  const width = canvas.width;
  const height = canvas.height;
  // Create a full-canvas image data buffer
  const bufferAll = ctx.createImageData(width, height);

  return {
    bufferAll,
    ctx,
    canvas,
    ctxScale,
    width,
    height,
    viewPort: ViewPort(
      Point(-width / 2, height / 2),
      Point(width / 2, -height / 2)
    ),
    zoom: 1,
    rank: {
      timeout: 2500,
      steps: 23,
      colors: [Colors.black, Colors.white],
    },
    interactions: {
      click: "zoomIn",
    },
  };
}

// Mandelbrot calculation ---------------------------------------------
function mandelbrotRank(state, point) {
  var i = 0,
    zx = point.x,
    zy = point.y;

  while (zx * zx + zy * zy < 4 && i < state.rank.timeout) {
    var tx = zx * zx - zy * zy + point.x,
      ty = 2 * zx * zy + point.y;

    if (tx === zx && ty === zy) {
      i = state.rank.timeout - 1;
    }

    zx = tx;
    zy = ty;

    i += 1;
  }

  return { rank: i, zn: Point(zx, zy) };
}

function rankColor(state, point) {
  var { rank, zn } = mandelbrotRank(state, point);

  if (rank < state.rank.timeout) {
    const div = Math.floor(rank / state.rank.steps);
    const mod = rank % state.rank.steps;
    const currentColor = state.rank.colors[div % state.rank.colors.length];
    const destColor = state.rank.colors[(div + 1) % state.rank.colors.length];

    return colorRangeAt(currentColor, destColor, mod / state.rank.steps);
  } else {
    return Colors.black;
  }
}

// Mapping functions ---------------------------------------------
function mapIntoViewPort(state, point, viewPort) {
  return Point(
    viewPort.tl.x + point.x * ((viewPort.br.x - viewPort.tl.x) / state.width),
    viewPort.tl.y + point.y * ((viewPort.br.y - viewPort.tl.y) / state.height)
  );
}

// Randomized drawing routine ---------------------------------------------
function drawRandomPixels(state) {
  // Create an array of every pixel coordinate
  const pixels = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      pixels.push({ x: x, y: y });
    }
  }
  // Shuffle the array randomly using underscore's _.shuffle
  const shuffledPixels = _.shuffle(pixels);

  // Set up render state to process a chunk at a time
  state.renderState = {
    pixels: shuffledPixels,
    index: 0,
    chunkSize: 100000, // adjust the chunk size to balance speed/responsiveness
  };

  function drawRandomInner() {
    const rs = state.renderState;
    const data = state.bufferAll.data;
    const total = rs.pixels.length;

    for (let i = 0; i < rs.chunkSize && rs.index < total; i++, rs.index++) {
      const pt = rs.pixels[rs.index];
      // Map the canvas coordinate to the viewport coordinate
      const mappedPt = mapIntoViewPort(state, pt, state.viewPort);
      const color = rankColor(state, mappedPt);
      const idx = (pt.y * state.width + pt.x) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = color.a;
    }

    state.ctx.putImageData(state.bufferAll, 0, 0);

    if (rs.index < total) {
      requestAnimationFrame(drawRandomInner);
    }
  }

  requestAnimationFrame(drawRandomInner);
}

// Transition functions (zooming, panning) ---------------------------------------------
function transition(state) {
  // NOTE: a history of states could be stored here if desired.
  var centerZoomViewPort = _.curry(function (state, z) {
    var dx = ((state.viewPort.br.x - state.viewPort.tl.x) * (1 - z)) / 2,
      dy = ((state.viewPort.br.y - state.viewPort.tl.y) * (1 - z)) / 2;

    state.viewPort = ViewPort(
      Point(state.viewPort.tl.x + dx, state.viewPort.tl.y + dy),
      Point(state.viewPort.br.x - dx, state.viewPort.br.y - dy)
    );

    return state;
  });

  var centerViewPortAt = _.curry(function (state, point) {
    var mp = mapIntoViewPort(state, point, state.viewPort),
      cx = (state.viewPort.br.x + state.viewPort.tl.x) / 2,
      cy = (state.viewPort.br.y + state.viewPort.tl.y) / 2,
      dx = mp.x - cx,
      dy = mp.y - cy;

    state.viewPort = ViewPort(
      Point(state.viewPort.tl.x + dx, state.viewPort.tl.y + dy),
      Point(state.viewPort.br.x + dx, state.viewPort.br.y + dy)
    );

    return state;
  });

  var changeViewWindowSize = _.curry(function (state, width, height) {
    // TODO: implement changing view window size if needed
  });

  return {
    centerZoomViewPort: centerZoomViewPort(state),
    centerViewPortAt: centerViewPortAt(state),
    changeViewWindowSize: changeViewWindowSize(state),
    state: function () {
      return state;
    },
  };
}

// Clear the canvas ---------------------------------------------
function clear(state) {
  state.ctx.clearRect(0, 0, state.width, state.height);
  // Also clear our full-buffer by zeroing out its data.
  for (let i = 0; i < state.bufferAll.data.length; i++) {
    state.bufferAll.data[i] = 0;
  }
}

// Main entry ---------------------------------------------
function start() {
  const canvas = document.getElementById("board");
  let state = initialState(canvas);

  d3.select(canvas).on("click", function (e) {
    clear(state);

    const mouse = d3.mouse(this);
    const point = Point(mouse[0] * state.ctxScale, mouse[1] * state.ctxScale);

    console.log(mouse, point);

    var mappedPoint = mapIntoViewPort(state, point, state.viewPort);

    d3.select("span.currentLocation").html(
      JSON.stringify({
        x: mappedPoint.x,
        y: mappedPoint.y,
      })
    );

    state = transition(state).centerViewPortAt(point);

    if (state.interactions.click === "zoomIn") {
      state = transition(state).centerZoomViewPort(0.3);
    } else if (state.interactions.click === "zoomOut") {
      state = transition(state).centerZoomViewPort(1.7);
    }

    drawRandomPixels(state);
  });

  // initial zoom-in from a wide view:
  state = transition(state).centerZoomViewPort(0.02);
  drawRandomPixels(state);

  const rangeIterationElement = document.getElementById("rangeIterations");
  rangeIterationElement.onchange = iterations;

  return state;
}

var state = start();

console.log(state);

// UI functions ---------------------------------------------
function clickModeZoomIn() {
  state.interactions.click = "zoomIn";
}

function clickModeZoomOut() {
  state.interactions.click = "zoomOut";
}

function clickModeCenter() {
  state.interactions.click = "center";
}

function resize(state, width, height) {
  clear(state);

  state.width = width * state.ctxScale;
  state.height = height * state.ctxScale;

  state.canvas.width = width;
  state.canvas.height = height;
  setUpCanvas(state.ctx, state.canvas);

  // Create a new full-buffer for the updated canvas size.
  state.bufferAll = state.ctx.createImageData(state.width, state.height);

  drawRandomPixels(state);
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
  var img = new Image();
  img.src = state.canvas.toDataURL();
  const output = document.querySelector("div.imageOutput");

  output.appendChild(document.createElement("br"));
  output.appendChild(img);

  img.width /= state.ctxScale;
}

function iterations(e) {
  state.rank.timeout = parseInt(e.target.value);
  clear(state);
  drawRandomPixels(state);
}
