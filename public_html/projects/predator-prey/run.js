async function start(width, height, timeStarted) {
  const { Engine, Render, Runner, World, Bodies, Events } = Matter;

  const canvas = document.getElementById("board");

  canvas.width = width;
  canvas.height = height;

  const engine = Engine.create();

  Events.on(engine, "collisionStart", (event) => {
    console.log([...event.pairs]);
  });

  engine.gravity.y = 0;

  const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
      width,
      height,
      wireframes: false,
      background: "#111",
    },
  });

  const circle = Bodies.circle(width / 2, height / 2, 10, {
    render: {
      fillStyle: "red",
    },
  });
  const circle2 = Bodies.circle(width / 2 + 30, height / 2, 10, {
    render: {
      fillStyle: "blue",
    },
  });

  Matter.Body.applyForce(circle, circle.position, {
    x: 0.002,
    y: 0,
  });

  World.add(engine.world, [circle, circle2]);
  const runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);
}

const width = 800;
const height = 600;

start(width, height, Date.now());
