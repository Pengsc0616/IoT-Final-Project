// Parameters
var rows = 10;
var cols = 10;
var squareSize = 8; // size of each square, unit= vmin
var ships = [0, 2, 0]; // length of each ship
var interval = 1500; // delay between each identical ajax request; unit: ms
var animationTime = 750; // duration of each animation; unit: ms
var dieTime = 20000; // after game over, stop sending ajax requests after this much time has elapsed; unit: ms
//var allyGameBoard = [
//				[0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				];
var allyGameBoard = generateGameboard(ships);


//
// Step 1: Initialize gameboard and global variables
//

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
	setTimeout(() => $('b:first')[0].innerHTML += msg.d_name, animationTime);
	if (isSmartphone()) {
		alert('Welcome, your d_name is:\n\n' + msg.d_name);
	}

	// calculate position for turn-indicator
	var text = $('#ally-gameboard-text');
	var board = $('#ally-gameboard');

	// place turn-indicator center aligned vertically at the bottom
	$('#turn-indicator').css('bottom', ($(window).height() / 2 - board.height() / 2) / 2 - (parseInt(text.css('marginBottom')) + text.height() / 2));
	$('#turn-indicator').css('width', $(window).width() - 2 * parseInt($(document.body).css('marginLeft')) + 'px');

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
