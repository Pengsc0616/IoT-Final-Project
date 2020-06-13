// Parameters
var params = {
	rows: 10,
	cols: 10,
	squareSize: 8, // size of each square, unit: vmin
	allyGameBoard: [
				[0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				],
	interval: 1500, // delay between each identical ajax request
}

// make parameters global variables
for (let p in params) {
	window[p] = params[p];
}


//
// Step 1: Initialize gameboard and global variables
//

var allyHitCount = 0; // how many successful shots have I landed?
var enemyHitCount = 0; // how many successful shots has the enemy landed?
var turn = 1; // total number of turns elapsed, odd=odd DA's turn, even=even DA's turn
var ttt = Date.now(); // for debugging

const states = Object.freeze({
	empty: 0, // ally board
	ship: 1, // ally board
	sunk: 2, // ally/enemy board, after hit
	miss: 3, // ally/enemy board, after hit
	unknown: 4, // enemy board, before reveal
});

var state_name = {
	0: 'empty',
	1: 'ship',
	2: 'sunk',
	3: 'miss',
	4: 'unknown',
};

var allyGameBoardContainer = document.getElementById("ally-gameboard");
var enemyGameBoardContainer = document.getElementById("enemy-gameboard");

var enemyGameBoard = Array(10).fill().map(_ => Array(10).fill(states.unknown));

// total number of squares to hit for victory
var totalShipCount = allyGameBoard.reduce((boardSum, row) => boardSum + row.reduce((rowSum, state) => rowSum + (state == states.ship), 0), 0);

// if on computer, scale down so everything can fit on screen
if (squareSize > 7 && !isSmartphone()) {
	squareSize = 7;
}

createGameBoard(allyGameBoardContainer, allyGameBoard, 'a');
createGameBoard(enemyGameBoardContainer, enemyGameBoard, 'e');


//
// Step 2: set up connection to IoTTalk
//

var profile = {
	'dm_name': 'Battleship',
	'df_list': ['sendAttack', 'recvAttack', 'sendReveal', 'recvReveal'],
}

//var interval = 1500; // data transfer interval

csmRegister(profile, (msg) => {
	console.log(JSON.stringify(msg));
	document.title = msg.d_name;
	setTimeout(() => $('b:first')[0].innerHTML += msg.d_name, 750);
	if (isSmartphone()) {
		alert('Welcome, your d_name is:\n\n' + msg.d_name);
	}

	// calculate position for turn indicator
	var text = $(`#ally-gameboard-text`);
	var board = $(`#ally-gameboard`);

	// place text symmetric to gameboard text
	var offset = ($(window).height() / 2 - board.height() / 2) - (text.height() + 2 * parseInt(text.css('marginTop')));

	// place text center aligned vertically at the bottom
	//	var offset = ($(window).height() / 2 - board.height() / 2) / 2 - (parseInt(text.css('marginBottom')) + text.height() / 2);

	$('#turn-indicator').css('bottom', offset);
	$('#turn-indicator').css('width', $(window).width() - 2 * parseInt($(document.body).css('marginLeft')) + 'px');

	var da_parity = msg.d_name.substr(0, 2);
	if (da_parity == 0) { // odd da first, even wait
		console.log("Even DA, second hand");
		$('#turn-indicator')[0].innerText = "Enemy's turn";
		$('#turn-indicator')[0].style.color = 'red';
		scroll_to('ally');
		wait();
	} else {
		console.log("Odd DA, first hand");
		$('#turn-indicator')[0].innerText = "Your turn";
		$('#turn-indicator')[0].style.color = 'blue';
		scroll_to('enemy');
		enemyGameBoardContainer.addEventListener("click", fireTorpedo);
	}
});
