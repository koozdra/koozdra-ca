function Point(x, y) {
  const point = {
    x: x,
    y: y,
    neighbours() {
      return [
        Point(this.x + 1, this.y + 0),
        Point(this.x + -1, this.y + 0),
        Point(this.x + 0, this.y + 1),
        Point(this.x + 0, this.y + -1)
      ];
    },
    moveBy(x, y) {
      point.x += x;
      point.y += y;

      return this;
    }
  }

  return point;
}

function Color(r, g, b, a) {
  function rangeAt(a, b, x) {
    return a + (b - a) * x;
  }

  return {
    r: r,
    g: g,
    b: b,
    a: a,
    rangeTo(c, z) {
      return Color(
        rangeAt(this.r, c.r, z),
        rangeAt(this.g, c.g, z),
        rangeAt(this.b, c.b, z),
        rangeAt(this.a, c.a, z)
      );
    }
  }
}

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
  white: Color(255, 255, 255, 255),
  red: Color(255, 0, 0, 255),
  green: Color(0, 255, 0, 255)
};

function setUpCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  // messy canvas crap
  if (window.devicePixelRatio > 1) {

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    canvas.width = canvasWidth * window.devicePixelRatio;
    canvas.height = canvasHeight * window.devicePixelRatio;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  //------------------------------------------------
}

const canvas = document.getElementById('board');
setUpCanvas(canvas);



function Board(canvas) {
  const ctx = canvas.getContext('2d');
  const state = new WeakMap();
  const bufferPixel = ctx.createImageData(1, 1);
  const bufferPixelData= bufferPixel.data;
  const width = canvas.width;
  const height = canvas.height;

  function offset(p) {
    return p.y * height + p.x;
  }

  const board = {
    setPoint(v, p) {
      state[offset(p)] = v
      return board;
    },
    getPoint(p) {
      // console.log(state, p, offset(p), state[offset(p)]);
      return state[offset(p)];
    },
    isEmpty(p) {
      return _.isUndefined(board.getPoint(p));
    },
    center() {
      return Point(Math.floor(width / 2), Math.floor(height / 2));
    },
    renderPoint(colorF, p) {
      const {r, g, b, a} = colorF(board.getPoint(p));
      bufferPixel.data[0] = r;
      bufferPixel.data[1] = g;
      bufferPixel.data[2] = b;
      bufferPixel.data[3] = a;

      ctx.putImageData(bufferPixel, p.x, p.y);
      return board;
    }
  }

  return board;
}

function Organism(board, color) {
  const points = [];
  const exteriors = [];
  const interiors = [];

  const organism = {
    start(p) {
      points.push(p);
      board.setPoint(1, p);

      return organism;
    },
    colorer(data) {
      return data ? color : Colors.white;
    },
    grow() {
      const randomPoint = _.sample(points);
      const newPoint = _(randomPoint.neighbours())
        .filter(board.isEmpty)
        .sample();

      if (newPoint) {
        board.setPoint(1, newPoint)
          .renderPoint(organism.colorer, newPoint);
        points.push(newPoint);
      } else {
        _.remove(points, randomPoint);
        interiors.push(randomPoint);
      }

      return organism;
    }
  }

  return organism;
}

function presentBlack(data) {
  return data ? Colors.black : Colors.white;
}

const board = Board(canvas);

// console.log(board.setPoint(Point(10, 10)).getPoint(Point(10, 10)));
board.setPoint(1, Point(10, 11))
  .setPoint(1, Point(20, 20))
  .setPoint(1, Point(30, 30))
  .renderPoint(presentBlack, Point(10, 11))
  .renderPoint(presentBlack, Point(20, 20))
  .renderPoint(presentBlack, Point(30, 30));


// console.log(Point(10, 10).neighbours());

const organism1 = Organism(board, Colors.black);
organism1
  .start(board.center())

const organism2 = Organism(board, Colors.red);
organism2
  .start(board.center().moveBy(20, 20))

const organism3 = Organism(board, Colors.green);
organism3
  .start(board.center().moveBy(-20, 20))

function render() {

  _(0)
    .range(500)
    .each(() => {
      organism1.grow();
      organism2.grow();
      organism3.grow();
    });

  requestAnimationFrame(render);
}

requestAnimationFrame(render)
