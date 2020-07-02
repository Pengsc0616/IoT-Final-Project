// Parameters
var rows = 10;
var cols = 10;
var squareSize = 8; // size of each square, unit= vmin
var ships = [2, 3, 3, 4, 5]; // length of each ship
var interval = 1500; // delay between each identical ajax request; unit: ms
var scrollAnimationTime = 1500; // duration of scroll animation; unit: ms
var colorAnimationTime = 750; // duration of color change animation; unit: ms
var dieTime = 20000; // after game over, stop sending ajax requests after this much time has elapsed; unit: ms
var allyGameBoard = generateGameboard(ships);



//
// Step 1: Initialize gameboard and global variables
//

var row_maxlen = String(rows - 1).length; // max length of row
var col_maxlen = String(cols - 1).length; // max length of col
var allyHitCount = 0; // how many successful shots have I landed?
var enemyHitCount = 0; // how many successful shots has the enemy landed?
var turn = 1; // total number of turns elapsed, odd=odd DA's turn, even=even DA's turn
var ttt = Date.now(); // for debugging
var dieTimer; // start timing when game ends to stop ajax requests

const states = Object.freeze({
    empty: 0, // ally board
    ship: 1, // ally board
    sunk: 2, // ally/enemy board, after hit
    miss: 3, // ally/enemy board, after hit
    unknown: 4, // enemy board, before reveal
});

const state_name = {
    0: 'empty',
    1: 'ship',
    2: 'sunk',
    3: 'miss',
    4: 'unknown',
};

const allyGameBoardContainer = document.getElementById("ally-gameboard");
const enemyGameBoardContainer = document.getElementById("enemy-gameboard");

var enemyGameBoard = Array(rows).fill().map(_ => Array(cols).fill(states.unknown));

// total number of squares to hit for victory
const totalShipCount = allyGameBoard.reduce((boardSum, row) => boardSum + row.reduce((rowSum, state) => rowSum + (state == states.ship), 0), 0);

// if on computer, scale down so everything can fit on screen
if (squareSize > 7 && !isSmartphone()) {
    squareSize = 7;
}

createGameBoard(allyGameBoardContainer, allyGameBoard, 'a');
createGameBoard(enemyGameBoardContainer, enemyGameBoard, 'e');



//
// Step 2: set up connection to IoTTalk and some other stuff
//

var profile = {
    'dm_name': 'Battleship',
    'df_list': ['sendAttack', 'recvAttack', 'sendReveal', 'recvReveal'],
}

csmRegister(profile, (msg) => {
    console.log(JSON.stringify(msg));
    document.title = msg.d_name;
    $('b')[1].innerHTML = msg.d_name;
    if (isSmartphone()) {
        alert('Welcome, your d_name is:\n\n' + msg.d_name);
    }

    reposition_indicator();

    var da_parity = parseInt(msg.d_name);
    if (da_parity % 2 == 0) {
        console.log("Even DA, second hand");
        $('#turn-indicator')[0].innerText = "Enemy's turn";
        $('#turn-indicator')[0].style.color = $('#enemy-gameboard-text').css('color');
        scroll_to('ally');
        wait();
    } else {
        console.log("Odd DA, first hand");
        $('#turn-indicator')[0].innerText = "Your turn";
        $('#turn-indicator')[0].style.color = $('#ally-gameboard-text').css('color');
        scroll_to('enemy');
        enemyGameBoardContainer.addEventListener("click", fireTorpedo);
    }
});



//
// Step 3: Do some stuff before the game starts
//

// adjust turn indicator position when window is resized
window.addEventListener('resize', reposition_indicator);

$('.gameboard div').css('-webkit-transition', `all ${colorAnimationTime}ms linear`);
$('.gameboard div').css('-moz-transition', `all ${colorAnimationTime}ms linear`);
$('.gameboard div').css('-o-transition', `all ${colorAnimationTime}ms linear`);
$('.gameboard div').css('transition', `all ${colorAnimationTime}ms linear`);

$('b')[0].innerText = endPoint;
