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
	send_attack(square.id);
}

// data communication formats:
// Attack:sXY
// Reveal:Z	(Z=state of the square, empty or ship)
// Control:OK
function send_attack(square_id) {
	var row = square_id.substr(1, 1);
	var col = square_id.substr(2, 1);
	// send attack command
	csmPush('send', ['Attack:' + square_id]);
	// check for reveal, resend attack if reveal not received
	csmPull('recv', (data) => {
		console.log('recv', data) ///////
		if (data) {
			if (data.indexOf('Reveal') == 0) {
				//				var new_square_id = 'a' + square_id.substr(1);
				square_state = parseInt(data.substr('Reveal'.length + 1));
				switch (square_state) {
					case states.sunk:
					case states.miss:
						enemyGameBoard[row][col] = square_state;
						var square = $('#' + square_id)[0];
						console.log(state_name[square_state]) ////////////////
						square.className = state_name[square_state];
						hitCount++;
						if (hitCount == 17) {
							alert('All enemy battleships have been defeated! You win!');
						}
						setTimeout(() => csmPush('send', 'Control:OK'), interval);
						setTimeout(() => csmPush('send', 'Control:OK'), interval * 2);
						setTimeout(() => csmPush('send', 'Control:OK'), interval * 3);
						wait();
						break;
					default:
						console.log(`Invalid data: ${data}, expected state ${states.empty} or ${states.ship}`);
				}
				wait();
			} else {
				console.log(`Invalid data: ${data}, expected Reveal.`);
				setTimeout(send_attack.bind(null, square_id), interval);
			}
		} else {
			setTimeout(send_attack.bind(null, square_id), interval);
		}
	});
}

function wait() {
	console.log('Wait')
	// wait for enemy attack
	csmPull('recv', (data) => {
		if (data) {
			if (data.indexOf('Attack') == 0) {
				// grab square id and change it to ally board square id
				var square_id = data.substr('Attack'.length + 1);
				var new_square_id = 'a' + square_id.substr(1);
				console.log(data, "was hit");
				console.log('Your turn!');
				var row = square_id.substr(1, 1);
				var col = square_id.substr(2, 1);
				switch (allyGameBoard[row][col]) {
					case states.empty:
						allyGameBoard[row][col] = states.miss;
						$('#' + new_square_id)[0].className = 'miss';
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					case states.ship:
						allyGameBoard[row][col] = states.sunk;
						$('#' + new_square_id)[0].className = 'sunk';
						enemyGameBoardContainer.addEventListener('click', fireTorpedo);
						break;
					default: // do not reach here
						console.log(`Invalid state: ${allyGameBoard[row][col]}, expected ${states.empty} or ${states.ship}.`);
				}
				csmPush('send', 'Reveal:' + allyGameBoard[row][col]);
				csmPull('recv', function resendReveal(data) {
					if (data) {
						if (data.indexOf('Control:OK') == 0) {
							console.log('OK received, stop sending reveal');
						} else {
							console.log(`Invalid data: ${data}, expected Control:OK.`);
							csmPush('send', 'Reveal:' + allyGameBoard[row][col]);
							setTimeout(() => csmPull('recv', resendReveal), interval);
						}
					} else {
						csmPush('send', 'Reveal:' + allyGameBoard[row][col]);
						setTimeout(() => csmPull('recv', resendReveal), interval);
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
