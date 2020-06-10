function createGameBoard(gameBoardContainer, gameBoard, prefix) {
	if (prefix.length != 1) {
		console.log('Game board must be exactly one char long');
		return;
	}

	for (i = 0; i < rows; i++) {
		for (j = 0; j < cols; j++) {
			var square = document.createElement('div');
			// matrix coordinates
			square.id = prefix + i + j;

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
		alert('Stop wasting your torpedos! You already fired at this location.');
		return;
	}

	square.className = 'fetching';
	enemyGameBoardContainer.removeEventListener('click', fireTorpedo);
	send_attack(square.id.substr(1));
}

// data communication formats:
// Attack:sXY
// Reveal:Z	(Z=state of the square, empty or ship)
function send_attack(square_coord) {
	var row = square_coord.substr(1, 1);
	var col = square_coord.substr(2, 1);
	// send attack command
	csmPush('send', ['Attack:' + square_coord]);
	// check for reveal, resend attack if reveal not received
	csmPull('recv', (data) => {
		if (turn != da_parity) return;
		if (data) {
			if (data.indexOf('Reveal') == 0) {
				turn = !da_parity;
				var square_hit = {
					coord: parseInt(data.substr('Reveal:', 2)),
					state: parseInt(data.substr(-1)),
				};
				console.log('Hit! Coord:', square_hit.coord);
				switch (square_hit.state) {
					case states.sunk:
					case states.miss:
						enemyGameBoard[row][col] = square_hit.state;
						var square = $('#e' + square_coord)[0];
						square.className = state_name[square_hit.state];
						hitCount++;
						if (hitCount == 17) {
							alert('All enemy battleships have been defeated! You win!');
						}
						wait();
						break;
					default:
						console.log(`Invalid data: ${data}, expected state ${states.empty} or ${states.ship}`);
				}
				wait();

			} else {
				console.log(`Invalid data: ${data}, expected Reveal.`);
				setTimeout(send_attack.bind(null, square_coord), interval);
			}
		} else {
			setTimeout(send_attack.bind(null, square_coord), interval);
		}
	});
}

function wait() {
	console.log('Wait')
	// wait for enemy attack
	csmPull('recv', (data) => {
		if (turn == da_parity) return;
		if (data) {
			if (data.indexOf('Attack') == 0) {
				turn = da_parity;
				// grab square id and change it to ally board square id
				var square_coord = data.substr('Attack:'.length);
				console.log(data.substr('Attack:'.length), "was hit");
				console.log('Your turn!');
				var row = square_coord.substr(0, 1);
				var col = square_coord.substr(1, 1);
				switch (allyGameBoard[row][col]) {
					case states.empty:
						allyGameBoard[row][col] = states.miss;
						$('#a' + square_coord)[0].className = 'miss';
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					case states.ship:
						allyGameBoard[row][col] = states.sunk;
						$('#a' + square_coord)[0].className = 'sunk';
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					default: // do not reach here
						console.log(`Invalid state: ${allyGameBoard[row][col]}, expected ${states.empty} or ${states.ship}.`);
				}
				csmPush('send', 'Reveal:' + square_coord + ':' + allyGameBoard[row][col]);
				csmPull('recv', function resendReveal(data) {
					if (turn == da_parity) {
						setTimeout(function () {
							csmPush('send', 'Reveal:' + square_coord + ':' + allyGameBoard[row][col]);
							csmPull('recv', resendReveal);
						}, interval);
					}
				});
			} else {
				console.log(`Invalid data: ${data}, expected Attack.`);
				setTimeout(wait, interval);
			}
		} else {
			setTimeout(wait, interval);
		}
	});
}
