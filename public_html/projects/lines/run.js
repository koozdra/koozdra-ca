function circlePoints(x, y, r, n) {
  return _(0)
    .range(n)
    .map(function(d) {
      var t = d * (2 * Math.PI / n);
      return [r * Math.cos(t), r * Math.sin(t)];
    })
    .value();
}

function distance(p1, p2) {
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}

function calculateLines(data) {
  data.lines =
    _(data.circlePoints)
      .map(function(d, i) {
        return [d,data.circlePoints[(i * data.modNum) % data.circlePoints.length]];
      })
      .value();
  return data;
}

function animate(fn) {
  var frame = 0;
  window.requestAnimationFrame(function runner() {
    fn(frame);
    frame += 1;
    window.requestAnimationFrame(runner);
  });
}

function render(svg, data) {
  var lines = svg.selectAll('line').data(data.lines),
    width = svg.attr('width'),
    height = svg.attr('height');

  // enter
  lines.enter()
    .append('line')
    .attr('style', 'stroke:rgb(0,0,0);stroke-width:1');

  // transition
  lines.transition()
    .attr('x1', function(d) { return d[0][0] + width / 2})
    .attr('y1', function(d) { return d[0][1] + height / 2})
    .attr('x2', function(d) { return d[1][0] + width / 2})
    .attr('y2', function(d) { return d[1][1] + height / 2});

  lines.exit().remove();
}

function start() {

  var svg = d3.select('.js-board')
    .append('svg')
    .attr('width', 1000)
    .attr('height', 1000);

  var data = {
      lines: [],
      circlePoints: [],
      radius: 500,
      numPoints: 200,
      modNum: 2,
      keyModifier: 1
    },
    width = svg.attr('width'),
    height = svg.attr('height'),
    mousePoint = [0,0],
    centerPoint = [width / 2, height / 2];

  d3.select(window)
    .on('mousemove', function() {
      mousePoint = d3.mouse(svg.node());
    })
    .on('keydown', function() {
      var key = d3.event.keyCode;
      if (_.includes([38, 40], key)) {
        d3.event.stopPropagation();
        d3.event.preventDefault();
        if (key === 38) data.modNum += data.keyModifier;
        if (key === 40) data.modNum -= data.keyModifier;

        data = calculateLines(data);

        render(svg, data);
      }
    });

  //animate(function() {
  //  var t = circlePoints(width / 2, height / 2, 400, numPoints);
  //  //data.lines = _.chunk(t, 2);
  //  //data.lines = _(0)
  //  //  .range(distance(centerPoint, mousePoint) * 2)
  //  //  .map(function() {
  //  //    return _.sampleSize(t, 2);
  //  //  }).value();
  //
  //  render(svg, data);
  //})

  data.circlePoints = circlePoints(width / 2, height / 2, data.radius, data.numPoints);

  data = calculateLines(data);

  render(svg, data);



};
