function Point(x, y) {
  return point = {
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
      return Point(point.x + x, point.y + y);
    },
    moveToward(p, mag) {
      const dx = p.x - point.x;
      const dy = p.y - point.y;

      return Point(
        point.x + Math.floor(dx * mag),
        point.y + Math.floor(dy * mag)
      );
    },
    moveAway(p, mag) {
      return moveToward(p, -mag);
    },
    distanceSquared(p) {
      return Math.pow((p.x - point.x), 2) + Math.pow((p.y - point.y), 2);
    }
  }
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
  green: Color(0, 255, 0, 255),
  blue: Color(0, 0, 255, 255)
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
  const state = {};
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
    },
    randomPoint() {
      return Point(Math.floor(_.random(width)), Math.floor(_.random(height)));
    }
  }

  return board;
}

function Organism(board) {
  const points = [];

  _.times(100, () => {
    const p = board.randomPoint();
    points.push(p);
  });

  return organism = {
    draw() {
      _.each(points, (p) => {
        board
          .setPoint(1, p)
          .renderPoint(_.constant(Colors.black), p);
      });
      return organism;
    },
    move() {
      const p1 = _.sample(points);
      const p2 = _.sample(points);
      const dSq = p1.distanceSquared(p2);

      const mag = dSq > 100 ? 0.9 : -0.9;
      // const mag = 0.8;
      const p1Dest = p1.moveToward(p2, mag);
      const p2Dest = p2.moveToward(p1, mag);

      // idea: if destination is occupied then source and dest swap spaces

      if (board.getPoint(p1Dest) !== 1) {
        board
          .setPoint(0, p1)
          .renderPoint(_.constant(Colors.white), p1);

        board
          .setPoint(1, p1Dest)
          .renderPoint(_.constant(Colors.black), p1Dest);
      }

      if (board.getPoint(p2Dest) !== 1) {
        board
          .setPoint(0, p2)
          .renderPoint(_.constant(Colors.white), p2);

        board
          .setPoint(1, p2Dest)
          .renderPoint(_.constant(Colors.black), p2Dest);
      }
    }
  }
}

const board = Board(canvas);
const a = Organism(board).draw();

function render() {
  _.times(1000, a.move);


  requestAnimationFrame(render);
}

requestAnimationFrame(render);






// Organism growth

// function Organism(board, color) {
//   const points = [];
//   const exteriors = [];
//   const interiors = [];
//
//   const organism = {
//     start(p) {
//       points.push(p);
//       board.setPoint(1, p);
//
//       return organism;
//     },
//     colorer(data) {
//       return data ? color : Colors.white;
//     },
//     grow() {
//       const randomPoint = _.sample(points);
//       const newPoint = _(randomPoint.neighbours())
//         .filter(board.isEmpty)
//         .sample();
//
//       if (newPoint) {
//         board.setPoint(1, newPoint)
//           .renderPoint(organism.colorer, newPoint);
//         points.push(newPoint);
//       } else {
//         _.remove(points, randomPoint);
//         interiors.push(randomPoint);
//       }
//
//       return organism;
//     }
//   }
//
//   return organism;
// }
//
// function presentBlackColoration(data) {
//   return data ? Colors.black : Colors.white;
// }
//
// const board = Board(canvas);
//
// // console.log(board.setPoint(Point(10, 10)).getPoint(Point(10, 10)));
// board.setPoint(1, Point(10, 11))
//   .setPoint(1, Point(20, 20))
//   .setPoint(1, Point(30, 30))
//   .renderPoint(presentBlackColoration, Point(10, 11))
//   .renderPoint(presentBlackColoration, Point(20, 20))
//   .renderPoint(presentBlackColoration, Point(30, 30));
//
//
// // console.log(Point(10, 10).neighbours());
//
// const organism1 = Organism(board, Colors.black)
//   .start(board.center());
//
// const organism2 = Organism(board, Colors.red)
//   .start(board.center().moveBy(1, 1));
//
// const organism3 = Organism(board, Colors.green)
//   .start(board.center().moveBy(-1, -1));
//
// const organism4 = Organism(board, Colors.blue)
//   .start(board.center().moveBy(-30, 30));
//
// function render() {
//
//   _(0)
//     .range(100)
//     .each(() => {
//       organism1.grow();
//       organism2.grow();
//       organism3.grow();
//       organism4.grow();
//     });
//
//   requestAnimationFrame(render);
// }
//
// requestAnimationFrame(render)
