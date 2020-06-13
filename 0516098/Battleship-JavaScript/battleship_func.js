function createGameBoard(gameBoardContainer, gameBoard, prefix) {
	if (prefix.length != 1) {
		console.log('Game board prefix must be exactly one char long');
		return;
	}

	gameBoardContainer.style.width = cols * squareSize + 'vmin';
	gameBoardContainer.style.height = rows * squareSize + 'vmin';
	$('.empty-space').css('height', rows * squareSize / 2 + 'vmin');
	for (i = 0; i < rows; i++) {
		for (j = 0; j < cols; j++) {
			var square = document.createElement('div');
			// matrix coordinates
			square.id = prefix + i + j;

			square.classList.add(state_name[gameBoard[i][j]]);
			square.style.top = i * squareSize + 'vmin';
			square.style.left = j * squareSize + 'vmin';
			square.style.height = squareSize + 'vmin';
			square.style.width = squareSize + 'vmin';
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
			console.log('Enemy revealed ', JSON.stringify(square_hit));
			switch (square_hit.state) {
				case states.sunk:
					++allyHitCount;
				case states.miss:
					enemyGameBoard[row][col] = square_hit.state;
					var square = $('#e' + square_hit.row + square_hit.col)[0];
					square.className = state_name[square_hit.state];

					if (allyHitCount >= totalShipCount) {
						game_over(true);
						return;
					}

					setTimeout(() => {
						$('#turn-indicator')[0].innerText = "Enemy's turn";
						$('#turn-indicator')[0].style.color = $('#enemy-gameboard-text').css('color');
					}, animationTime);
					// wait for transition animation, then go to enemy gameboard
					setTimeout(() => scroll_to('ally'), animationTime);
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
			setTimeout(() => {
				$('#turn-indicator')[0].innerText = 'Your turn';
				$('#turn-indicator')[0].style.color = $('#ally-gameboard-text').css('color');
			}, animationTime);
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
						// let enemy know the game is over before alerting
						csmPush('sendReveal', {
							row: row,
							col: col,
							state: allyGameBoard[row][col],
						});
						game_over(false);
					}

					break;
				default:
					console.log(`Invalid state: allyGameBoard[${row}][${col}]=${allyGameBoard[row][col]}, expected ${states.empty} or ${states.ship}.`);
			}
			// wait for transition animation, then go to enemy gameboard
			if (!isGameOver()) {
				setTimeout(() => scroll_to('enemy'), 1000);
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
		duration: animationTime,
	})
}

// will continue spamming server with AJAX requests, so close the game when it ends!
function game_over(result, revealObj) {
	$('#enemy-gameboard')[0].removeEventListener('click', fireTorpedo);
	var indicator = $('#turn-indicator')[0];
	var display_msg, alert_msg;

	if (result == true) {
		display_msg = 'Game Over. You Win!';
		alert_msg = 'All enemy battleships have been defeated! You win!';
	} else {
		scroll_to('ally');
		display_msg = 'Game Over. You Lose.';
		alert_msg = 'All ally battleships have been defeated! You lose.';
	}

	setTimeout(() => {
		indicator.style.color = 'black';
		indicator.innerText = display_msg;
		setTimeout(() => alert(alert_msg), 50);
	}, animationTime);
}

//function isEmpty(obj) {
//	return Object.keys(obj).length == 0;
//}

function isGameOver() {
	return (allyHitCount >= totalShipCount) || (enemyHitCount >= totalShipCount);
}

// is the player using a smartphone?
function isSmartphone() {
	return $(window).height() > $(window).width();
}

// this function is called before states is defined, so use 0 and 1 instead
function generateGameboard(ships) {
	var gameboard = Array(rows).fill().map(_ => Array(cols).fill(0));
	ships.sort((a, b) => b - a); // sort in descending order to make sorting easier

	for (let len of ships) {
		let start, dir, end, safe = false,
			attempts = 0,
			threshold = 100;
		while (!safe) {
			end = [-1, -1];
			// find a tentative ship placement within the gameboard
			while (!(end[0] >= 0 && end[0] < rows && end[1] >= 0 && end[1] < cols)) {
				// where the ship starts
				start = [
					Math.floor(Math.random() * rows), // integers in [0,rows]
			 		Math.floor(Math.random() * cols), // integers in [0,cols]
				];
				// direction of ship growth, in matrix coordinates
				dir = ([[1, 0], [0, 1], [-1, 0], [0, -1]])[Math.floor(Math.random() * 4)];
				// where the ship ends
				end[0] = start[0] + (len - 1) * dir[0];
				end[1] = start[1] + (len - 1) * dir[1];
			}
			// check if all squares between start and end points are empty
			safe = true;
			for (let i = 0; i < len; ++i) {
				let row = start[0] + i * dir[0];
				let col = start[1] + i * dir[1];
				if (gameboard[row][col] != 0) {
					safe = false;
					++attempts;
					// if there is no way to generate a valid gameboard in the current situation, start anew
					if (attempts > threshold) {
						console.log('fail, renew gameboard')
						return generateGameboard();
					}
					break;
				}
			}
			//			if (!safe) {
			//				console.log('fail');
			//				console.log(gameboard);
			//				console.log(start, end);
			//			}
		}
		// once all involved squares are clear, add this ship to gameboard
		for (let i = 0; i < len; ++i) {
			let row = start[0] + i * dir[0];
			let col = start[1] + i * dir[1];
			gameboard[row][col] = 1;
		}
		//		console.log('success')
		//		console.log(gameboard)
	}

	return gameboard;
}
