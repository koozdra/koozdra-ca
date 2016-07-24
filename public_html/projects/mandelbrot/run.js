//var _ = require('lodash');

// Types ---------------------------------------------

function Point(x, y) {
  return {
    x: x,
    y: y
  }
}

function ViewPort(tl, br) {
  return {
    tl: tl,
    br: br
  }
}

function Color(r, g, b, a) {
  return {
    r: r,
    g: g,
    b: b,
    a: a
  }
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

var Colors = {
  black: Color(0, 0, 0, 255),
  white: Color(255, 255, 255, 255)
};


function initialState(canvas) {
  var ctx = canvas.getContext('2d'),
    ctxScale = 1;

  console.log(window.devicePixelRatio, canvas.width)

  // messy canvas crap
  if (window.devicePixelRatio > 1) {
    var canvasWidth = canvas.width;
    var canvasHeight = canvas.height;

    canvas.width = canvasWidth * window.devicePixelRatio;
    canvas.height = canvasHeight * window.devicePixelRatio;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctxScale = window.devicePixelRatio;
  }
  //------------------------------------------------

  var width = canvas.width,
    height = canvas.height,
    bufferRow = ctx.createImageData(width, 1);

  return {
    bufferPixel: ctx.createImageData(1, 1),
    bufferRow: bufferRow,
    bufferRowData: bufferRow.data,
    ctx: ctx,
    ctxScale: ctxScale,
    width: width,
    height: height,
    viewPort: ViewPort(Point(-width / 2, height / 2), Point(width / 2, -height / 2)),
    rank: {
      timeout: 10000,
      steps: 23,
      colors: [
        Colors.black,
        Colors.white
      ]
    },
    interactions: {
      click: 'zoomIn'
    }
  };
}

function mandelbrotRank (state, point) {
  var i = 0,
    zx = point.x,
    zy = point.y;

  while (zx*zx + zy*zy < 4 && i < state.rank.timeout){
    var tx = zx*zx - zy*zy + point.x,
      ty = 2*zx*zy + point.y;

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

function currySpread(arr, fn) {
  _.each(arr, fn);
  return fn;
}



var i = 0
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

    if (state.width != ctxRow.width) {
      ctxRow = ctx.createImageData(state.width, 1);
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

  function drawByRowInner(state, renderState) {
    drawRow(state, renderState.y);
    if (renderState.y < state.height - 1 && renderState.active) {
      renderState.y += 1;
      requestAnimationFrame(_.partial(drawByRowInner, state, renderState));
    }
  }

  var renderState = {
    y: 0,
    active: true
  };

  requestAnimationFrame(_.partial(drawByRowInner, state, renderState));

  return renderState;
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
};

function transition(state) {
  // TODO
  //var history = [];

  var centerZoomViewPort = _.curry(function(state, z) {
    // TODO clone state and store in history

    var dx = ((state.viewPort.br.x - state.viewPort.tl.x) * (1 - z)) / 2,
      dy = ((state.viewPort.br.y - state.viewPort.tl.y) * (1 - z)) / 2;

    state.viewPort = ViewPort(
      Point(
        state.viewPort.tl.x + dx,
        state.viewPort.tl.y + dy
      ),
      Point(
        state.viewPort.br.x - dx,
        state.viewPort.br.y - dy
      )
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
      Point(
        state.viewPort.tl.x + dx,
        state.viewPort.tl.y + dy
      ),
      Point(
        state.viewPort.br.x + dx,
        state.viewPort.br.y + dy
      )
    );

    return state;
  });

  //var setMouseClickZoomIn = _()

  return {
    centerZoomViewPort: centerZoomViewPort(state),
    centerViewPortAt: centerViewPortAt(state),
    state: function() { return state; }
  }
};

function clear(state){
  state.ctx.clearRect(0, 0, state.width, state.height);
}

function start(){
  var canvas = document.getElementById('board'),
    state = initialState(canvas);

  d3.select(canvas).on('click', function(e) {
    if (state.renderState) {
      state.renderState.active = false;
    }

    requestAnimationFrame(_.partial(clear, state));

    var mouse = d3.mouse(this),
      point = Point(mouse[0] * state.ctxScale, mouse[1] * state.ctxScale);

    state = transition(state).centerViewPortAt(point);

    if (state.interactions.click === 'zoomIn') {
      state = transition(state).centerZoomViewPort(0.3);
    } else if (state.interactions.click === 'zoomOut') {
      state = transition(state).centerZoomViewPort(1.7);
    }

    state.renderState = drawByRow(state);

    d3.select('span.currentLocation').html('test');

    var br = state.viewPort.br,
      tl = state.viewPort.tl;

    console.log(state.viewPort, JSON.stringify({
      x: tl.x + (br.x - tl.x) / 2,
      y: tl.y + (br.y - tl.y) / 2,
      z: state.viewPort.zoom
    }))

  });

  state = transition(state).centerZoomViewPort(0.02);

  state.renderState = drawByRow(state);

  return state;
}


var state = start();

function clickModeZoomIn() {
  state.interactions.click = 'zoomIn';
}

function clickModeZoomOut() {
  state.interactions.click = 'zoomOut';
}

function clickModeCenter() {
  state.interactions.click = 'center';
}
