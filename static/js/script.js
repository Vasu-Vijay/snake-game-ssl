const CONFIG = {
    BOARD: {
        N_COLUMNS: 13,
        N_ROWS: 13,
        CELL_SIZE: 60
    },

    GAMEPLAY: {
        IMMUNITY_TICKS: 30,
        SPEEDUP_TICKS: 20,
        SPEEDUP_FACTOR: 2,
        TICK_RATE: 200,
        INPUT_BUFFER_SIZE: 3,
        GRAPHICS_REFRESH_RATE: 100,
    },

    GRAPHICS_SCALE: 2,

    GRAPHICS: {
        COLOR_1: "#00c60d",
        COLOR_2: "#02940c",
        graphicsMode: "classic"
    },

    GAME: {
        DEATH_CAUSES: ["WALL", "SELF"]
    }
};

const assets = {
    images: {},
    turnSprites: [["body_topleft.png", "body_bottomleft.png"],       // -1, -1   -1, +1     {del_x, del_y values}
    ["body_topright.png", "body_bottomright.png"]],    // +1, -1   +1, +1 
    spritesFolder: "../static/media/sprites/"
}

const eatingHandlers = {
    // play eating sound
    ateCarrots(fruit, game) {
        let nCarrots = fruit.score;
        AudioManager.playSound("ateCarrot");
    },

    // update state for immunity and play sound
    ateGoldenApple(fruit, game) {
        game.snake.immunityTicks = CONFIG.GAMEPLAY.IMMUNITY_TICKS;
        game.snake.color = "immune";
        AudioManager.playSound("immuneOn");
    },

    // update state for speed-up
    ateSpeedUp(fruit, game) {
        game.tickRate = CONFIG.GAMEPLAY.TICK_RATE / CONFIG.GAMEPLAY.SPEEDUP_FACTOR;
        game.snake.speedTicks = CONFIG.GAMEPLAY.SPEEDUP_TICKS;
    }
}

const fruits = {
    carrot: {
        name: "Carrot",
        score: 1,
        sprite: `${assets.spritesFolder}fruits/carrot.png`,
        rel_probability: 1,
        onEat: eatingHandlers.ateCarrots
    },
    triplecarrot: {
        name: "Triple Carrot",
        score: 3,
        sprite: `${assets.spritesFolder}fruits/triplecarrot.png`,
        rel_probability: 10,
        onEat: eatingHandlers.ateCarrots
    },
    goldenapple: {
        name: "Golden Apple",
        score: 0,
        sprite: `${assets.spritesFolder}fruits/goldenapple.png`,
        rel_probability: 2,
        onEat: eatingHandlers.ateGoldenApple
    },
    speedupfruit: {
        name: "Energy",
        score: 1,
        sprite: `${assets.spritesFolder}fruits/speedupfruit.png`,
        rel_probability: 1,
        onEat: eatingHandlers.ateSpeedUp
    }
}

const App = {
    game: null,
    user: null,
    uimodals: {
        start: null,
        end: null
    },
    bsmodals: {
        start: null,
        end: null
    }
}

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
        if (!((record.startTime) && (record.score && record.score >= 2) && (record.cause && CONFIG.GAME.DEATH_CAUSES.includes(record.cause)) && (record.timeAlive && record.timeAlive > 0))) {
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

// class containing all relevant variables for a game state
class GameState {
    constructor(nRows = CONFIG.BOARD.N_ROWS, nColumns = CONFIG.BOARD.N_COLUMNS, cellSize = CONFIG.BOARD.CELL_SIZE) {
        this.nRows = nRows;
        this.nColumns = nColumns;
        this.cellSize = cellSize;

        this.canvas = document.getElementById("game");
        this.ctx = this.canvas.getContext("2d");

        // forces higher resolution in canvas, keeping same size in css
        this.scale = CONFIG.GRAPHICS_SCALE;

        this.canvas.width = this.nColumns * this.cellSize
        this.canvas.height = this.nRows * this.cellSize

        this.canvas.style.width = `${this.nColumns * this.cellSize / this.scale}px`
        this.canvas.style.height = `${this.nRows * this.cellSize / this.scale}px`

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        this.snake = new Snake();

        // init empty grid
        this.grid = Array.from({ length: this.nColumns }, () =>
            Array.from({ length: this.nRows }, () => [])
        );

        this.inputBuffer = [];

        this.tickRate = CONFIG.GAMEPLAY.TICK_RATE;
        this.graphicsRefreshRate = CONFIG.GAMEPLAY.GRAPHICS_REFRESH_RATE;

        this.startTimeUNIX = undefined;
        this.startTime = undefined;
        this.deathTime = undefined;

        this.frameNum = 0;

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

    update() {
        // get direction
        this.snake.updateDir(this);

        // decrement speedTicks
        this.snake.speedTicks = Math.max(0, this.snake.speedTicks - 1);
        if (this.snake.speedTicks == 0) { this.tickRate = CONFIG.GAMEPLAY.TICK_RATE; }

        // decrement immunityTicks
        if (this.snake.isImmune) {
            this.snake.immunityTicks -= 1;
        }

        let beatenHighScore = this.score > App.user.highScore(this);
        this.snake.checkFruit(this);

        // check if achieved new high score and display in UI
        if (!beatenHighScore && this.score > App.user.highScore(this)) {
            UI.newHighScoreMessage();
        }

        // tail doesn't change if snake is to increase
        this.snake.tailChanged = this.snake.growthBuffer <= 0;

        // check death
        if (!this.snake.isImmune) {
            let cause = this.getDeathCause();
            if (cause) {
                executeFuneral(this, cause);
                //TODO: add relevant death animations!!!
                return;
            }
        }

        // move head or tail or both depending on growthBuffer
        if (this.snake.growthBuffer == 0) {
            this.snake.updateTail(this);
            this.snake.updateHead(this);
        } else if (this.snake.growthBuffer > 0) {
            this.snake.growthBuffer -= 1;
            this.snake.updateHead(this);
        } else {
            this.snake.updateTail(this);
            this.snake.growthBuffer += 1;
        }
    }

    // start the gameLoop function
    startGameLoop() {
        if (this.isPaused) { return; }
        this.startTimeUNIX = new Date();
        this.startTime = performance.now();
        this.gameLoop();
    }

    // main game loop, calling all updaters
    gameLoop(lastStateUpdate = 0, lastCanvasUpdate = 0) {
        if (this.isPaused) { return; }

        let curTime = performance.now();

        // call if tickRate time passed
        if (curTime - lastStateUpdate > this.tickRate) {
            this.update();
            lastStateUpdate = curTime;
        }

        // call if graphicsRefreshRate time passed
        if (curTime - lastCanvasUpdate > this.graphicsRefreshRate) {
            Renderer.update(this);
            lastCanvasUpdate = curTime;
        }

        this.snake.timeAlive = curTime - this.startTime;

        // update UI every call
        UI.update(this);

        window.requestAnimationFrame(() => this.gameLoop(lastStateUpdate, lastCanvasUpdate));
    }

    // check death at next position, and return cause; undefined if safe
    getDeathCause() {
        let causeOfDeath = undefined;
        let [next_x, next_y] = this.snake.nextPos(this);

        if (next_x >= this.nColumns || next_x < 0 || next_y >= this.nRows || next_y < 0) {
            causeOfDeath = "WALL";
        } else {
            let cells = this.grid[next_x][next_y];

            // only collides with tail if it does not move
            if (cells.length != 0 && (cells[cells.length - 1].type == "snake_body" || (!this.snake.tailChanged && cells[0].type == "snake_tail"))) {
                causeOfDeath = "SELF";
            }
        }
        return causeOfDeath;
    }

    // end game state
    destroy() {
        this.isPaused = true;
        document.removeEventListener("keydown", this.inputHandlerFunction);
        App.game = null;
    }
}

// class containing properties of snake
class Snake {
    constructor() {
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
        this.speedTicks = 0;
        this.timeAlive = 0;
        this.prevTail = this.tail;
        this.color = "main";
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
    nextPos(game) {
        let next_x = this.head.x + this.dir.x;
        let next_y = this.head.y + this.dir.y;
        if (this.isImmune) {
            next_x = next_x < 0 ? (next_x % game.nColumns + game.nColumns) : (next_x % game.nColumns);
            next_y = next_y < 0 ? (next_y % game.nRows + game.nRows) : (next_y % game.nRows);
        }
        return [next_x, next_y];
    }

    // updates the direction variable at each tick
    updateDir(game) {
        this.prevdir.x = this.dir.x;
        this.prevdir.y = this.dir.y;

        if (!game.inputBuffer[0] || (utils.checkOpposite(this.dir, game.inputBuffer[0]))) {
            return;
        }

        // retrieve from inputBuffer
        this.dir.x = game.inputBuffer[0].x;
        this.dir.y = game.inputBuffer[0].y;

        game.inputBuffer.shift()
    }

    // updates snake.body with new head and a changed 2nd segment; and update grid
    updateHead(game) {
        let [next_x, next_y] = this.nextPos(game);

        // add new head to snake.body
        this.body.unshift({ x: next_x, y: next_y, sprite: `head_${utils.getDirString(this.dir.x, this.dir.y)}.png` })

        // update grid for head
        game.grid[next_x][next_y].push(new Cell("snake_head", this.head));

        // for 2nd segment; no need for length = 2
        if (this.length >= 3) {

            let del_x = this.dir.x - this.prevdir.x;     // dirs are in such a way that del_x, del_y can uniquely determine the sprite
            let del_y = this.dir.y - this.prevdir.y;

            if (del_x == 0 && del_y == 0) { // no change in direction
                this.body[1].sprite = (this.dir.x != 0) ? "body_horizontal.png" : "body_vertical.png"
            } else {
                if (del_x == -1) { del_x = 0 }    // mapping -1 to 0, 1 to 1 
                if (del_y == -1) { del_y = 0 }    // to access turnSprites array

                this.body[1].sprite = assets.turnSprites[del_x][del_y];
            }

            // update grid for 2nd segment
            let cellsAtPrevHead = game.grid[this.body[1].x][this.body[1].y];
            cellsAtPrevHead[cellsAtPrevHead.length - 1] = new Cell("snake_body", this.body[1]);
        }
    }

    // updates snake.body with new tail
    updateTail(game) {

        // tailDir is direction opposite to tail-end
        let tailDir = {
            x: this.dir.x,
            y: this.dir.y
        }

        if (this.length != 2) {
            // new tail direction is difference between positions of current 2nd last and 3rd last tile
            let del_x = this.body[this.length - 3].x - this.body[this.length - 2].x;
            let del_y = this.body[this.length - 3].y - this.body[this.length - 2].y;
            tailDir.x = del_x;
            tailDir.y = del_y;

            // handling warps through walls
            if (del_x == game.nColumns - 1 || del_x == -(game.nColumns - 1)) {
                tailDir.x = (del_x > 0) ? -1 : +1;
            } else if (del_y == game.nRows - 1 || del_y == -(game.nRows - 1)) {
                tailDir.y = (del_y > 0) ? -1 : +1;
            }
        }

        // update to new tail
        this.body[this.length - 2].sprite = `tail_${utils.getDirString(-tailDir.x, -tailDir.y)}.png`;

        // update grid
        let cellsAtNewTail = game.grid[this.body[this.length - 2].x][this.body[this.length - 2].y];
        cellsAtNewTail[0] = new Cell("snake_tail", this.body[this.length - 2]);

        let cellsAtPrevTail = game.grid[this.tail.x][this.tail.y];
        cellsAtPrevTail.shift();

        this.prevTail = this.tail;

        // delete the old tail
        this.body.pop();
    }

    checkFruit(game) {
        let [next_x, next_y] = this.nextPos(game);
        this.growthBuffer += FruitManager.consumeAt(game, next_x, next_y); //REFAC: change to check fruit only return the reqd value and use fruitmanager module to actually dlt, and respawn fruit
    }
}

class Cell {
    constructor(type, entity) {
        this.type = type;
        this.entity = entity;
    }
}

const Renderer = {
    // update the canvas according to game state
    update(game) {

        // clean board by repainting
        this.drawBoard(game);
        game.frameNum += 1;

        // add flicker to snake
        if (game.snake.isImmune) {
            if (game.snake.immunityTicks < 5) {
                game.snake.color == "main" ? game.snake.color = "immune" : game.snake.color = "main";
            }
        } else {
            game.snake.color = "main";
        }

        this.drawSnake(game);

        // twinkle of each fruit
        game.food.forEach((fruit) => {
            let magn = (game.frameNum % 4 < 2) ? 0.85 : 1;
            this.drawFruit(game, fruit.id, fruit.x, fruit.y, magn);
        });

    },

    // draw the entire board
    drawBoard(game) {
        for (let i = 0; i < game.nColumns; i++) {
            for (let j = 0; j < game.nRows; j++) {
                this.drawBackground(game, i, j);
            }
        }
    },

    // draw background of cell at x, y of grid
    drawBackground(game, x, y) {
        if ((x + y) % 2 == 0) {
            var color = CONFIG.GRAPHICS.COLOR_1;
        } else {
            var color = CONFIG.GRAPHICS.COLOR_2;
        }
        let [canvas_x, canvas_y] = game.gtoc(x, y);
        game.ctx.fillStyle = color;
        game.ctx.fillRect(canvas_x, canvas_y, game.cellSize, game.cellSize);
    },

    // draw the snake, with corresponding sprites; and update game.grid
    drawSnake(game) {
        let snake = game.snake;

        // reverse painting order to handle overlap of segments
        for (let i in snake.body) {
            let s = snake.body[snake.length - i - 1];
            if (!s) {
                console.error("Invalid snake element");
                return;
            }

            let [canvas_x, canvas_y] = game.gtoc(s.x, s.y);

            // path = sprite folder + theme + snake-color + segment-type
            let imagePath = assets.spritesFolder + CONFIG.GRAPHICS.graphicsMode + "/" + game.snake.color + "/" + s.sprite;
            game.ctx.drawImage(assets.images[imagePath], canvas_x, canvas_y, game.cellSize, game.cellSize);
        }
    },

    // draw the fruit, fruits[id]'s image at pos_x, pos_y; with given magnification
    drawFruit(game, id, pos_x, pos_y, magnification = 1) {
        if (!(pos_x < game.nColumns && pos_x >= 0 && pos_y < game.nRows && pos_y >= 0)) {
            console.error("Invalid fruit coordinates!");
            return;
        }

        let fruit = fruits[id];
        let image_base_path = fruit.sprite;
        let image = assets.images[image_base_path];
        let [canvas_x, canvas_y] = game.gtoc(pos_x, pos_y);
        let imageX = canvas_x + game.cellSize / 2 - game.cellSize / 2 * magnification;
        let imageY = canvas_y + game.cellSize / 2 - game.cellSize / 2 * magnification;

        game.ctx.drawImage(image, imageX, imageY, game.cellSize * magnification, game.cellSize * magnification);
    }
};


const UI = {
    // update all counters and progress bars, etc in UI
    update(game) {
        for (let el of document.getElementsByClassName("score-value")) {
            el.innerHTML = game.score;
        }
        for (let el of document.getElementsByClassName("time-value")) {
            el.innerHTML = `${(game.snake.timeAlive / 1000).toFixed(3)}s`;
        }
        for (let el of document.getElementsByClassName("length-value")) {
            el.innerHTML = game.snake.length;
        }
        for (let el of document.getElementsByClassName("high-score-value")) {
            el.innerHTML = Math.max(game.score, App.user.highScore(game));
        }

        document.querySelector("#immunity-progress-bar .bar-filled").style.width = `${game.snake.immunityTicks / CONFIG.GAMEPLAY.IMMUNITY_TICKS * 100}%`;
        document.querySelector("#speed-progress-bar .bar-filled").style.width = `${game.snake.speedTicks / CONFIG.GAMEPLAY.SPEEDUP_TICKS * 100}%`;

        let effects = [];
        game.snake.immunityTicks > 0 ? effects.push("Immunity") : null;
        game.snake.speedTicks > 0 ? effects.push("Speed") : null;

        if (effects.length > 0) {
            document.getElementById("active-effects-instrip").innerHTML = `Active: ${effects.join(", ")}`;
        } else {
            document.getElementById("active-effects-instrip").innerHTML = "";
        }
    },

    // reset stats in UI
    reset(game) {
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
    },

    // update death modal, stats modal, other stats, etc. in UI after death
    updateAfterDeath(game, cause) {
        document.getElementById("death-cause").innerHTML = `Death by: ${cause}`;
        this.update(game);

        // display death modal
        //let endModal = new bootstrap.Modal(document.getElementById("endModal")); //REFAC: use App vars
        App.bsmodals.end.show();

        this.fillStatsModal(game, cause);
    },

    // add the latest record to stats table
    fillStatsModal(game, cause) {
        let statsTable = document.getElementById("game-stats-table");
        let dataRow = document.createElement("tr");
        dataRow.innerHTML = `<td>${game.score}</td><td>${(game.snake.timeAlive / 1000).toFixed(3)}s</td><td>${cause}</td>`
        statsTable.appendChild(dataRow);
    },

    showStartModal() {
        // show start modal after page loads
        //var startModal = new bootstrap.Modal(document.getElementById("startModal")); //REFAC: use App vars and init where required
        App.bsmodals.start.show(); //REFAC: adjust timing accordingly
    },

    // check username and display error in UI
    validateUsername(username) {
        let errorMsg = utils.isNameValid(username);
        if (errorMsg != "") {
            let el = document.getElementById("usernameError");
            el.innerHTML = errorMsg;
            el.style.display = "block";
            return false;
        }
        document.getElementById("usernameError").classList.toggle("hidden");
        return true;
    },

    newHighScoreMessage() {
        document.getElementById("highscore-msg-instrip").classList.remove("hidden");
        setTimeout(() => {
            document.getElementById("highscore-msg-instrip").classList.add("hidden");
        }, 3000);
    }
};

const Input = {

    keysToDir: {
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
    },

    // set up input listener handler for a new state
    setup(game) {
        game.inputHandlerFunction = (event) => { this.handler(event, game); }
        document.addEventListener("keydown", game.inputHandlerFunction);
    },

    // update game state's input
    handler(event, game) {
        let inputDir = this.keysToDir[event.key];

        // other keys
        if (!inputDir) { return; }

        // don't push consecutively same or opposite directions in buffer
        if (game.inputBuffer.length != game.inputBufferSize) {
            game.inputBuffer.push(inputDir);
            let len = game.inputBuffer.length;
            if (len >= 2) {
                if (utils.checkOpposite(inputDir, game.inputBuffer[len - 2]) || utils.getDirString(inputDir.x, inputDir.y) == utils.getDirString(game.inputBuffer[len - 2].x, game.inputBuffer[len - 2].y)) {
                    game.inputBuffer.pop();
                }
            } else {
                if (utils.checkOpposite(inputDir, game.snake.dir) || utils.getDirString(inputDir.x, inputDir.y) == utils.getDirString(game.snake.dir.x, game.snake.dir.y)) { //REFAC: refactor getDirStirng to only take dir as argument, and make checkSame function
                    game.inputBuffer.pop();
                }
            }
        }

        // check directions to be pushed at game start and start loop
        if (game.isPaused == true && game.isFinished == false) {
            if (inputDir.x == 1 && inputDir.y == 0) {
                game.inputBuffer.push(inputDir);
            }
            if (!(inputDir.x == -1 && inputDir.y == 0)) {
                game.isPaused = false;
                game.startGameLoop();
            }
        }
    }
};

const AudioManager = {

    // play a sound
    playSound(basePath) {
        let sfxPath = `../static/sounds/${CONFIG.GRAPHICS.graphicsMode}/${basePath}.mp3`;
        const sfx = new Audio(sfxPath); //TODO: Improve this to not load every time
        sfx.play();
    }
};

const FruitManager = {

    // randomize fruit and an empty cell to spawn; update game.food; then call drawFruit
    spawn(game) {

        // cumulative weights according to relative probabilities of fruits used
        let cumWeights = {};
        let totalWeight = 0;
        let id = game.fruitsUsed[0];
        for (id of game.fruitsUsed) {
            if (!fruits[id]) {
                console.error("Invalid fruit id!");
                continue;
            }
            totalWeight += fruits[id].rel_probability;
            cumWeights[id] = totalWeight;
        }

        // decide fruit randomly in a weighted manner
        const random = Math.random() * totalWeight;
        for (id of game.fruitsUsed) {
            if (random <= cumWeights[id]) {
                break;
            }
        }

        // decide a random cell which is empty
        let [next_x, next_y] = game.snake.nextPos(game);
        let pos_x = Math.floor(Math.random() * game.nColumns), pos_y = Math.floor(Math.random() * game.nRows);
        while (pos_x == game.nColumns || pos_y == game.nRows || game.grid[pos_x][pos_y].length != 0 || (pos_x == next_x && pos_y == next_y)) {
            pos_x = Math.floor(Math.random() * game.nColumns), pos_y = Math.floor(Math.random() * game.nRows);
        }

        // update game state
        game.food.push({ id: id, x: pos_x, y: pos_y });
        game.grid[pos_x][pos_y].push(new Cell("fruit", fruits[id])); //REFAC: remove grid logics from everywhere
    },

    // detect and consume fruit at x, y; and spawn new fruit; returns fruit.score if found
    consumeAt(game, x, y) {
        if (x >= game.nColumns || x < 0 || y >= game.nRows || y < 0) {
            console.error("Index out of bounds");
            return 0;
        } //TODO: add similar exhaustive checks at all places
        if (game.grid[x][y].length != 0 && game.grid[x][y][0].type == "fruit") { //since only one fruit can be present if there is anything
            let fruit = game.grid[x][y][0].entity;
            fruit.onEat(fruit, game);
            this.deleteFruit(game, x, y);
            this.spawn(game);
            return fruit.score;
        } else {
            return 0;
        }
    },

    // delete fruit at x, y from game state
    deleteFruit(game, x, y) {
        game.grid[x][y] = [];
        const idx = game.food.findIndex(f => f.x === x && f.y === y)
        if (idx !== -1) {
            game.food.splice(idx, 1)
        }
    }
};

const utils = {

    // check username validity
    isNameValid(username) {
        let msg = "";
        if (!(/^[A-Za-z0-9_]+$/.test(username))) {
            msg = "Username can only contain alphanumeric characters and underscores.";
        }
        if (username.length < 4 || username.length > 18) { msg = "Username should have atleast 4 and atmost 18 characters."; }
        return msg;
    },

    // check's if two dir objects are opposite
    checkOpposite(dir1, dir2) {
        return this.getDirString(dir1.x, dir1.y) == this.getDirString(-dir2.x, -dir2.y);
    },

    // give the dir name for a dir vector
    getDirString(dirX, dirY) {
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
}

const Loader = {

    // load all images as html elements and return a promise to proceed after loading
    loadImages(images) {
        const promises = images.map(src => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = src;
                img.onload = () => resolve({ src, img })
                img.onerror = reject
            });
        });
        return Promise.all(promises);
    },

    // update assets after loading all sprites
    loadContent() {
        this.loadImages(images).then(results => {
            results.forEach(({ src, img }) => {
                assets.images[src] = img;
            });
        });
    }
};

function boot() {
    initGlobals();
    initModals();
    Loader.loadContent();
    UI.showStartModal();
}

function initGlobals() {
    App.user = new User();
}

function initModals() { //can go into UI module?

    App.uimodals.start = document.getElementById("startModal");
    App.uimodals.end = document.getElementById("endModal");
    App.bsmodals.start = new bootstrap.Modal(App.uimodals.start);
    App.bsmodals.end = new bootstrap.Modal(App.uimodals.end);

    //autofocus start and retry buttons when modal is shown
    App.uimodals.start.addEventListener("shown.bs.modal", () => {
        document.getElementById("startbtn").focus();
    });

    App.uimodals.end.addEventListener("shown.bs.modal", () => {
        document.getElementById("retry-btn").focus();
    });

    document.getElementById("startbtn").addEventListener("click", start);

    // change startmodal to retry modal on first hiding
    App.uimodals.start.addEventListener("hidden.bs.modal", () => {
        // change start modal to retry modal and display homepage
        Array.from(document.getElementsByClassName("retry")).forEach(el => { el.classList.toggle("hidden"); });
        Array.from(document.getElementsByClassName("start")).forEach(el => { el.classList.toggle("hidden"); });

        //show the mainpage
        document.getElementById("mainBody").classList.toggle("hidden");
    }, { once: true });
}

// do stuff at start
function start() {

    // retrieve and validate data
    let username = document.getElementById("username").value;
    CONFIG.GRAPHICS.graphicsMode = document.getElementById("mode").value;

    if (!UI.validateUsername(username)) {
        return;
    }
    for (let el of document.getElementsByClassName("username-value")) {
        el.innerHTML = username;
    }
    App.user.username = username; //REFAC: there was an initgamestate on startmodal hide, add it somewhere

    App.bsmodals.start.hide();
    initGameState();
}

function initGameState() {
    App.game = new GameState();
    let game = App.game;
    game.grid[2][1].push(new Cell("snake_head", game.snake.head));
    game.grid[1][1].push(new Cell("snake_tail", game.snake.tail));
    Input.setup(game);
    initGame(game);
}

//init game by drawing everything and resetting UI
function initGame(game) {
    FruitManager.spawn(game);
    Renderer.update(game);
    UI.reset(game);
}

// perform necessary actions at snake death
function executeFuneral(game, cause) {
    game.isPaused = true;
    game.deathTime = performance.now();

    let st = game.startTimeUNIX;
    game.snake.timeAlive = game.deathTime - game.startTime;

    let pad = (n) => String(n).padStart(2, '0');
    let formattedStartTime = `[${st.getFullYear()}-${pad(st.getMonth() + 1)}-${pad(st.getDate())} ${pad(st.getHours())}:${pad(st.getMinutes())}:${pad(st.getSeconds())}]`;

    // add record to user.records
    let successfullyAdded = App.user.addRecord({ "startTime": formattedStartTime, "score": game.score, "cause": cause, "timeAlive": (game.snake.timeAlive / 1000).toFixed(3) });
    if (successfullyAdded) {

        // send record to backend
        App.user.saveLatestRecord();
    }

    UI.updateAfterDeath(game, cause);

    game.destroy();  //TODO maybe add a proper reset function
}

boot();