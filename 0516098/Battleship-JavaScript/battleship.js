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
var allyGameBoard = [
				[0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
				[0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
				[1, 0, 0, 0, 0, 0, 1, 1, 1, 1],
				[1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				[1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
				[1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
				[1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
				];

var enemyGameBoard = [
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
				[4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
				];

const states = Object.freeze({
	empty: 0, // ally board
	ship: 1, // ally board
	sunk: 2, // enemy board
	miss: 3, // enemy board
	hidden: 4, // enemy board
});

var state_name = {
	0: 'empty',
	1: 'ship',
	2: 'sunk',
	3: 'miss',
	4: 'hidden',
};

createGameBoard(allyGameBoardContainer, allyGameBoard, 'a');
createGameBoard(enemyGameBoardContainer, enemyGameBoard, 'e');


//
// Step 2: set up connection to IoTTalk
//

var profile = {
	'dm_name': 'Battleship',
	'df_list': ['send', 'recv'],
}

var interval = 500; // data transfer interval

csmRegister(profile, (msg) => {
	console.log(msg);
	document.title = msg.d_name;
	da_parity = parseInt(msg.d_name.substr(0, 2)) % 2;

	if (da_parity == 0) { // odd da first, even wait
		console.log("Even DA, second hand");
		wait();
	} else {
		console.log("Odd DA, first hand");
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
var hitCount = 0;

//1=odd numbered DA's turn, 0=even numbered DA's turn
var turn = 1;
var da_parity;
