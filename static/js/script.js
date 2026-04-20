const fruits = {
    "carrot": {name:"Carrot", score:1, sprite: "../static/sprites/fruits/carrot.png", rel_probability: 1, onEat: ateCarrots},
    "triplecarrot": {name:"Triple Carrot", score:3, sprite:"../static/sprites/fruits/three_carrots.png", rel_probability: 1, onEat: ateCarrots}, //TODO: image to be replaced, probability to be written
    "goldenapple": {name:"Golden Apple", score:0, sprite:"../static/sprites/fruits/golden_apple.png", rel_probability: 1, onEat: ateGoldenApple} //TODO: image to be made, also fix probability
}

var graphicsMode = "classic";

const IMMUNITY_TICKS = 20;
const CANVAS_HEIGHT = 300;
const CANVAS_WIDTH = 300;
const TICK_RATE = 200; //time in ms
const GRAPHICS_REFRESH_RATE = 100;

const image_elems={} //dict containing <image_path>:<html img elem> pairs

const turn_images=[["body_topleft.png","body_bottomleft.png"],     //-1,-1   -1,+1     {del_x, del_y values}
                   ["body_topright.png","body_bottomright.png"]];  //+1,-1   +1,+1

let isFirst = true;

let myState = null;

class User {
    constructor(username = "guest_user") {
        this.username = username;
        this.records = [];
    }

    get highScore() {
        return this.records.reduce((maxScore, record) => record.score > maxScore ? record.score : maxScore, 0);
    }

    addRecord(record) {
        if(!((record.startTime) && (record.score && record.score>=2) && (record.cause && ["SELF", "WALL"].includes(record.cause)) && (record.timeAlive && record.timeAlive > 0))) {
            console.error("Invalid record pushed!", record);
            return null;
        }
        this.records.push(record);
        return 1;
    }

    saveLatestRecord() {
        let record = this.records[this.records.length - 1];

        let data = new FormData();
        data.append("start_time", record.startTime);
        data.append("username", this.username);
        data.append("score", record.score); //TODO: add more stuff to the data var to send
        data.append("cause", record.cause);
        data.append("time_alive", record.timeAlive);

        fetch("/save_score", { //DOUBT: whats fetch functon tho??/?
            "method": "POST",
            "body": data,
        }).then(function (response){
            if(!response.ok) {
                console.error("HTTP error: ", response);
                return null;
            }
            return response.text();
        }).then(function (data){
            if(data) {
                if(data=="ok") {
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

class GameState {
    constructor(nRows = 10, nColumns = 10, cellSize = 30) {
        this.nRows = nRows;
        this.nColumns = nColumns;
        this.cellSize = cellSize;

        this.canvas = document.getElementById("game");
        this.ctx = this.canvas.getContext("2d");

        this.scale = window.devicePixelRatio || 1
        this.scale=2;

        this.canvas.width = CANVAS_WIDTH * this.scale
        this.canvas.height = CANVAS_HEIGHT * this.scale

        this.canvas.style.width = `${CANVAS_WIDTH}px`
        this.canvas.style.height = `${CANVAS_HEIGHT}px`

        this.cellSize *= this.scale;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";

        this.snake = new Snake(this);
        this.grid = Array.from({ length: nColumns }, () =>
            Array.from({ length: nRows }, () => [])
        );

        this.inputBuffer = [];
        this.inputBufferSize = 3;

        this.tickRate = TICK_RATE;
        this.graphicsRefreshRate = GRAPHICS_REFRESH_RATE;
        this.startTimeUNIX = undefined;
        this.frameNum = 0;
        this.startTime = undefined;
        this.deathTime = undefined;
        this.isPaused = true; //TODO: change it before commit
        this.gameLoopId = null;

        this.food = [];
        this.fruitsUsed = ["carrot", "triplecarrot", "goldenapple"];

        this.inputHandlerFunction = null;
    }

    get isFinished() {
        return this.deathTime != undefined;
    }

    get score() {
        return this.snake.length + this.snake.growthBuffer;
    }

    gtoc(x, y) { // convert grid's x,y coords to absolute x,y coords of the canvas, to keep board in center
        return [(this.canvas.width-(this.nColumns)*this.cellSize)/2+x*this.cellSize, (this.canvas.height-(this.nRows)*this.cellSize)/2+y*this.cellSize];
    }

    destroy() {
        this.isPaused = true;
        document.removeEventListener("keydown", this.inputHandlerFunction);
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
        this.immunityStartTime = undefined;
        this.timeAlive = 0;
        this.prevTail = this.tail;

        this.color = "main";
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
    
    immunityTicks(myState) {
        return Math.floor(this.immunityTime/myState.tickRate);
    }

    nextPos(myState) {
        let next_x = this.head.x + this.dir.x;
        let next_y = this.head.y + this.dir.y;
        if(this.isImmune) {
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

    for(let i in snake.body) { // painting order to decide who comes on top if overlap
        let s = snake.body[snake.length - i - 1];
        if(!s) {
            console.error("Invalid snake element");
            return;
        }

        let [canvas_x, canvas_y] = myState.gtoc(s.x, s.y);
        let imagePath = "../static/sprites/" + graphicsMode + "/" + myState.snake.color + "/" + s.sprite; // path = folder + base file name
        myState.ctx.drawImage(image_elems[imagePath], canvas_x, canvas_y, myState.cellSize, myState.cellSize);
    }
}

function spawnFruit(myState) { //decides a random fruit and a random empty coordinate, then calls drawFruit to draw the fruit at chosen position
    let cumWeights = {};
    let totalWeight = 0;
    let id = "carrot";
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

    let [next_x, next_y] = myState.snake.nextPos(myState)
    let pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    while(pos_x == myState.nColumns || pos_y == myState.nRows || myState.grid[pos_x][pos_y].length != 0 || (pos_x == next_x && pos_y == next_y)) {
        pos_x = Math.floor(Math.random() * myState.nColumns), pos_y = Math.floor(Math.random() * myState.nRows);
    }

    myState.food.push( {id: id, x: pos_x, y: pos_y} );
    myState.grid[pos_x][pos_y].push(new Cell("fruit", fruits[id]));
}

function drawFruit(myState, id, pos_x, pos_y, magnification = 1) { //draws a fruits[id] at x, y coords of grid
    if (!(pos_x < myState.nColumns && pos_x >= 0 && pos_y < myState.nRows && pos_y >= 0)) {
        console.error("Invalid fruit coordinates!");
        return;
    }

    let fruit = fruits[id];
    let image_path = fruit.sprite;
    let [canvas_x, canvas_y] = myState.gtoc(pos_x, pos_y);
    let imageX = canvas_x + myState.cellSize/2 - myState.cellSize/2 * magnification;
    let imageY = canvas_y + myState.cellSize/2 - myState.cellSize/2 * magnification;
    myState.ctx.drawImage(image_elems[image_path], imageX, imageY, myState.cellSize * magnification, myState.cellSize * magnification);
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
    
    if (!myState.inputBuffer[0] || (checkOpposite(myState.snake.dir, myState.inputBuffer[0]))) { 
        return; 
    }

    myState.snake.dir.x = myState.inputBuffer[0].x;
    myState.snake.dir.y = myState.inputBuffer[0].y;

    myState.inputBuffer.shift()
}

function updateCanvas(myState) {
    drawBoard(myState);
    myState.frameNum += 1;

    if(myState.snake.isImmune) {
        if(myState.snake.immunityTicks(myState) < 5) {
            myState.snake.color == "main" ? myState.snake.color = "immune" : myState.snake.color = "main";
        }
    } else {
        myState.snake.color = "main";
    }
    drawSnake(myState);
    myState.food.forEach((fruit) => {
        let magn = (myState.frameNum % 4 < 2) ? 0.85 : 1;
        drawFruit(myState, fruit.id, fruit.x, fruit.y, magn);
    });

}

function getDeathCause(myState) { // check death according to current pos and dir
    let causeOfDeath = undefined;
    let [next_x, next_y] = myState.snake.nextPos(myState);
    if(next_x >=myState.nColumns || next_x <0 || next_y>=myState.nRows || next_y<0) { 
        causeOfDeath = "WALL"; 
    } else {
        let cells = myState.grid[next_x][next_y];
        console.log(cells);

        if(cells.length!=0 && (cells[cells.length-1].type == "snake_body" || (!myState.snake.tailChanged && cells[0].type == "snake_tail"))) { 
            causeOfDeath = "SELF"; 
        }
    }
    console.log(causeOfDeath);
    return causeOfDeath;
}

function executeFuneral(myState, cause) { // perform actions reqd after game end
    myState.isPaused = true; //???
    myState.deathTime = performance.now();

    let st = myState.startTimeUNIX;
    myState.snake.timeAlive = myState.deathTime - myState.startTime;

    let pad = (n) => String(n).padStart(2, '0');
    let formattedStartTime = `[${st.getFullYear()}-${pad(st.getMonth()+1)}-${pad(st.getDate())} ${pad(st.getHours())}:${pad(st.getMinutes())}:${pad(st.getSeconds())}]`;

    let successfullyAdded = user.addRecord({"startTime": formattedStartTime, "score": myState.score, "cause": cause, "timeAlive": myState.snake.timeAlive});
    if(successfullyAdded) {
        user.saveLatestRecord();
    }

    document.getElementById("death-score").innerText = myState.score;
    document.getElementById("death-cause").innerHTML = `Death by: ${cause}`;
    document.getElementById("death-high-score").innerHTML = user.highScore;
    document.getElementById("death-time-alive").innerHTML = myState.snake.timeAlive;

    document.getElementById("start-high-score").innerHTML = user.highScore;

    let endModal = new bootstrap.Modal(document.getElementById("endModal"));
    endModal.show();

    myState.destroy();  //TODO maybe add a proper reset function
}

function updateState(myState) {
    updateDir(myState);

    let [next_x, next_y] = myState.snake.nextPos(myState);
    myState.snake.growthBuffer += consumeFruitAt(myState, next_x, next_y);

    myState.snake.tailChanged = myState.snake.growthBuffer <= 0;

    if(!myState.snake.isImmune) {
        let cause = getDeathCause(myState);
        if(cause) {
            executeFuneral(myState, cause);
            //TODO: add relevant death animations!!!
            return;
        }
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

function loadContent() {
    loadImages(images).then(results => {
        results.forEach(({ src, img }) => {
            image_elems[src] = img;
        });
        
    });    
}

function isNameValid(username) {
    let msg = "";
    if(username.includes(",")) { msg = "Username can not contain commas."; }
    if(username.length < 3 || username.length > 15) { msg = "Username should have atleast 3 and atmost 15 characters."; }
    return msg;
}

function validateUsername(username) {
    let errorMsg = isNameValid(username);
    if(errorMsg != "") {
        let el = document.getElementById("usernameError");
        el.innerHTML = errorMsg;
        el.style.display = "block";
       return false;
    }
    document.getElementById("usernameError").classList.toggle("hidden");
    return true;
}

function start() {
    let username = document.getElementById("username").value;
    graphicsMode = document.getElementById("mode").value;
    if(!validateUsername(username)) {
        return;
    }
    user.username = username;
    let startModal=bootstrap.Modal.getInstance(document.getElementById("startModal"));
    startModal.hide();
    if(isFirst) {
        Array.from(document.getElementsByClassName("retry")).forEach(el => { el.classList.toggle("hidden"); });
        Array.from(document.getElementsByClassName("start")).forEach(el => { el.classList.toggle("hidden"); });
        
        document.getElementById("mainBody").classList.toggle("hidden");

        isFirst = false;
    }
    initGameState();
}

function initGameState() {
    myState = new GameState();
    myState.grid[2][1].push(new Cell("snake_head", myState.snake.head));
    myState.grid[1][1].push(new Cell("snake_tail", myState.snake.tail));
    setupInput(myState);
    initGame(myState);
}

function setupInput(myState) {
    myState.inputHandlerFunction = (event) => { inputHandler(event, myState); }
    document.addEventListener("keydown", myState.inputHandlerFunction);
}

function inputHandler(event, myState) { // event listeners for keydowns, stores the dir vector in move
    const keys = {
        ArrowUp: {x: 0, y: -1},
        ArrowDown: {x: 0, y: 1},
        ArrowRight: {x: 1, y: 0},
        ArrowLeft: {x: -1, y: 0},

        W: {x: 0, y: -1},
        A: {x: -1, y: 0},
        S: {x: 0, y: 1},
        D: {x: 1, y: 0},

        w: {x: 0, y: -1},
        a: {x: -1, y: 0},
        s: {x: 0, y: 1},
        d: {x: 1, y: 0}
    }

    let input = keys[event.key]
    if(myState.inputBuffer.length != myState.inputBufferSize) {
        myState.inputBuffer.push(input);
        let len = myState.inputBuffer.length;
        if(len >= 2) {
            if(checkOpposite(input, myState.inputBuffer[len-2]) || getDirString(input.x, input.y) == getDirString(myState.inputBuffer[len-2].x, myState.inputBuffer[len-2].y)) {
                myState.inputBuffer.pop();
            }
        } else {
            if(checkOpposite(input, myState.snake.dir) || getDirString(input.x, input.y) == getDirString(myState.snake.dir.x, myState.snake.dir.y)) {
                myState.inputBuffer.pop();
            }
        }
    }
    if(input) {
        if(myState.isPaused == true && myState.isFinished == false) {
            if(input.x == 1 && input.y == 0) {
                myState.inputBuffer.push(input);
            }
            if(!(input.x == -1 && input.y == 0)){
                myState.isPaused = false;
                startGameLoop(myState);
            }
        }
    }
        
    // if(event.key=="p") { //TODO: furnish this
    //     pauseGame();
    // }
}

function checkOpposite(dir1, dir2) {
    return getDirString(dir1.x, dir1.y) == getDirString(-dir2.x, -dir2.y);
}

function startGameLoop(myState) {
    if(myState.isPaused) { return; }
    myState.startTimeUNIX = new Date();
    myState.startTime = performance.now();
    gameLoop(myState);
}

function consumeFruitAt(myState, x, y) {
    if(x>=myState.nColumns || x<0 || y>=myState.nRows || y<0) {
        console.error("Index out of bounds"); 
        return 0; 
    } //TODO: add similar exhaustive checks at all places
    if(myState.grid[x][y].length != 0 && myState.grid[x][y][0].type == "fruit") { //since only one fruit can be present if there is anything
        let fruit=myState.grid[x][y][0].entity;
        fruit.onEat(fruit, myState);
        deleteFruit(myState, x, y);
        spawnFruit(myState);
        return fruit.score;
    } else {
        return 0;
    }
}

function deleteFruit(myState, x, y) {
    myState.grid[x][y] = [];
    const idx = myState.food.findIndex(f => f.x === x && f.y === y )
    if (idx !== -1) {
        myState.food.splice(idx, 1)
    }
}

function updateHead(myState){ // updates the sprite of new head and the next element according to direction of motion
    let [next_x, next_y] = myState.snake.nextPos(myState);

    myState.snake.body.unshift({x: next_x, y: next_y, sprite:`head_${getDirString(myState.snake.dir.x, myState.snake.dir.y)}.png`}) // add new head to snake[]

    myState.grid[next_x][next_y].push(new Cell("snake_head", myState.snake.head));
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
            let cellsAtPrevHead = myState.grid[myState.snake.body[1].x][myState.snake.body[1].y];
            cellsAtPrevHead[cellsAtPrevHead.length-1] = new Cell("snake_body", myState.snake.body[1]);
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
    
    let cellsAtNewTail = myState.grid[myState.snake.body[myState.snake.length-2].x][myState.snake.body[myState.snake.length-2].y];
    cellsAtNewTail[0] = new Cell("snake_tail", myState.snake.body[myState.snake.length-2]);
    
    let cellsAtPrevTail = myState.grid[myState.snake.tail.x][myState.snake.tail.y];
    cellsAtPrevTail.shift();

    myState.snake.prevTail = myState.snake.tail;

    myState.snake.body.pop(); //delete the old tail
}

function playSound(basePath) {
    let sfxPath = `../static/sounds/${graphicsMode}/${basePath}.mp3`;
    const sfx = new Audio(sfxPath);
    sfx.play();
}

function ateCarrots(fruit, myState) {
    let nCarrots = fruit.score;
    playSound("ateCarrot");
}
function ateGoldenApple(fruit, myState) {
    myState.snake.immunityTime += IMMUNITY_TICKS * myState.tickRate;
    myState.snake.immunityStartTime = performance.now();
    myState.snake.color = "immune";
    playSound("immuneOn");
}

function resetUI(myState) {
    document.getElementById("scoreDisplayer").innerHTML = "Score: 2";
    document.getElementById("timeDisplayer").innerHTML = "Time: 0.000s";
    document.getElementById("immunityTimeDisplayer").innerHTML = "Immunity Time: 0.0s";
}

function initGame(myState) {
    drawBoard(myState);
    spawnFruit(myState);
    updateCanvas(myState);
    resetUI(myState);
    startGameLoop(myState); //TODO: change later
}

function gameLoop(myState, lastStateUpdate = 0, lastCanvasUpdate = 0) {
    if(myState.isPaused) { return; }

    let curTime = performance.now();
    if(curTime - lastStateUpdate > myState.tickRate) {
        updateState(myState);
        lastStateUpdate = curTime;
    }

    if(curTime - lastCanvasUpdate > myState.graphicsRefreshRate) {
        updateCanvas(myState);
        lastCanvasUpdate = curTime;
    }

    myState.snake.timeAlive = curTime - myState.startTime;  /////TODO: ~~~~!!!!!!!!!!!! change the logic to do floor to the refresh rate otherwise unfair leaderboard !!!!!!!!!!!!!!!!!!!!~~~~~
    if(myState.snake.isImmune) {
        myState.snake.immunityTime = IMMUNITY_TICKS * myState.tickRate - (curTime - myState.snake.immunityStartTime);
        myState.snake.immunityTime = Math.max(0, myState.snake.immunityTime);
    }

    updateUI(myState);

    window.requestAnimationFrame(() => gameLoop(myState, lastStateUpdate, lastCanvasUpdate));
}

function updateUI(myState) {
    document.getElementById("scoreDisplayer").innerHTML = `Score: ${myState.score}`;
    document.getElementById("timeDisplayer").innerHTML = `Time: ${(myState.snake.timeAlive/1000).toFixed(3)}s`;
    let formattedImmunityTime = (Math.trunc(myState.snake.immunityTime/100)/10).toFixed(1);
    document.getElementById("immunityTimeDisplayer").innerHTML = `Immunity time: ${formattedImmunityTime}s`;
}

loadContent();

document.getElementById("startbtn").addEventListener("click", start);

// document.getElementById("retryButton").addEventListener("click", (e) => {
//     if(!myState.isFinished) {
//         myState.destroy();
//     }
//     initGameState();
//     updateTimeDisplays(+new Date());
// });