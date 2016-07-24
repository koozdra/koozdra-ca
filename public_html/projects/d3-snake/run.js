var svg,
  data = {
  food: [
    [0,0],
    [10,0],
    [0,10],
    [10,10],
    [5,5],
    [19,19]
  ],
  snakes: [
    {
      bits: [[1,4], [1,5], [1,6], [2,6]],
      color: '#EEEEEE',
      headImage: 'https://media.giphy.com/media/JzdijlfyQDS8M/giphy.gif'
    },
    {
      bits: [[2, 9], [3, 9], [3, 10], [3, 11], [3, 12], [4, 12]],
      color: '#99cc00',
      headImage: 'https://media.giphy.com/media/j3GCNKQJ6Sxqw/giphy.gif'
    }
  ]
};

var moveSnake = _.curry(function(x, y, index) {
  var snake = data.snakes[index],
    head = _.head(snake.bits);

  snake.bits = [[head[0] + x, head[1] + y]].concat(_.initial(snake.bits));
});

var moveSnakeUp = moveSnake(0, -1);
var moveSnakeDown = moveSnake(0, 1);
var moveSnakeRight = moveSnake(1, 0);
var moveSnakeLeft = moveSnake(-1, 0);

function up() {
  moveSnakeUp(1);
  render(data);
}

function down() {
  moveSnakeDown(1);
  render(data);
}

function right() {
  moveSnakeRight(1);
  render(data);
}

function left() {
  moveSnakeLeft(1);
  render(data);
}


function render(data) {
  var bitWidth = 50;

  var gifs = d3.select('.js-board')
    .selectAll('img.snake')
    .data(data.snakes);

  gifs.enter()
    .append('img')
    .classed('snake', true)
    .attr('src', function(d) {return d.headImage})
    .attr('width', bitWidth)
    .attr('height', bitWidth)
    .style('position', 'absolute')
    .style('left', function(d) { return _.head(d.bits)[0] * bitWidth + 'px' })
    .style('top', function(d) { return _.head(d.bits)[1] * bitWidth + 'px' })
    ;

  gifs.transition()
    .duration(0)
    .style('left', function(d, i, a) { console.log(arguments); return _.head(d.bits)[0] * bitWidth + 'px' })
    .style('top', function(d) { return _.head(d.bits)[1] * bitWidth + 'px' });

  var snakes = svg.selectAll('.snake')
    .data(data.snakes);

  snakes.enter()
    .append('g')
    .classed('snake', true);

  var snakeBits = snakes.selectAll('.snake-bit')
    .data(function(d) { return d.bits });

  snakeBits.enter()
    .append('rect')
    .classed('snake-bit', true)
    .attr('x', function(d) { return d[0] * bitWidth})
    .attr('y', function(d) { return d[1] * bitWidth})
    .attr('width', bitWidth)
    .attr('height', bitWidth)
    .attr('fill', function(d, i, snakeIndex) { console.log(arguments); return i === 0 ? 'blue' : data.snakes[snakeIndex].color });

  snakeBits.transition()
    .duration(0)
    .attr('x', function(d) { return d[0] * bitWidth})
    .attr('y', function(d) { return d[1] * bitWidth});

  snakeBits.exit().remove();

  svg.selectAll('.food')
    .data(data.food)
    .enter()
    .append('image')
    .classed('food', true)
    .attr('x', function(d) { return d[0] * bitWidth})
    .attr('y', function(d) { return d[1] * bitWidth})
    .attr('width', bitWidth)
    .attr('height', bitWidth)
    .attr('xlink:href', 'green_apple.svg');
}

function start() {

  svg = d3.select('.js-board')
    .append('svg')
    .attr('width', 1000)
    .attr('height', 1000);

  render(data);


};
