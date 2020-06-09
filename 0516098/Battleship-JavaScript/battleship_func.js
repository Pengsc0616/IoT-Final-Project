function createGameBoard(gameBoardContainer, gameBoard) {
	for (i = 0; i < rows; i++) {
		for (j = 0; j < cols; j++) {
			var square = document.createElement("div");
			// matrix coordinates
			square.id = 's' + i + j;

			square.classList.add(state_name[gameBoard[i][j]]);
			square.style.top = i * squareSize + 'px';
			square.style.left = j * squareSize + 'px';
			gameBoardContainer.appendChild(square);
		}
	}
}

function fireTorpedo() {
	var square = event.target;
	var row = square.id.substring(1, 2);
	var col = square.id.substring(2, 3);

	if (enemyGameBoard[row][col] != 4) {
		alert("Stop wasting your torpedos! You already fired at this location.");
		return;
	}

	square.classList.add('fetching');
	send_attack(square.id);
}

// data communication formats:
// Attack:sXY
// Reveal:Z	(Z=state of the square, empty or ship)
// Control:OK
function send_attack(square_id) {
	console.log("Send attack");
	csmPush('send', ['Attack:' + square_id]);
	csmPull('recv', (data) => {
		if (data) {
			if (data.indexOf('Reveal') == 0) {
				square_state = parseInt(data.substr('Reveal'.length + 1));
				switch (square_state) {
					case states.empty:
						enemyGameBoard[row][col] = states.miss;
						$('#' + square_id).removeClass('fetching');
						$('#' + square_id).classList.add('miss');
						csmPush('send', 'Control:OK');
						break;
					case states.ship:
						enemyGameBoard[row][col] = states.sunk;
						$('#' + square_id).removeClass('fetching');
						$('#' + square_id).classList.add('sunk');
						hitCount++;
						if (hitCount == 17) {
							alert("All enemy battleships have been defeated! You win!");
						}
						csmPush('send', 'Control:OK');
						break;
					default:
						console.log('Received invalid data:', data);
				}
				wait();
			} else {
				setTimeout(send_attack.bind(null, square_id), interval);
			}
		}
	});
}

function wait() {
	console.log("Wait")
	enemyGameBoardContainer.removeEventListener('click', fireTorpedo);
	csmPull('recv', (data) => {
		if (data) {
			if (data.indexOf('Attack') == 0) {
				var square_id = data.substr('Attack'.length + 1);
				console.log(data, "was hit");
				console.log('Your turn!');
				let row, col, target, square;
			[row, col] = [data.substr(1, 1), data.substr(2, 1)];
				switch (enemyGameBoard[row][col]) {
					case states.empty:
						enemyGameBoard[row][col] = states.miss;
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					case states.ship:
						enemyGameBoard[row][col] = states.sunk;
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					default:
						console.log("Invalid move:", data);
				}
				csmPush('send', 'Reveal:' + allyGameBoard[row][col]);
			}
		} else {
			setTimeout(wait, interval);
		}
	});
}
