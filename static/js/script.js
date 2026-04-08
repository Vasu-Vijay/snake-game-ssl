const fruits = {
    "carrot": {name:"Carrot", score:1, sprite: "../static/sprites/fruits/carrot.png", rel_probability:1, on_eat: ateCarrot},
    "triplecarrot": {name:"Triple Carrot", score:3, sprite:"../static/sprites/fruits/three_carrots.png", rel_probability:1, on_eat: atePumpPie}, //TODO: image to be replaced, probability to be written
    "goldenapple": {name:"Golden Apple", score:0, sprite:"../static/sprites/fruits/golden_apple.png", rel_probability:0, on_eat: ateGoldenApple} //TODO: image to be made, also fix probability
}

const snake_sprites=["../static/sprites/classic/", "../static/sprites/cyberpunk/"]
var graphics_mode = 0 // 0: classic mode

const IMMUNITY_TIME = 4000;
const CANVAS_HEIGHT = 450;
const CANVAS_WIDTH = 450;
const REFRESH_RATE = 200;

let username = prompt("Enter your username: ", "guest_user");

const image_elems={} //dict containing <image_path>:<html img elem> pairs

const turn_images=[["body_topleft.png","body_bottomleft.png"],     //-1,-1   -1,+1     {del_x, del_y values}
                   ["body_topright.png","body_bottomright.png"]];  //+1,-1   +1,+1

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

        this.snake = new Snake(this);
        this.grid = Array.from({ length: nColumns }, () =>
            Array.from({ length: nRows }, () => new Cell("empty", null))
        );

        this.input = null; //rate at which snake moves in ms

        this.refreshRate = REFRESH_RATE;
        this.startTime = undefined;
        this.isPaused = true; //TODO: change it before commit
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

    pauseGame() {}

    initGame(myState) {
        drawBoard(myState);
        spawnFruit(myState);
        updateCanvas(myState);
        startGameLoop(myState, this); //TODO: change later
    }

    gameLoop(myState) {
        //console.log(myState);
        updateState(myState);
        updateCanvas(myState);
        if(!myState.isPaused) {
            setTimeout(() => this.gameLoop(myState), myState.refreshRate)
        }
    }
}

class Snake {
    constructor(myState) {
        this.body = [
            {x: 2, y: 1, sprite: "head_right.png"},
            {x: 1, y: 1, sprite: "tail_left.png"}
        ];

        this.growthBuffer = 0; //score left to be added, since there's stalling in score +3 fruits
        
        this.dir = {x: 1, y: 0};
        this.prevdir = {x: 1, y: 0};

        this.immunityTime = 0;
        this.timeAlive = 0;
        this.prevTail = this.tail;
    }

    get isImmune() {
        return this.immunityTime > 0;
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
    constructor(type, entity) {
        this.type = type;
        this.entity = entity;
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

        let [canvas_x, canvas_y] = myState.gtoc(s.x, s.y);
        let image_path = snake_sprites[graphics_mode]+s.sprite; // path = folder + base file name
        myState.ctx.drawImage(image_elems[image_path], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
    }
}

function spawnFruit(myState) { //decides a random fruit and a random empty coordinate, then calls drawFruit to draw the fruit at chosen position
    console.log("spawnFruit called with:", myState)
    let cumWeights = {};
    let totalWeight = 0;
    let id = "carrot";
    //console.log(myState.fruitsUsed)
    for(id of myState.fruitsUsed) {
        if(!fruits[id]) {
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

    let pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    while(pos_x == myState.nColumns || pos_y == myState.nRows || myState.grid[pos_x][pos_y].entity != null) {
        pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    }

    myState.food.push( {id: id, x: pos_x, y: pos_y} );
    myState.grid[pos_x][pos_y] = new Cell("fruit", fruits[id]);
}

function drawFruit(myState, id, pos_x, pos_y) { //draws a fruits[id] at x, y coords of grid
    if (!(pos_x < myState.nColumns && pos_x >= 0 && pos_y < myState.nRows && pos_y >= 0)) {
        console.error("Invalid fruit coordinates!");
        return;
    }
    let fruit = fruits[id];
    let image_path = fruit.sprite;
    let [canvas_x, canvas_y] = myState.gtoc(pos_x, pos_y);
    myState.ctx.drawImage(image_elems[image_path], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
}

function getDirString(dirX, dirY) { // give the dir name for the dir vector
    if(dirX==0 && dirY==1) {
        return "down";
    } else if(dirX==0 && dirY==-1) {
        return "up";
    } else if(dirX==1 && dirY==0) {
        return "right";
    } else if(dirX==-1 && dirY==0) {
        return "left";
    } else {
        console.error("Invalid dirX, dirY!", dirX, dirY);
        return undefined;
    }
}

function updateDir(myState){ //changes dir variable according to the last key pressed
    myState.snake.prevdir.x = myState.snake.dir.x;
    myState.snake.prevdir.y = myState.snake.dir.y;
    
    if (!myState.input || (getDirString(myState.snake.dir.x, myState.snake.dir.y) == getDirString(-myState.input.x, -myState.input.y))) { 
        return; 
    }

    myState.snake.dir.x = myState.input.x;
    myState.snake.dir.y = myState.input.y;
}

function updateCanvas(myState) {
    if(myState.snake.tailChanged) {
        drawBackground(myState, myState.snake.prevTail.x, myState.snake.prevTail.y);
    }
    drawSnake(myState);
    myState.food.forEach((fruit) => {
        drawFruit(myState, fruit.id, fruit.x, fruit.y);
    });
}

function getDeathCause(myState) { // check death according to current pos and dir
    let causeOfDeath = undefined;
    let [next_x, next_y] = myState.snake.nextPos;
    if(next_x >=myState.nColumns || next_x <0 || next_y>=myState.nRows || next_y<0) { causeOfDeath = "WALL"; }
    else if(myState.grid[next_x][next_y].type == "snake_body" || (!myState.snake.tailChanged && myState.grid[next_x][next_y].type == "snake_tail")) { causeOfDeath = "SELF"; }
    console.log(causeOfDeath);
    return causeOfDeath;
}

function executeFuneral(myState, cause) { // perform actions reqd after game end
    myState.isEnded = true;
    myState.isPaused = true; //???
    alert(`Dead, lmao! Score: ${myState.snake.length}`);
}

function updateState(myState) {
    updateDir(myState);

    let [next_x, next_y] = myState.snake.nextPos;
    myState.snake.growthBuffer += consumeFruitAt(myState, next_x, next_y);

    myState.snake.tailChanged = myState.snake.growthBuffer <= 0;

    let cause = getDeathCause(myState);
    if(cause) {
        executeFuneral(myState, cause);
        //TODO: add relevant death animations!!!
        return;
    }
    if (myState.snake.growthBuffer == 0) {      // move head and tail both
        updateTail(myState);
        updateHead(myState);
    } else if(myState.snake.growthBuffer > 0) { // only need to move head, tail remains at its place
        myState.snake.growthBuffer -= 1;
        updateHead(myState);
    } else {                      // only need to move tail, head remains
        updateTail(myState);
        myState.snake.growthBuffer += 1;
    }

    // if(myState.food.length == 0) {
    //     spawnFruit();
    // }
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
    myState.grid[2][1] = new Cell("snake_head", myState.snake.head);
    myState.grid[1][1] = new Cell("snake_tail", myState.snake.tail);
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
            if(myState.isPaused == true && myState.isEnded == false) {
                myState.isPaused = false;
                startGameLoop(myState, myGame);
            }
        }

        
        // if(event.key=="p") { //TODO: furnish this
        //     pauseGame();
        // }
    });
}

function startGameLoop(myState, myGame) {
    if(myState.isPaused) { return; }
    myGame.gameLoop(myState);
}

function consumeFruitAt(myState, x, y) {
    if(x>=myState.nColumns || x<0 || y>=myState.nRows || y<0) {
        console.error("Index out of bounds"); 
        return 0; 
    } //TODO: add similar exhaustive checks at all places
    if(myState.grid[x][y].type == "fruit") {
        let fruit=myState.grid[x][y].entity;
        fruit.on_eat();
        deleteFruit(myState, x, y);
        spawnFruit(myState);
        return fruit.score;
    } else {
        return 0;
    }
}

function deleteFruit(myState, x, y) {
    myState.grid[x][y] = new Cell("empty", null);
    const idx = myState.food.findIndex(f => f.x === x && f.y === y )
    if (idx !== -1) {
        myState.food.splice(idx, 1)
    }
}

function updateHead(myState){ // updates the sprite of new head and the next element according to direction of motion
    let [next_x, next_y] = myState.snake.nextPos;

    if(myState.isImmune) {
        next_x = next_x < 0 ? (next_x % myState.nColumns + myState.nColumns) : (next_x % myState.nColumns);
        next_y = next_y < 0 ? (next_y % myState.nRows + myState.nRows) : (next_y % myState.nRows);
    }

    myState.snake.body.unshift({x: next_x, y: next_y, sprite:`head_${getDirString(myState.snake.dir.x, myState.snake.dir.y)}.png`}) // add new head to snake[]
    myState.grid[next_x][next_y] = new Cell("snake_head", myState.snake.head);
    if(myState.snake.length>=3) { //for length=2 snake.unshift handles the image change //TODO: what about length=1??!! implement before adding negative fruits!

        let del_x = myState.snake.dir.x - myState.snake.prevdir.x;     // variables dirs are in such a way that the following checks form some nice patterns depending on del_x, del_y 
        let del_y = myState.snake.dir.y - myState.snake.prevdir.y;     //(since for a particular turn image, both possible scenarios lead to the same and unique del_x, del_y pair)

        if(del_x==0 && del_y==0){ // no change in direction
            myState.snake.body[1].sprite = (myState.snake.dir.x != 0) ? "body_horizontal.png" : "body_vertical.png"
        } else {
            if(del_x == -1){del_x=0}    // this is just mapping -1 to 0, 1 to 1 
            if(del_y == -1){del_y=0}    // to access turn_images array

            myState.snake.body[1].sprite = turn_images[del_x][del_y]; // the array is made so that this works out
        }   
        if(myState.snake.length>2) {
            myState.grid[myState.snake.body[1].x][myState.snake.body[1].y] = new Cell("snake_body", myState.snake.body[1])
        }
    }
}

function updateTail(myState){ // updates the sprite of the new tail and paints background at prev location of tail 
    let tailDir = {
        x: myState.snake.dir.x,
        y: myState.snake.dir.y
    } //nothing to change for length = 2
    if(myState.snake.length!=2) {
        let del_x = myState.snake.body[myState.snake.length-3].x - myState.snake.body[myState.snake.length-2].x;     // assign the direction between the current 3rd last and 2nd last segments for the new tail, 
        let del_y = myState.snake.body[myState.snake.length-3].y - myState.snake.body[myState.snake.length-2].y;     // since tail always corresponds to the direction of the difference between positions of current last and 2nd last tile
        tailDir.x = del_x;
        tailDir.y = del_y;

        if(del_x== 9 || del_x == -9) {
            tailDir.x = (del_x > 0) ? -1 : +1;
        } else if(del_y == 9 || del_y == -9) {
            tailDir.y = (del_y > 0) ? -1 : +1;
        }
    }

    myState.snake.body[myState.snake.length-2].sprite=`tail_${getDirString(-tailDir.x, -tailDir.y)}.png` // - passed in arguments since it flips up-down and right-left, which is the intended image [we had tail dir set as dir of movement, but tail images are named oppositely]
    myState.grid[myState.snake.body[myState.snake.length-2].x][myState.snake.body[myState.snake.length-2].y] = new Cell("snake_tail", myState.snake.body[myState.snake.length-2]);
    
    myState.grid[myState.snake.tail.x][myState.snake.tail.y] = new Cell("empty", null);
    myState.snake.prevTail = myState.snake.tail;

    myState.snake.body.pop(); //delete the old tail
}

function ateCarrot() {}
function atePumpPie() {} //TOOD: why??
function ateGoldenApple() {}


start();