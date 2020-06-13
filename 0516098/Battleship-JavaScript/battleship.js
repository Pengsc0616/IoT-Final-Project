//
// Step 1: Set up gameboard
//

// set grid rows and columns and the size of each square
var rows = 10;
var cols = 10;
var squareSize = 50;
// get the container element
var allyGameBoardContainer = document.getElementById("ally-gameboard");
var enemyGameBoardContainer = document.getElementById("enemy-gameboard");

/* create the 2d array that will contain the status of each square on the board
   and place ships on the board (later, create function for random placement!)

   0 = empty, 1 = part of a ship, 2 = a sunken part of a ship, 3 = a missed shot
*/
//var allyGameBoard = [
//				[0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
//				[0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
//				[1, 0, 0, 0, 0, 0, 1, 1, 1, 1],
//				[1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				[1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
//				[1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
//				[1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//				];


//var enemyGameBoard = [
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
//				];

const states = Object.freeze({
	empty: 0, // ally board
	ship: 1, // ally board
	sunk: 2, // enemy board
	miss: 3, // enemy board
	unknown: 4, // enemy board
});

var state_name = {
	0: 'empty',
	1: 'ship',
	2: 'sunk',
	3: 'miss',
	4: 'unknown',
};

var allyGameBoard = [
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
				];

var enemyGameBoard = Array(10).fill().map(_ => Array(10).fill(states.unknown));

// total number of squares to hit for victory
var totalShipCount = allyGameBoard.reduce((boardSum, row) => boardSum + row.reduce((rowSum, state) => rowSum + (state == states.ship), 0), 0);

//const stages = Object.freeze({
//	choose: 0, // wait for player to choose a square to attack
//	send: 1, // sending attack, waiting for reveal
//	wait: 2, // reveal received, wait for enemy move
//})

createGameBoard(allyGameBoardContainer, allyGameBoard, 'a');
createGameBoard(enemyGameBoardContainer, enemyGameBoard, 'e');


//
// Step 2: set up connection to IoTTalk
//

var profile = {
	'dm_name': 'Battleship',
	'df_list': ['sendAttack', 'recvAttack', 'sendReveal', 'recvReveal'],
}

var interval = 1500; // data transfer interval

csmRegister(profile, (msg) => {
	console.log(JSON.stringify(msg));
	document.title = msg.d_name;
	da_parity = parseInt(msg.d_name.substr(0, 2)) % 2;

	// calculate position for turn indicator
	var text = $(`#ally-gameboard-text`);
	var board = $(`#ally-gameboard`);

	// place text symmetric to gameboard text
	//	var offset = ($(window).height() / 2 - board.height() / 2) - (text.height() + 2 * parseInt(text.css('marginTop')));

	// place text center aligned vertically at the bottom
	var offset = ($(window).height() / 2 - board.height() / 2) / 2 - (parseInt(text.css('marginBottom')) + text.height() / 2);

	$('#turn-indicator').css('bottom', offset);
	$('#turn-indicator').css('width', $(window).width() - 2 * parseInt($(document.body).css('marginLeft')) + 'px');

	if (da_parity == 0) { // odd da first, even wait
		console.log("Even DA, second hand");
		$('#turn-indicator')[0].innerText = "Enemy's turn";
		$('#turn-indicator')[0].style.color = 'red';
		scroll_to('ally');
		wait();
	} else {
		console.log("Odd DA, first hand");
		$('#turn-indicator')[0].innerText = "Your turn";
		$('#turn-indicator')[0].style.color = 'green';
		scroll_to('enemy');
		enemyGameBoardContainer.addEventListener("click", fireTorpedo);
	}
});

//
// Step 3: game code
//

/* lazy way of tracking when the game is won: just increment hitCount on every hit
   in this version, and according to the official Hasbro rules (http://www.hasbro.com/common/instruct/BattleShip_(2002).PDF)
   there are 17 hits to be made in order to win the game:
      Carrier     - 5 hits
      Battleship  - 4 hits
      Destroyer   - 3 hits
      Submarine   - 3 hits
      Patrol Boat - 2 hits
*/
var allyHitCount = 0;
var enemyHitCount = 0;
var turn = 1; // total number of turns elapsed, odd=odd DA's turn, even=even DA's turn
var ttt = Date.now(); // for debugging
