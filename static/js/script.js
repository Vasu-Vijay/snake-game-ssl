const fruits = {
    "carrot": { name: "Carrot", score: 1, sprite: "../static/media/sprites/fruits/carrot.png", rel_probability: 1, onEat: ateCarrots },
    "triplecarrot": { name: "Triple Carrot", score: 3, sprite: "../static/media/sprites/fruits/triplecarrot.png", rel_probability: 10, onEat: ateCarrots }, //TODO: probability to be written
    "goldenapple": { name: "Golden Apple", score: 0, sprite: "../static/media/sprites/fruits/goldenapple.png", rel_probability: 2, onEat: ateGoldenApple }, //TODO: fix probability
    "speedupfruit": { name: "Energy", score: 1, sprite: "../static/media/sprites/fruits/speedupfruit.png", rel_probability: 1, onEat: ateSpeedUp } //TODO: think of score, probability
}

const IMMUNITY_TICKS = 30;              // in game ticks for immunity effect
const SPEEDUP_TICKS = 20;               // in game ticks for speed-up fruit's effect
const SPEEDUP_FACTOR = 2;               // speed-up factor for speed-up fruit
const GRAPHICS_SCALE = 2;               // scale of canvas resolution vs css resolution in pixels
const TICK_RATE = 200;                  // time in ms for updating gamestate, "tick-time"
const GRAPHICS_REFRESH_RATE = 100;      // time in ms for updating graphics (re-painting of entire canvas)
const INPUT_BUFFER_SIZE = 3;            // size of the buffer which stores rapidly pressed keys to execute them one-by-one

const N_COLUMNS = 13;
const N_ROWS = 13;
const CELL_SIZE = 30;
const CANVAS_HEIGHT = N_ROWS * CELL_SIZE;
const CANVAS_WIDTH = N_COLUMNS * CELL_SIZE;

const image_elems = {}                  // associative array containing <image_path> : <html img element> key-value pairs, which are pre-loaded before game start

const turn_images = [["body_topleft.png", "body_bottomleft.png"],       // -1, -1   -1, +1     {del_x, del_y values}
                    ["body_topright.png", "body_bottomright.png"]];     // +1, -1   +1, +1

const deathCauses = ["SELF", "WALL"]; 

var graphicsMode = "classic";           // set default graphics mode, to be implemented better

let isFirst = true;

let myState = null;

class User {
    constructor(username = "guest_user") {
        this.username = username;
        this.records = [];
        this.isNewHighScore = false;
    }

    // returns the highscore in all records stored (excludes current ongoing run); defaults to 2
    highScore(myState) {
        return this.records.reduce((maxScore, record) => record.score > maxScore ? record.score : maxScore, 2);
    }

    // checks basic validity of a record and then pushes to this.records; returns 1 on success, and null on failure.
    addRecord(record) {
        if (!((record.startTime) && (record.score && record.score >= 2) && (record.cause && deathCauses.includes(record.cause)) && (record.timeAlive && record.timeAlive > 0))) {
            console.error("Invalid record pushed!", record);
            return null;
        }
        this.records.push(record);
        return 1;
    }

    // sends the latest record in this.records to /save_score (backend); logs the success/failure message in browser console
    saveLatestRecord() {
        let record = this.records[this.records.length - 1];

        let data = new FormData();
        data.append("start_time", record.startTime);
        data.append("username", this.username);
        data.append("score", record.score);
        data.append("cause", record.cause);
        data.append("time_alive", record.timeAlive);

        // send a POST request to the backend
        fetch("/save_score", { 
            "method": "POST",
            "body": data,
        }).then(function (response) {
            if (!response.ok) {
                console.error("HTTP error: ", response);
                return null;
            }
            return response.text();
        }).then(function (data) {
            if (data) {
                if (data == "ok") {
                    console.log("Saved successfully!");
                } else {
                    console.error(data);
                }
            }
        }).catch(function (error) {
            console.error(error); //TODO: check if better error handling possible
        });
    }
}

const user = new User();

// class containing all relevant variables for a game state
class GameState {
    constructor(nRows = N_ROWS, nColumns = N_COLUMNS, cellSize = CELL_SIZE) {
        this.nRows = nRows;
        this.nColumns = nColumns;
        this.cellSize = cellSize;

        this.canvas = document.getElementById("game");
        this.ctx = this.canvas.getContext("2d");

        // this.scale = window.devicePixelRatio || 1

        // forces higher resolution in canvas, keeping same size in css
        this.scale = GRAPHICS_SCALE;

        this.canvas.width = CANVAS_WIDTH * this.scale
        this.canvas.height = CANVAS_HEIGHT * this.scale

        this.canvas.style.width = `${CANVAS_WIDTH}px`
        this.canvas.style.height = `${CANVAS_HEIGHT}px`

        this.cellSize *= this.scale;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        this.snake = new Snake(this);

        // init empty grid
        this.grid = Array.from({ length: this.nColumns }, () =>
            Array.from({ length: this.nRows }, () => [])
        );

        this.inputBuffer = [];
        this.inputBufferSize = INPUT_BUFFER_SIZE;

        this.tickRate = TICK_RATE;
        this.graphicsRefreshRate = GRAPHICS_REFRESH_RATE;
        this.startTimeUNIX = undefined;
        this.frameNum = 0;
        this.startTime = undefined;
        this.deathTime = undefined;
        this.isPaused = true; //TODO: change it before commit

        this.food = [];
        this.fruitsUsed = Object.keys(fruits);

        this.inputHandlerFunction = null;
    }

    get isFinished() {
        return this.deathTime != undefined;
    }

    get score() {
        return this.snake.length + this.snake.growthBuffer;
    }

    // convert grid's x,y coords to canvas's x,y coords, keeping board in center
    gtoc(x, y) {
        return [(this.canvas.width - (this.nColumns) * this.cellSize) / 2 + x * this.cellSize, (this.canvas.height - (this.nRows) * this.cellSize) / 2 + y * this.cellSize];
    }

    // end game state
    destroy() {
        this.isPaused = true;
        document.removeEventListener("keydown", this.inputHandlerFunction);
    }
}

// class containing properties of snake
class Snake {
    constructor(myState) {
        //init body array
        this.body = [
            { x: 2, y: 1, sprite: "head_right.png" },
            { x: 1, y: 1, sprite: "tail_left.png" }
        ];

        //score left to be added, since there's stalling in score +3 fruits
        this.growthBuffer = 0;

        this.dir = { x: 1, y: 0 };
        this.prevdir = { x: 1, y: 0 };

        this.immunityTicks = 0;
        this.timeAlive = 0;
        this.prevTail = this.tail;

        this.color = "main";

        this.speedTicks = 0;
    }

    get isImmune() {
        return this.immunityTicks > 0;
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

    // returns x, y coordinates of the next position of head
    nextPos(myState) {
        let next_x = this.head.x + this.dir.x;
        let next_y = this.head.y + this.dir.y;
        if (this.isImmune) {
            next_x = next_x < 0 ? (next_x % myState.nColumns + myState.nColumns) : (next_x % myState.nColumns);
            next_y = next_y < 0 ? (next_y % myState.nRows + myState.nRows) : (next_y % myState.nRows);
        }
        return [next_x, next_y];
    }
}

class Cell {
    constructor(type, entity) {
        this.type = type;
        this.entity = entity;
    }
}

// load all images as html elements and return a promise to proceed after loading
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

// draw the entire board
function drawBoard(myState) {
    for (let i = 0; i < myState.nColumns; i++) {
        for (let j = 0; j < myState.nRows; j++) {
            drawBackground(myState, i, j);
        }
    }
}

// draw background of cell at x, y of grid
function drawBackground(myState, x, y) {
    if ((x + y) % 2 == 0) {
        var color = "#00c60d";
    } else {
        var color = "#02940c";
    }
    let [canvas_x, canvas_y] = myState.gtoc(x, y);
    myState.ctx.fillStyle = color;
    myState.ctx.fillRect(canvas_x, canvas_y, myState.cellSize, myState.cellSize);
}

// draw the snake, with corresponding sprites; and update myState.grid
function drawSnake(myState) {
    let snake = myState.snake;

    // reverse painting order to handle overlap of segments
    for (let i in snake.body) {
        let s = snake.body[snake.length - i - 1];
        if (!s) {
            console.error("Invalid snake element");
            return;
        }

        let [canvas_x, canvas_y] = myState.gtoc(s.x, s.y);

        // path = sprite folder + theme + snake-color + segment-type
        let imagePath = "../static/media/sprites/" + graphicsMode + "/" + myState.snake.color + "/" + s.sprite;
        myState.ctx.drawImage(image_elems[imagePath], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
    }
}

// randomize fruit and an empty cell to spawn; update myState.food; then call drawFruit
function spawnFruit(myState) {

    // cumulative weights according to relative probabilities of fruits used
    let cumWeights = {};
    let totalWeight = 0;
    let id = "carrot";
    for (id of myState.fruitsUsed) {
        if (!fruits[id]) {
            console.error("Invalid fruit id!");
            continue;
        }
        totalWeight += fruits[id].rel_probability;
        cumWeights[id] = totalWeight;
    }

    // decide fruit randomly in a weighted manner
    const random = Math.random() * totalWeight;
    for (id of myState.fruitsUsed) {
        if (random <= cumWeights[id]) {
            break;
        }
    }

    // decide a random cell which is empty
    let [next_x, next_y] = myState.snake.nextPos(myState);
    let pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    while (pos_x == myState.nColumns || pos_y == myState.nRows || myState.grid[pos_x][pos_y].length != 0 || (pos_x == next_x && pos_y == next_y)) {
        pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    }

    // update game state
    myState.food.push({ id: id, x: pos_x, y: pos_y });
    myState.grid[pos_x][pos_y].push(new Cell("fruit", fruits[id]));
}

// draw the fruit, fruits[id]'s image at pos_x, pos_y; with given magnification
function drawFruit(myState, id, pos_x, pos_y, magnification = 1) {
    if (!(pos_x < myState.nColumns && pos_x >= 0 && pos_y < myState.nRows && pos_y >= 0)) {
        console.error("Invalid fruit coordinates!");
        return;
    }

    let fruit = fruits[id];
    let image_base_path = fruit.sprite;
    let image = image_elems[image_base_path];
    let [canvas_x, canvas_y] = myState.gtoc(pos_x, pos_y);
    let imageX = canvas_x + myState.cellSize / 2 - myState.cellSize / 2 * magnification;
    let imageY = canvas_y + myState.cellSize / 2 - myState.cellSize / 2 * magnification;

    myState.ctx.drawImage(image, imageX, imageY, myState.cellSize * magnification, myState.cellSize * magnification);
}

// give the dir name for a dir vector
function getDirString(dirX, dirY) {
    if (dirX == 0 && dirY == 1) {
        return "down";
    } else if (dirX == 0 && dirY == -1) {
        return "up";
    } else if (dirX == 1 && dirY == 0) {
        return "right";
    } else if (dirX == -1 && dirY == 0) {
        return "left";
    } else {
        console.error("Invalid dirX, dirY!", dirX, dirY);
        return undefined;
    }
}

// updates the direction variable at each tick
function updateDir(myState) {
    myState.snake.prevdir.x = myState.snake.dir.x;
    myState.snake.prevdir.y = myState.snake.dir.y;

    if (!myState.inputBuffer[0] || (checkOpposite(myState.snake.dir, myState.inputBuffer[0]))) {
        return;
    }

    // retrieve from inputBuffer
    myState.snake.dir.x = myState.inputBuffer[0].x;
    myState.snake.dir.y = myState.inputBuffer[0].y;

    myState.inputBuffer.shift()
}

// update the canvas according to game state
function updateCanvas(myState) {

    // clean board by repainting
    drawBoard(myState);
    myState.frameNum += 1;

    // add flicker to snake
    if (myState.snake.isImmune) {
        if (myState.snake.immunityTicks < 5) {
            myState.snake.color == "main" ? myState.snake.color = "immune" : myState.snake.color = "main";
        }
    } else {
        myState.snake.color = "main";
    }

    drawSnake(myState);

    // twinkle of each fruit
    myState.food.forEach((fruit) => {
        let magn = (myState.frameNum % 4 < 2) ? 0.85 : 1;
        drawFruit(myState, fruit.id, fruit.x, fruit.y, magn);
    });

}

// check death at next position, and return cause; undefined if safe
function getDeathCause(myState) {
    let causeOfDeath = undefined;
    let [next_x, next_y] = myState.snake.nextPos(myState);

    if (next_x >= myState.nColumns || next_x < 0 || next_y >= myState.nRows || next_y < 0) {
        causeOfDeath = "WALL";
    } else {
        let cells = myState.grid[next_x][next_y];

        // only collides with tail if it does not move
        if (cells.length != 0 && (cells[cells.length - 1].type == "snake_body" || (!myState.snake.tailChanged && cells[0].type == "snake_tail"))) {
            causeOfDeath = "SELF";
        }
    }
    return causeOfDeath;
}

// perform necessary actions at snake death
function executeFuneral(myState, cause) {
    myState.isPaused = true;
    myState.deathTime = performance.now();

    let st = myState.startTimeUNIX;
    myState.snake.timeAlive = myState.deathTime - myState.startTime;

    let pad = (n) => String(n).padStart(2, '0');
    let formattedStartTime = `[${st.getFullYear()}-${pad(st.getMonth() + 1)}-${pad(st.getDate())} ${pad(st.getHours())}:${pad(st.getMinutes())}:${pad(st.getSeconds())}]`;

    // add record to user.records
    let successfullyAdded = user.addRecord({ "startTime": formattedStartTime, "score": myState.score, "cause": cause, "timeAlive": (myState.snake.timeAlive / 1000).toFixed(3) });
    if (successfullyAdded) {

        // send record to backend
        user.saveLatestRecord();
    }

    updateUIafterDeath(myState, cause);

    myState.destroy();  //TODO maybe add a proper reset function
}

// update death modal, stats modal, other stats, etc. in UI after death
function updateUIafterDeath(myState, cause) {
    document.getElementById("death-cause").innerHTML = `Death by: ${cause}`;
    updateUI(myState);

    // display death modal
    let endModal = new bootstrap.Modal(document.getElementById("endModal"));
    endModal.show();

    fillStatsModal(myState, cause);
}

// add the latest record to stats table
function fillStatsModal(myState, cause) {
    let statsTable = document.getElementById("game-stats-table");
    let dataRow = document.createElement("tr");
    dataRow.innerHTML = `<td>${myState.score}</td><td>${(myState.snake.timeAlive / 1000).toFixed(3)}s</td><td>${cause}</td>`
    statsTable.appendChild(dataRow);
}

// update game state at each tick
function updateState(myState) {

    // get direction
    updateDir(myState);

    // decrement speedTicks
    myState.snake.speedTicks = Math.max(0, myState.snake.speedTicks - 1);
    if (myState.snake.speedTicks == 0) { myState.tickRate = TICK_RATE; }

    // decrement immunityTicks
    if (myState.snake.isImmune) {
        myState.snake.immunityTicks -= 1;
    }

    let beatenHighScore = myState.score > user.highScore(myState);

    let [next_x, next_y] = myState.snake.nextPos(myState);
    myState.snake.growthBuffer += consumeFruitAt(myState, next_x, next_y);

    // check if achieved new high score and display in UI
    if (!beatenHighScore && myState.score > user.highScore(myState)) {
        document.getElementById("highscore-msg-instrip").classList.remove("hidden");
        setTimeout(() => {
            document.getElementById("highscore-msg-instrip").classList.add("hidden");
        }, 3000);
    }

    // tail doesn't change if snake is to increase
    myState.snake.tailChanged = myState.snake.growthBuffer <= 0;

    // check death
    if (!myState.snake.isImmune) {
        let cause = getDeathCause(myState);
        if (cause) {
            executeFuneral(myState, cause);
            //TODO: add relevant death animations!!!
            return;
        }
    }

    // move head or tail or both depending on growthBuffer
    if (myState.snake.growthBuffer == 0) {      
        updateTail(myState);
        updateHead(myState);
    } else if (myState.snake.growthBuffer > 0) {
        myState.snake.growthBuffer -= 1;
        updateHead(myState);
    } else {
        updateTail(myState);
        myState.snake.growthBuffer += 1;
    }
}

// update image_elems after loading all sprites
function loadContent() {
    loadImages(images).then(results => {
        results.forEach(({ src, img }) => {
            image_elems[src] = img;
        });
    });
}

// check username validity
function isNameValid(username) {
    let msg = "";
    if (username.includes(",")) { msg = "Username can not contain commas."; }
    if (username.length < 3 || username.length > 15) { msg = "Username should have atleast 3 and atmost 15 characters."; }
    return msg;
}

// check username and display error in UI
function validateUsername(username) {
    let errorMsg = isNameValid(username);
    if (errorMsg != "") {
        let el = document.getElementById("usernameError");
        el.innerHTML = errorMsg;
        el.style.display = "block";
        return false;
    }
    document.getElementById("usernameError").classList.toggle("hidden");
    return true;
}

// update UI on start
function start() {

    startModal.hide();

    // wait for hiding to finish
    document.getElementById("startModal").addEventListener("hidden.bs.modal", () => {
        // retrieve and validate data
        let username = document.getElementById("username").value;
        for (let el of document.getElementsByClassName("username-value")) {
            el.innerHTML = username;
        }
        graphicsMode = document.getElementById("mode").value;

        if (!validateUsername(username)) {
            return;
        }
        user.username = username;

        // change start modal to retry modal and display homepage
        if (isFirst) {
            Array.from(document.getElementsByClassName("retry")).forEach(el => { el.classList.toggle("hidden"); });
            Array.from(document.getElementsByClassName("start")).forEach(el => { el.classList.toggle("hidden"); });

            document.getElementById("mainBody").classList.toggle("hidden");
            // document.getElementById("mainBody").classList.toggle("d-flex");

            isFirst = false;
        }

        initGameState();
    }, { once: true });
}

// initialize game state
function initGameState() {
    myState = new GameState();
    myState.grid[2][1].push(new Cell("snake_head", myState.snake.head));
    myState.grid[1][1].push(new Cell("snake_tail", myState.snake.tail));
    setupInput(myState);
    initGame(myState);
}

// set up input listener handler for a new state
function setupInput(myState) {
    myState.inputHandlerFunction = (event) => { inputHandler(event, myState); }
    document.addEventListener("keydown", myState.inputHandlerFunction);
}

// update game state's input
function inputHandler(event, myState) {
    const keys = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowRight: { x: 1, y: 0 },
        ArrowLeft: { x: -1, y: 0 },

        W: { x: 0, y: -1 },
        A: { x: -1, y: 0 },
        S: { x: 0, y: 1 },
        D: { x: 1, y: 0 },

        w: { x: 0, y: -1 },
        a: { x: -1, y: 0 },
        s: { x: 0, y: 1 },
        d: { x: 1, y: 0 }
    }

    let input = keys[event.key];

    // other keys
    if (!input) { return; }

    // don't push consecutively same or opposite directions in buffer
    if (myState.inputBuffer.length != myState.inputBufferSize) {
        myState.inputBuffer.push(input);
        let len = myState.inputBuffer.length;
        if (len >= 2) {
            if (checkOpposite(input, myState.inputBuffer[len - 2]) || getDirString(input.x, input.y) == getDirString(myState.inputBuffer[len - 2].x, myState.inputBuffer[len - 2].y)) {
                myState.inputBuffer.pop();
            }
        } else {
            if (checkOpposite(input, myState.snake.dir) || getDirString(input.x, input.y) == getDirString(myState.snake.dir.x, myState.snake.dir.y)) {
                myState.inputBuffer.pop();
            }
        }
    }

    // check directions to be pushed at game start and start loop
    if (myState.isPaused == true && myState.isFinished == false) {
        if (input.x == 1 && input.y == 0) {
            myState.inputBuffer.push(input);
        }
        if (!(input.x == -1 && input.y == 0)) {
            myState.isPaused = false;
            startGameLoop(myState);
        }
    }
}

// check's if two dir objects are opposite
function checkOpposite(dir1, dir2) {
    return getDirString(dir1.x, dir1.y) == getDirString(-dir2.x, -dir2.y);
}

// start the gameLoop function
function startGameLoop(myState) {
    if (myState.isPaused) { return; }
    myState.startTimeUNIX = new Date();
    myState.startTime = performance.now();
    gameLoop(myState);
}

// detect and consume fruit at x, y; and spawn new fruit; returns fruit.score if found
function consumeFruitAt(myState, x, y) {
    if (x >= myState.nColumns || x < 0 || y >= myState.nRows || y < 0) {
        console.error("Index out of bounds");
        return 0;
    } //TODO: add similar exhaustive checks at all places
    if (myState.grid[x][y].length != 0 && myState.grid[x][y][0].type == "fruit") { //since only one fruit can be present if there is anything
        let fruit = myState.grid[x][y][0].entity;
        fruit.onEat(fruit, myState);
        deleteFruit(myState, x, y);
        spawnFruit(myState);
        return fruit.score;
    } else {
        return 0;
    }
}

// delete fruit at x, y from game state
function deleteFruit(myState, x, y) {
    myState.grid[x][y] = [];
    const idx = myState.food.findIndex(f => f.x === x && f.y === y)
    if (idx !== -1) {
        myState.food.splice(idx, 1)
    }
}

// updates snake.body with new head and a changed 2nd segment; and update grid
function updateHead(myState) { 
    let [next_x, next_y] = myState.snake.nextPos(myState);

    // add new head to snake.body
    myState.snake.body.unshift({ x: next_x, y: next_y, sprite: `head_${getDirString(myState.snake.dir.x, myState.snake.dir.y)}.png` })

    // update grid for head
    myState.grid[next_x][next_y].push(new Cell("snake_head", myState.snake.head));

    // for 2nd segment; no need for length = 2
    if (myState.snake.length >= 3) {

        let del_x = myState.snake.dir.x - myState.snake.prevdir.x;     // dirs are in such a way that del_x, del_y can uniquely determine the sprite
        let del_y = myState.snake.dir.y - myState.snake.prevdir.y;

        if (del_x == 0 && del_y == 0) { // no change in direction
            myState.snake.body[1].sprite = (myState.snake.dir.x != 0) ? "body_horizontal.png" : "body_vertical.png"
        } else {
            if (del_x == -1) { del_x = 0 }    // mapping -1 to 0, 1 to 1 
            if (del_y == -1) { del_y = 0 }    // to access turn_images array

            myState.snake.body[1].sprite = turn_images[del_x][del_y];
        }

        // update grid for 2nd segment
        let cellsAtPrevHead = myState.grid[myState.snake.body[1].x][myState.snake.body[1].y];
        cellsAtPrevHead[cellsAtPrevHead.length - 1] = new Cell("snake_body", myState.snake.body[1]);
    }
}

// updates snake.body with new tail
function updateTail(myState) {

    // tailDir is direction opposite to tail-end
    let tailDir = {
        x: myState.snake.dir.x,
        y: myState.snake.dir.y
    }

    if (myState.snake.length != 2) {
        // new tail direction is difference between positions of current 2nd last and 3rd last tile
        let del_x = myState.snake.body[myState.snake.length - 3].x - myState.snake.body[myState.snake.length - 2].x;
        let del_y = myState.snake.body[myState.snake.length - 3].y - myState.snake.body[myState.snake.length - 2].y;
        tailDir.x = del_x;
        tailDir.y = del_y;

        // handling warps through walls
        if (del_x == myState.nColumns - 1 || del_x == -(myState.nColumns - 1)) {
            tailDir.x = (del_x > 0) ? -1 : +1;
        } else if (del_y == myState.nRows - 1 || del_y == -(myState.nRows - 1)) {
            tailDir.y = (del_y > 0) ? -1 : +1;
        }
    }

    // update to new tail
    myState.snake.body[myState.snake.length - 2].sprite = `tail_${getDirString(-tailDir.x, -tailDir.y)}.png`;

    // update grid
    let cellsAtNewTail = myState.grid[myState.snake.body[myState.snake.length - 2].x][myState.snake.body[myState.snake.length - 2].y];
    cellsAtNewTail[0] = new Cell("snake_tail", myState.snake.body[myState.snake.length - 2]);

    let cellsAtPrevTail = myState.grid[myState.snake.tail.x][myState.snake.tail.y];
    cellsAtPrevTail.shift();

    myState.snake.prevTail = myState.snake.tail;

    // delete the old tail
    myState.snake.body.pop();
}

// play a sound
function playSound(basePath) {
    let sfxPath = `../static/sounds/${graphicsMode}/${basePath}.mp3`;
    const sfx = new Audio(sfxPath);
    sfx.play();
}

// play eating sound
function ateCarrots(fruit, myState) {
    let nCarrots = fruit.score;
    playSound("ateCarrot");
}

// update state for immunity and play sound
function ateGoldenApple(fruit, myState) {
    myState.snake.immunityTicks = IMMUNITY_TICKS;
    myState.snake.color = "immune";
    playSound("immuneOn");
}

// update state for speed-up
function ateSpeedUp(fruit, myState) {
    myState.tickRate = TICK_RATE / SPEEDUP_FACTOR;
    myState.snake.speedTicks = SPEEDUP_TICKS;
}

// reset stats in UI
function resetUI(myState) {
    for (let el of document.getElementsByClassName("score-value")) {
        el.innerHTML = 2;
    }
    for (let el of document.getElementsByClassName("time-value")) {
        el.innerHTML = "0.000s";
    }
    for (let el of document.getElementsByClassName("length-value")) {
        el.innerHTML = 2;
    }

    document.querySelector("#immunity-progress-bar .bar-filled").style.width = "0%";
    document.querySelector("#speed-progress-bar .bar-filled").style.width = "0%";

    document.getElementById("highscore-msg-instrip").classList.add("hidden");
    document.getElementById("active-effects-instrip").innerHTML = "";
}

// init game by drawing everything and resetting UI
function initGame(myState) {
    drawBoard(myState);
    spawnFruit(myState);
    updateCanvas(myState);
    resetUI(myState);
    // startGameLoop(myState); //TODO: change later
}

// main game loop, calling all updaters
function gameLoop(myState, lastStateUpdate = 0, lastCanvasUpdate = 0) {
    if (myState.isPaused) { return; }

    let curTime = performance.now();

    // call if tickRate time passed
    if (curTime - lastStateUpdate > myState.tickRate) {
        updateState(myState);
        lastStateUpdate = curTime;
    }

    // call if graphicsRefreshRate time passed
    if (curTime - lastCanvasUpdate > myState.graphicsRefreshRate) {
        updateCanvas(myState);
        lastCanvasUpdate = curTime;
    }

    myState.snake.timeAlive = curTime - myState.startTime;

    // update UI every call
    updateUI(myState);

    window.requestAnimationFrame(() => gameLoop(myState, lastStateUpdate, lastCanvasUpdate));
}

// update all counters and progress bars, etc in UI
function updateUI(myState) {
    for (let el of document.getElementsByClassName("score-value")) {
        el.innerHTML = myState.score;
    }
    for (let el of document.getElementsByClassName("time-value")) {
        el.innerHTML = `${(myState.snake.timeAlive / 1000).toFixed(3)}s`;
    }
    for (let el of document.getElementsByClassName("length-value")) {
        el.innerHTML = myState.snake.length;
    }
    for (let el of document.getElementsByClassName("high-score-value")) {
        el.innerHTML = Math.max(myState.score, user.highScore(myState));
    }

    document.querySelector("#immunity-progress-bar .bar-filled").style.width = `${myState.snake.immunityTicks / IMMUNITY_TICKS * 100}%`;
    document.querySelector("#speed-progress-bar .bar-filled").style.width = `${myState.snake.speedTicks / SPEEDUP_TICKS * 100}%`;

    let effects = [];
    myState.snake.immunityTicks > 0 ? effects.push("Immunity") : null;
    myState.snake.speedTicks > 0 ? effects.push("Speed") : null;

    if (effects.length > 0) {
        document.getElementById("active-effects-instrip").innerHTML = `Active: ${effects.join(", ")}`;
    } else {
        document.getElementById("active-effects-instrip").innerHTML = "";
    }
}

loadContent();

document.getElementById("startbtn").addEventListener("click", start);

// show start modal after page loads
var startModal = new bootstrap.Modal(document.getElementById("startModal"));
startModal.show();

//autofocus start and retry buttons when modal is shown
document.getElementById("startModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("startbtn").focus();
})

document.getElementById("endModal").addEventListener("shown.bs.modal", () => {
    document.getElementById("retry-btn").focus();
})
