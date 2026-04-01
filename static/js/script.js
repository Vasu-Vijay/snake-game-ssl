const fruits = {
    "carrot": {name:"Carrot", score:1, sprite: "../static/sprites/fruits/carrot.png", rel_probability:1, on_eat: ateCarrot},
    "triplecarrot": {name:"Triple Carrot", score:3, sprite:"../static/sprites/fruits/three_carrots.png", rel_probability:1, on_eat: atePumpPie}, //TODO: image to be replaced, probability to be written
    "goldenapple": {name:"Golden Apple", score:0, sprite:"../static/sprites/fruits/golden_apple.png", rel_probability:1, on_eat: ateGoldenApple} //TODO: image to be made, also fix probability
}

const snake_sprites=["../static/sprites/classic/", "../static/sprites/cyberpunk/"]
var graphics_mode = 0 // 0: classic mode

const IMMUNITY_TIME = 4000;
const CANVAS_HEIGHT = 450;
const CANVAS_WIDTH = 450;

let username = prompt("Enter your username: ", "guest_user");

const image_elems={} //dict containing <image_path>:<html img elem> pairs

const images = ['../static/sprites/fruits/three_carrots.png', '../static/sprites/fruits/carrot.png', '../static/sprites/fruits/carrot (2).webp', '../static/sprites/fruits/golden_apple.png', '../static/sprites/fruits/carrot.webp', '../static/sprites/classic/tail_down.png', '../static/sprites/classic/head_left.png', '../static/sprites/classic/tail_up.png', '../static/sprites/classic/head_down.png', '../static/sprites/classic/body_bottomleft.png', '../static/sprites/classic/head_right.png', '../static/sprites/classic/head_up.png', '../static/sprites/classic/body_vertical.png', '../static/sprites/classic/tail_left.png', '../static/sprites/classic/body_topright.png', '../static/sprites/classic/tail_right.png', '../static/sprites/classic/body_horizontal.png', '../static/sprites/classic/body_bottomright.png', '../static/sprites/classic/body_topleft.png']

class GameState {
    constructor(nRows = 10, nColumns = 10, cellSize = 30) {
        this.nRows = nRows;
        this.nColumns = nColumns;
        this.cellSize = cellSize;

        this.canvas = document.getElementById("game");
        this.ctx = this.canvas.getContext("2d");

        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        this.snake = new Snake();
        this.grid = Array.from({ length: nColumns }, () =>
            Array.from({ length: nRows }, () => new Cell())
        );

        this.input = null; //rate at which snake moves in ms

        this.refreshRate = 200;
        this.startTime = undefined;
        this.isPaused = false; //TODO: change it before commit
        this.gameLoopId = null;
        this.isEnded = false;

        this.food = [];
        this.fruitsUsed = ["carrot", "triplecarrot", "goldenapple"];
    }

    gtoc(x, y) { // convert grid's x,y coords to absolute x,y coords of the canvas, to keep board in center
        return [(this.canvas.width-(this.nColumns)*this.cellSize)/2+x*this.cellSize, (this.canvas.height-(this.nRows)*this.cellSize)/2+y*this.cellSize];
    }
}

class Game {
    constructor() {

    }

    initGame(myState) {
        drawBoard(myState);
        updateCanvas(myState);
    }
}

class Snake {
    constructor() {
        this.body = [
            {x: 2, y: 1, sprite: "head_right.png"},
            {x: 1, y: 1, sprite: "tail_left.png"}
        ];

        this.growthBuffer = 0; //score left to be added, since there's stalling in score +3 fruits
        
        this.dir = {x: 1, y: 0};
        this.prevdir = {x: 1, y: 0};

        this.immunityTime = 0;
        this.timeAlive = 0;
    }

    get length() {
        return this.body.length;
    }
    get head() {
        return this.body[0];
    }
    get tail() {
        return this.body[this.length - 1];
    }
    get nextPos() {
        return [this.head.x + this.dir.x, this.head.y + this.dir.y];
    }
}

class Cell {
    constructor() {
        this.type = "empty";
        this.entity = null;
    }
}

function loadImages(images) {
    const promises = images.map(src => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve({ src, img })
            img.onerror = reject
        });
    });
  return Promise.all(promises);
}

function drawBoard(myState) {
    for(let i=0; i<myState.nColumns; i++) {
        for(let j=0; j<myState.nRows; j++) {
            drawBackground(myState, i, j);
        }
    }
}

function drawBackground(myState, x, y) {
    myState.grid[x][y].entity = null;
    myState.grid[x][y].type = "empty";
    if( (x+y) % 2 == 0) {
        var color="#00c60d";
    } else {
        var color="#02940c";
    }
    let [canvas_x, canvas_y] = myState.gtoc(x, y);
    myState.ctx.fillStyle = color;
    myState.ctx.fillRect(canvas_x, canvas_y, myState.cellSize, myState.cellSize);
}

function drawSnake(myState) { // to draw the snake, with corresponding sprites, and also update the grid
    let snake = myState.snake;
    for(let s of snake.body) {
        drawBackground(myState, s.x, s.y);
    }
    for(let i in snake.body) { // painting order to decide who comes on top if overlap
        let s = snake.body[snake.length - i - 1];
        if(!s) {
            console.error("Invalid snake element");
            return;
        }
        if(i == snake.length - 1) {                 // reversed array
            myState.grid[s.x][s.y] = { type: "snake_head", entity: s };
        } else if (i==0) {
            myState.grid[s.x][s.y] = { type: "snake_body", entity: s };
        } else {
            myState.grid[s.x][s.y] = { type: "snake_tail", entity: s };
        }

        let [canvas_x, canvas_y] = myState.gtoc(s.x, s.y);
        let image_path = snake_sprites[graphics_mode]+s.sprite; // path = folder + base file name
        myState.ctx.drawImage(image_elems[image_path], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
    }
}

function spawnFruit(myState) { //decides a random fruit and a random empty coordinate, then calls addFruit to draw the fruit at chosen position
    let cumWeights = {};
    let totalWeight = 0;
    let id = "carrot";
    for(id of myState.fruitsUsed) {
        if(!fruits[id]) {
            console.log(id)
            console.error("Invalid fruit id!");
            continue;
        }
        totalWeight += fruits[id].rel_probability;
        cumWeights[id] = totalWeight;
    }
    const random = Math.random() * totalWeight;
    for(id of myState.fruitsUsed) {
        if(random <= cumWeights[id]) {
            break;
        }
    }

    //console.log(myState.grid);
    let pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    while(pos_x == myState.nColumns || pos_y == myState.nRows || myState.grid[pos_x][pos_y].entity != null) {
        pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    }

    myState.food.push( {id: id, x: pos_x, y: pos_y} );
    addFruit(myState, id, pos_x, pos_y);
}

function addFruit(myState, id, pos_x, pos_y) { //draws a fruits[id] at x, y coords of grid
    if (!(pos_x < myState.nColumns && pos_x >= 0 && pos_y < myState.nRows && pos_y >= 0)) {
        console.error("Invalid fruit coordinates!");
        return;
    }
    let fruit = fruits[id];
    let image_path = fruit.sprite;
    myState.grid[pos_x][pos_y] = {type: "fruit", entity: fruit};
    let [canvas_x, canvas_y] = myState.gtoc(pos_x, pos_y);
    myState.ctx.drawImage(image_elems[image_path], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
}

function updateCanvas(myState) {
    drawSnake(myState);
    spawnFruit(myState);
    if(myState.snake.tailChanged) {
        prevTailPos_x = myState.snake.tail.x + (myState.snake.tail.x - myState.snake.body[snake.length-2].x);
        prevTailPos_y = myState.snake.tail.y + (myState.snake.tail.y - myState.snake.body[snake.length-2].y);
        drawBackground(myState, prevTailPos_x, prevTailPos_y);
    }
}

function start() {
    loadImages(images).then(results => {
        results.forEach(({ src, img }) => {
            image_elems[src] = img;
        });
        initGameState();
    });
}

function initGameState() {
    const myState = new GameState();
    const myGame = new Game();
    setupInput(myState, myGame);
    myGame.initGame(myState);
}

function setupInput(myState, myGame) {
    document.addEventListener("keydown", (event) => { // event listeners for keydowns, stores the dir vector in move
        const keys = {
            ArrowUp: { x: 0, y: -1},
            ArrowDown: { x: 0, y: 1},
            ArrowRight: { x: 1, y: 0},
            ArrowLeft: { x: -1, y: 0}
        }
        myState.input = keys[event.key];
        if(myState.input) {
            if(myState.isPaused == true) {
                myState.isPaused = false;
                startGameLoop();
            }
        }
        // if(event.key=="p") { //TODO: furnish this
        //     pauseGame();
        // }
    });
}

function ateCarrot() {}
function atePumpPie() {} //TOOD: why??
function ateGoldenApple() {}


start();