let idCounter = 0;
function generateId() {
  idCounter += 1;
  return idCounter;
}

function createPixel(color, x, y) {
  const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);

  sprite.tint = color;
  sprite.width = 1;
  sprite.height = 1;

  sprite.x = x;
  sprite.y = y;

  sprite.id = generateId();

  sprite.meta = {
    direction: Math.random(),
    holdingFoodCount: 0,
  };

  return sprite;
}

const directions = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
  upLeft: [-1, -1],
  upRight: [1, -1],
  downLeft: [-1, 1],
  downRight: [1, 1],
};

function randomDirection(directions) {
  return _.sample(_.values(directions));
}

function movePixel(direction, pixel) {
  const [offsetX, offsetY] = direction;
  pixel.x += offsetX;
  pixel.y += offsetY;
}

function movePixelTowards(targetX, targetY, pixel) {
  const dx = targetX - pixel.x;
  const dy = targetY - pixel.y;

  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  pixel.x += stepX;
  pixel.y += stepY;
}

function movePixelAway(targetX, targetY, pixel) {
  const dx = targetX - pixel.x;
  const dy = targetY - pixel.y;

  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  pixel.x -= stepX;
  pixel.y -= stepY;
}

function incrementWorld(x, y, { width, world, worldStats }) {
  x = Math.floor(x);
  y = Math.floor(y);

  const i = y * width + x;

  const currValue = world[i];

  if (currValue < 255) {
    world[i] += 1;
    worldStats.totalConsumed += 1;
  }

  return { previousValue: currValue, currValue: world[i] };
}

function getWorldIndex(x, y, width) {
  return Math.floor(y) * width + Math.floor(x);
}

function getWorldValue(x, y, { width, world }) {
  return world[getWorldIndex(x, y, width)];
}

function setWorldValue(x, y, value, { width, world }) {
  world[getWorldIndex(x, y, width)] = value;
}

function renderWorld({
  width,
  height,
  worldCtx,
  worldTexture,
  worldData,
  imageData,
  world,
}) {
  for (let i = 0; i < width * height; i++) {
    const v = 255 - world[i];
    worldData[i * 4 + 0] = v;
    worldData[i * 4 + 1] = v;
    worldData[i * 4 + 2] = v;
    worldData[i * 4 + 3] = 255;
  }
  worldCtx.putImageData(imageData, 0, 0);
  worldTexture.source.update();
}

async function buildContext(width, height) {
  const app = new PIXI.Application();
  const canvas = document.getElementById("board");

  await app.init({
    canvas,
    width,
    height,
  });

  const world = new Uint8Array(width * height);

  for (let i = 0; i < world.length; i++) {
    world[i] = 255;
  }

  const worldCanvas = document.createElement("canvas");
  worldCanvas.width = width;
  worldCanvas.height = height;
  const worldCtx = worldCanvas.getContext("2d");
  const imageData = worldCtx.createImageData(width, height);
  const worldData = new Uint8Array(imageData.data.buffer);

  const worldTexture = new PIXI.Texture({
    source: new PIXI.ImageSource({ resource: worldCanvas }),
  });
  app.stage.addChild(new PIXI.Sprite(worldTexture));

  return {
    width,
    height,
    worldCtx,
    worldTexture,
    worldData,
    imageData,
    world,
    app,
    attributes: {},
    worldStats: {
      totalConsumed: 0,
    },
  };
}

function lookupWorldAttribute(attributes, x, y, attributeKey) {
  const lookupKey = `${x}-${y}`;
  return attributes[lookupKey]?.[attributeKey];
}

function setWorldAttribute(attributes, x, y, attributeKey, value) {
  const lookupKey = `${x}-${y}`;

  attributes[lookupKey] ??= {};
  attributes[lookupKey][attributeKey] = value;
}

function lookupSpriteAttribute(attributes, sprite, attributeKey) {
  return attributes[sprite.id]?.[attributeKey];
}

function setSpriteAttribute(attributes, sprite, attributeKey, value) {
  if (!attributes[sprite.id]) {
    attributes[sprite.id] = {};
  }

  attributes[sprite.id][attributeKey] = value;
}

function getTimeSince(nowTimeStamp, timestamp) {
  const diffMs = nowTimeStamp - timestamp;

  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function distance_less_than(p1, p2, distance) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy < distance * distance;
}

function distance_greater__than(p1, p2, distance) {
  return !distance_less_than(p1, p2, distance);
}

function moveUnitDirection(direction, p, { width, height }) {
  const angle = direction * 2 * Math.PI;

  const dx = Math.cos(angle);
  const dy = -Math.sin(angle);

  p.x += dx;
  p.y += dy;

  p.x = ((p.x % width) + width) % width;
  p.y = ((p.y % height) + height) % height;
}

function unitDirectionFrom(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p1.y - p2.y; // invert because screen y grows downward

  let angle = Math.atan2(dy, dx); // -π .. π
  if (angle < 0) angle += 2 * Math.PI;

  return angle / (2 * Math.PI);
}

function bumpUnitDirectionTowards(direction, directionTarget, moveBy) {
  let diff = directionTarget - direction;

  // wrap difference to shortest circular distance
  diff = ((((diff + 0.5) % 1) + 1) % 1) - 0.5;

  if (Math.abs(diff) <= moveBy) {
    return directionTarget;
  }

  direction += Math.sign(diff) * moveBy;

  // wrap result to [0,1)
  return (direction + 1) % 1;
}

function forEachPixelInCircle(x, y, radius, func) {
  const r2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        func(x + dx, y + dy);
      }
    }
  }
}

function shiftUnitDirection(direction, moveBy) {
  return (direction + moveBy + 1) % 1;
}

function randomPoint({ width, height }) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
  };
}

const spanTotalConsumed = document.getElementById("spanTotalConsumed");
const spanTotalConsumedCapacity = document.getElementById(
  "spanTotalConsumedCapacity",
);
const spanTotalRuntime = document.getElementById("spanTotalRuntime");
const bitsCount = document.getElementById("bitsCount");

async function start(width, height, timeStarted) {
  const context = await buildContext(width, height);

  const { worldTexture, app, attributes } = context;
  const pixels = Array.from({ length: 20000 }, () =>
    createPixel(0xff0000, 400, 300),
  );
  // could be moved into the init above
  pixels.forEach((pixel) => {
    app.stage.addChild(pixel);
  });

  const canvas = document.getElementById("board");

  const home = createPixel(0xff00ff, 400, 300);
  app.stage.addChild(home);

  // canvas.addEventListener("click", (event) => {
  //   // const newPixels = Array.from({ length: 100 }, () =>
  //   //   createPixel(0xff0000, home.x, home.y),
  //   // );
  //   // // could be moved into the init above
  //   // newPixels.forEach((pixel) => {
  //   //   app.stage.addChild(pixel);
  //   // });

  //   // pixels.push(...newPixels);

  //   console.log(event)
  // });

  app.stage.interactive = true; // Make the stage interactive
  app.stage.on("pointerdown", (event) => {
    // event.data is a PIXI InteractionData object
    const { x, y } = event.data.global; // Coordinates relative to the canvas
    console.log("Pixi click coordinates:", x, y);

    forEachPixelInCircle(x, y, 100, (x, y) => {
      setWorldValue(x, y, 0, context);
    });
  });

  let iteration = 1;
  let lastConsumedLocation = { x: width / 2, y: height / 2 };

  let mousePosition = { x: width / 2, y: height / 2 };

  app.stage.on("pointermove", (event) => {
    const { x, y } = event.data.global;
    mousePosition = { x, y };
  });

  let avoid = false;

  app.stage.on("pointerover", () => {
    avoid = true;
  });

  app.stage.on("pointerout", () => {
    avoid = false;
  });

  app.ticker.add(() => {
    // let idleCount = 0;
    // let minWorldValue = 255;
    // let minWorldX = 0;
    // let minWorldY = 0;

    pixels.forEach((pixel) => {
      // movePixel(randomDirection(directions), pixel);
      // const { previousValue, currValue } = incrementWorld(
      //   pixel.x,
      //   pixel.y,
      //   context,
      // );
      // isIdle = previousValue === 255;
      // idleCount += isIdle ? 1 : 0;
      // if (currValue < minWorldValue) {
      //   minWorldValue = currValue;
      //   minWorldX = pixel.x;
      //   minWorldY = pixel.y;
      // }
      // moveUnitDirection(pixel.meta.direction, pixel);
      // console.log(pixel.meta.direction);
      // const worldValue = getWorldValue(pixel.x, pixel.y, context);
      // if (worldValue < )

      // console.log(pixel.meta);

      if (pixel.meta.holdingFoodCount < 200) {
        const worldValue = getWorldValue(pixel.x, pixel.y, context);
        // console.log(worldValue, pixel.x, pixel.y);
        if (worldValue < 255) {
          pixel.meta.holdingFoodCount += 1;
          incrementWorld(pixel.x, pixel.y, context);

          lastConsumedLocation = { x: pixel.x, y: pixel.y };
        } else {
          const directionJitter = 0.01;
          const delta =
            Math.random() < 0.5 ? -directionJitter : directionJitter;
          pixel.meta.direction = (pixel.meta.direction + delta + 1) % 1;

          pixel.meta.direction = bumpUnitDirectionTowards(
            pixel.meta.direction,
            unitDirectionFrom(pixel, lastConsumedLocation),
            0.002,
          );

          // const s = _.sample(pixels)

          moveUnitDirection(pixel.meta.direction, pixel, context);
        }
      } else {
        if (distance_less_than(pixel, home, 2)) {
          // pixel.meta.direction = Math.random();
          pixel.meta.direction = shiftUnitDirection(pixel.meta.direction, 0.5);

          pixel.meta.holdingFoodCount = 0;
          moveUnitDirection(pixel.meta.direction, pixel, context);
        } else {
          pixel.meta.direction = unitDirectionFrom(pixel, home);
          moveUnitDirection(pixel.meta.direction, pixel, context);
        }
      }

      if (avoid && distance_less_than(pixel, mousePosition, 40)) {
        pixel.meta.direction = bumpUnitDirectionTowards(
          pixel.meta.direction,
          unitDirectionFrom(pixel, mousePosition),
          -0.1,
        );
      }
    });

    bitsCount.innerHTML = pixels.length;

    // const [p1, p2] = _.sampleSize(pixels, 2);
    // p1.meta.direction = bumpUnitDirectionTowards(
    //   p1.meta.direction,
    //   p2.meta.direction,
    //   0.1,
    // );
    // p2.meta.direction = bumpUnitDirectionTowards(
    //   p2.meta.direction,
    //   p1.meta.direction,
    //   0.1,
    // );
    // const [p1, p2] = _.sampleSize(pixels, 2);
    // movePixelTowards(p2.x, p2.y, p1);
    // movePixelTowards(p1.x, p1.y, p2);

    renderWorld(context);
    worldTexture.source.update();

    const worldTotal = 800 * 600 * 255;
    const consumed = context.worldStats.totalConsumed;
    spanTotalConsumed.innerHTML = `${consumed}/${worldTotal} (${((consumed / worldTotal) * 100).toFixed(2)}%)`;

    const { days, hours, minutes, seconds } = getTimeSince(
      Date.now(),
      timeStarted,
    );

    spanTotalRuntime.innerHTML = `${days}:${hours}:${minutes}:${seconds}`;

    // if (iteration % 500 === 0) {
    //   const randPoint = randomPoint(context);
    //   forEachPixelInCircle(randPoint.x, randPoint.y, 100, (x, y) => {
    //     setWorldValue(x, y, 0, context);
    //   });
    // }

    iteration += 1;
  });
}

const width = 800;
const height = 600;

start(width, height, Date.now());
