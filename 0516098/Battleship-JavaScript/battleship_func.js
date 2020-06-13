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

	var state = enemyGameBoard[row][col];
	if (state == states.miss || state == states.sunk) {
		alert('Stop wasting your torpedos! You already fired at this location.');
		return;
	}

	ttt = Date.now(); // for debugging

	square.className = 'fetching';
	enemyGameBoardContainer.removeEventListener('click', fireTorpedo);
	send_attack(square.id[1], square.id[2]);
}

// fturn = frozen turn, stop looping if fturn too old
function send_attack(row, col, fturn = turn) {
	csmPush('sendAttack', {
		row: row,
		col: col,
	});

	if (Date.now() - ttt > interval * 10) {
		console.log('sendAttack triggered debugger');
		debugger;
		ttt = Date.now();
	} // debug if game stuck

	csmPull('recvReveal', (data) => {
		if (data) {
			// handle outdated data
			if (data.row != row || data.col != col) {
				console.log(`Revealed wrong coordinates: ${data.row}${data.col}\nExpected: ${row}${col}`);
				if (turn > fturn + 2) return;
				setTimeout(send_attack.bind(null, row, col, fturn), interval);
				return;
			} else if (turn > fturn + 2) return;

			++turn;
			var square_hit = data;
			console.log('Hit ', JSON.stringify(square_hit));
			switch (square_hit.state) {
				case states.sunk:
					enemyGameBoard[row][col] = square_hit.state;
					var square = $('#e' + square_hit.row + square_hit.col)[0];
					square.className = state_name[square_hit.state];

					allyHitCount++;
					if (allyHitCount >= totalShipCount) {
						alert('All enemy battleships have been defeated! You win!');
						game_over(true);
						return;
					}

					$('#turn-indicator')[0].innerText = "Enemy's turn";
					$('#turn-indicator')[0].style.color = 'red';

					scroll_to('ally');

					wait();
					break;
				case states.miss:
					enemyGameBoard[row][col] = square_hit.state;
					var square = $('#e' + square_hit.row + square_hit.col)[0];
					square.className = state_name[square_hit.state];

					$('#turn-indicator')[0].innerText = "Enemy's turn";
					$('#turn-indicator')[0].style.color = 'red';
					scroll_to('ally');

					wait();
					break;
				default:
					console.log(`Invalid data: ${data}, expected state ${states.empty} or ${states.ship}`);
			}
		} else {
			if (turn > fturn + 2) return;
			setTimeout(send_attack.bind(null, row, col, fturn), interval);
		}
	});
}

function wait(fturn = turn) {
	ttt = Date.now(); // for debugging

	csmPull('recvAttack', (data) => {
		if (data) {
			// handle outdated data
			var state = allyGameBoard[data.row][data.col];
			if (state == states.sunk || state == states.miss) {
				console.log(`Received wrong attack coordinates: ${data.row}${data.col}\nState: ${state}`);
				if (turn > fturn + 2) return;
				setTimeout(wait, interval);
				return;
			} else if (turn > fturn + 2) return;

			++turn;
			console.log('a' + data.row + data.col + ' was hit');
			console.log('Your turn!');
			$('#turn-indicator')[0].innerText = 'Your turn';
			$('#turn-indicator')[0].style.color = 'green';
			scroll_to('enemy');

			var row = data.row;
			var col = data.col;
			switch (allyGameBoard[row][col]) {
				case states.empty:
					allyGameBoard[row][col] = states.miss;
					$('#a' + row + col)[0].className = 'miss';
					enemyGameBoardContainer.addEventListener('click', fireTorpedo);
					break;
				case states.ship:
					allyGameBoard[row][col] = states.sunk;
					$('#a' + row + col)[0].className = 'sunk';
					enemyGameBoardContainer.addEventListener('click', fireTorpedo);
					enemyHitCount++;
					if (enemyHitCount >= totalShipCount) {
						alert('All ally battleships have been defeated! You lose.');
						game_over(false);
					}
					break;
				default:
					console.log(`Invalid state: allyGameBoard[${row}][${col}]=${allyGameBoard[row][col]}, expected ${states.empty} or ${states.ship}.`);
			}

			// resend until enemy receives it
			(function resendReveal() {
				if (Date.now() - ttt > interval * 10) {
					console.log('resendReveal triggered debugger');
					debugger;
					ttt = Date.now();
				} // debug if game stuck
				if (turn > fturn + 2) return;
				csmPush('sendReveal', {
					row: row,
					col: col,
					state: allyGameBoard[row][col],
				});
				setTimeout(resendReveal, interval);
			})();

		} else {
			if (turn > fturn + 2) return;
			setTimeout(wait, interval);
		}
	});
}

// scroll to gameboard
// side = {'ally','enemy'}
function scroll_to(side) {
	var board = $(`#${side}-gameboard`);
	var offset = board.offset().top - ($(window).height() / 2 - board.height() / 2);
	$('html,body').animate({
		scrollTop: offset,
	}, {
		duration: 1000,
	})
}

// will continue spamming server with AJAX requests, so close the game when it ends!
function game_over(result) {
	$('#enemy-gameboard')[0].removeEventListener('click', fireTorpedo);
	var indicator = $('#turn-indicator')[0];
	indicator.style.color = 'black';

	if (result == true) {
		indicator.innerText = 'Game Over. You Win!';
	} else {
		indicator.innerText = 'Game Over. You Lose.';
	}
}

//function isEmpty(obj) {
//	return Object.keys(obj).length == 0;
//}
