// Types ---------------------------------------------
function Point(x, y) {
  return {
    x: x,
    y: y
  };
}

function ViewPort(tl, br) {
  return {
    tl: tl,
    br: br
  };
}

function Color(r, g, b, a) {
  return {
    r: r,
    g: g,
    b: b,
    a: a
  };
}
// Types ---------------------------------------------

function colorRangeAt(c1, c2, z) {
  return Color(
    rangeAt(c1.r, c2.r, z),
    rangeAt(c1.g, c2.g, z),
    rangeAt(c1.b, c2.b, z),
    rangeAt(c1.a, c2.a, z)
  );
}

const Colors = {
  black: Color(0, 0, 0, 255),
  white: Color(255, 255, 255, 255)
};

function setUpCanvas(ctx, canvas) {
  // messy canvas crap
  if (window.devicePixelRatio > 1) {
    setUpCanvasDimensions(canvas);
  }
  //------------------------------------------------
}

function setUpCanvasDimensions(canvas) {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  canvas.width = canvasWidth * window.devicePixelRatio;
  canvas.height = canvasHeight * window.devicePixelRatio;
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
}

function initialState(canvas) {
  const ctx = canvas.getContext('2d');
  const ctxScale = window.devicePixelRatio;

  setUpCanvas(ctx, canvas);

  const width = canvas.width;
  const height = canvas.height;
  const bufferRow = ctx.createImageData(width, 1);

  return {
    bufferRow,
    ctx,
    canvas,
    ctxScale,
    width,
    height,
    bufferRowData: bufferRow.data,
    bufferPixel: ctx.createImageData(1, 1),
    viewPort: ViewPort(
      Point(-width / 2, height / 2),
      Point(width / 2, -height / 2)
    ),
    zoom: 1,
    rank: {
      timeout: 2500,
      steps: 23,
      colors: [Colors.black, Colors.white]
    },
    interactions: {
      click: 'zoomIn'
    }
  };
}

function mandelbrotRank(state, point) {
  var i = 0,
    zx = point.x,
    zy = point.y;

  while (zx * zx + zy * zy < 4 && i < state.rank.timeout) {
    var tx = zx * zx - zy * zy + point.x,
      ty = 2 * zx * zy + point.y;

    zx = tx;
    zy = ty;

    i += 1;
  }

  return i;
}

function drawPixel(state, point, color) {
  state.bufferPixel.data[0] = color.r;
  state.bufferPixel.data[1] = color.g;
  state.bufferPixel.data[2] = color.b;
  state.bufferPixel.data[3] = color.a;

  state.ctx.putImageData(state.bufferPixel, point.x, point.y);
}

function rangeAt(a, b, x) {
  return a + (b - a) * x;
}

function rankColor(state, point) {
  var rank = mandelbrotRank(state, point);

  if (rank < state.rank.timeout) {
    var div = Math.floor(rank / state.rank.steps),
      mod = rank % state.rank.steps,
      currentColor = state.rank.colors[div % state.rank.colors.length],
      destColor = state.rank.colors[(div + 1) % state.rank.colors.length];

    return colorRangeAt(currentColor, destColor, mod / state.rank.steps);
  } else {
    return Colors.black;
  }
}

function drawRow(state, y) {
  var ctxRow = state.ctx.createImageData(state.width, 1),
    ctxRowData = ctxRow.data;

  drawRow = function(state, y) {
    if (state.canvas.width != ctxRow.width) {
      ctxRow = state.ctx.createImageData(state.canvas.width, 1);
      ctxRowData = ctxRow.data;
    }

    _.times(state.width, function(x) {
      var point = Point(x, y);

      var mappedPoint = mapIntoViewPort(state, point, state.viewPort);

      var color = rankColor(state, mappedPoint);

      ctxRowData[4 * x] = color.r;
      ctxRowData[4 * x + 1] = color.g;
      ctxRowData[4 * x + 2] = color.b;
      ctxRowData[4 * x + 3] = color.a;
    });
    state.ctx.putImageData(ctxRow, 0, y);
  };

  drawRow(state, y);
}

function drawByRow(state) {
  state.renderState = {
    y: 0
  };

  function drawByRowInner(state) {
    const renderState = state.renderState;
    drawRow(state, renderState.y);

    if (renderState.y < state.height - 1) {
      renderState.y += 1;
      requestAnimationFrame(_.partial(drawByRowInner, state));
    }
  }

  requestAnimationFrame(_.partial(drawByRowInner, state));
}

function mapIntoViewPort(state, point, viewPort) {
  return Point(
    viewPort.tl.x + point.x * ((viewPort.br.x - viewPort.tl.x) / state.width),
    viewPort.tl.y + point.y * ((viewPort.br.y - viewPort.tl.y) / state.height)
  );
}

function centerViewPort(state, point, viewPort) {
  var vxy = mapIntoViewPort(state, point, viewPort);

  return _.extend({}, viewPort, {
    x: viewPort.x + vxy.x - viewPort.width / 2,
    y: viewPort.y + vxy.y - viewPort.height / 2
  });
}

function transition(state) {
  // TODO
  //var history = [];

  // TODO clone state and store in history for all function calls

  var centerZoomViewPort = _.curry(function(state, z) {
    var dx = (state.viewPort.br.x - state.viewPort.tl.x) * (1 - z) / 2,
      dy = (state.viewPort.br.y - state.viewPort.tl.y) * (1 - z) / 2;

    state.viewPort = ViewPort(
      Point(state.viewPort.tl.x + dx, state.viewPort.tl.y + dy),
      Point(state.viewPort.br.x - dx, state.viewPort.br.y - dy)
    );

    return state;
  });

  var centerViewPortAt = _.curry(function(state, point) {
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

  var changeViewWindowSize = _.curry(function(state, width, height) {});

  return {
    centerZoomViewPort: centerZoomViewPort(state),
    centerViewPortAt: centerViewPortAt(state),
    changeViewWindowSize: changeViewWindowSize(state),
    state: function() {
      return state;
    }
  };
}

function clear(state) {
  // requestAnimationFrame(() => {
  //   state.ctx.clearRect(0, 0, state.width, state.height);
  // });

  state.ctx.clearRect(0, 0, state.width, state.height);
}

function start() {
  const canvas = document.getElementById('board');
  let state = initialState(canvas);

  d3.select(canvas).on('click', function(e) {
    // if (state.renderState) {
    //   state.renderState.active = false;
    // }

    clear(state);

    const mouse = d3.mouse(this);
    const point = Point(mouse[0] * state.ctxScale, mouse[1] * state.ctxScale);

    console.log(mouse, point);

    var mappedPoint = mapIntoViewPort(state, point, state.viewPort);

    d3.select('span.currentLocation').html(
      JSON.stringify({
        x: mappedPoint.x,
        y: mappedPoint.y
      })
    );

    state = transition(state).centerViewPortAt(point);

    if (state.interactions.click === 'zoomIn') {
      state = transition(state).centerZoomViewPort(0.3);
    } else if (state.interactions.click === 'zoomOut') {
      state = transition(state).centerZoomViewPort(1.7);
    }

    drawByRow(state);
  });

  state = transition(state).centerZoomViewPort(0.02);

  //state.viewPort = JSON.parse('{"tl":{"x":-1.7499333634530672,"y":7.200756595495622e-10},"br":{"x":-1.749933362802201,"y":3.0166153142956183e-10}}')

  drawByRow(state);

  return state;
}

var state = start();

console.log(state);

function clickModeZoomIn() {
  state.interactions.click = 'zoomIn';
}

function clickModeZoomOut() {
  state.interactions.click = 'zoomOut';
}

function clickModeCenter() {
  state.interactions.click = 'center';
}

function resize(state, width, height) {
  clear(state);

  state.width = width * state.ctxScale;
  state.height = height * state.ctxScale;

  state.canvas.width = width;
  state.canvas.height = height;
  setUpCanvas(state.ctx, state.canvas);

  drawByRow(state);
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

function generateImage() {
  var img = new Image();
  img.src = state.canvas.toDataURL();
  const output = document.querySelector('div.imageOutput');

  output.appendChild(document.createElement('br'));
  output.appendChild(img);

  img.width /= state.ctxScale;
}

function iterations(n) {
  state.rank.timeout = n;

  clear(state);
  drawByRow(state);
}
