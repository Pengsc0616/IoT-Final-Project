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

	ttt = Date.now(); // for debugging

	square.className = 'fetching';
	enemyGameBoardContainer.removeEventListener('click', fireTorpedo);
	send_attack(square.id[1], square.id[2], turn);
}

// fturn = frozen turn, stop looping if fturn too old
function send_attack(row, col, fturn = turn) {
	csmPush('sendAttack', {
		row: row,
		col: col,
	});
	if (Date.now() - ttt > interval * 10) {
		debugger;
		ttt = Date.now();
	} // debug if game stuck

	csmPull('recvReveal', (data) => {
		if (data) {
			if (data.row != row || data.col != col) {
				console.log(`Revealed wrong coordinates: ${data.row}${data.col}\nExpected: ${row}${col}`);
				if (turn > fturn + 2) return;
				setTimeout(send_attack.bind(null, row, col, fturn), interval);
				return;
			} else if (turn > fturn + 2) return;
			++turn;
			var square_hit = data;
			console.log('Hit! Coordinates:', square_hit.row, square_hit.col);
			switch (square_hit.state) {
				case states.sunk:
				case states.miss:
					enemyGameBoard[row][col] = square_hit.state;
					var square = $('#e' + square_hit.row + square_hit.col)[0];
					square.className = state_name[square_hit.state];
					hitCount++;
					if (hitCount == 17) {
						alert('All enemy battleships have been defeated! You win!');
					}
					$('#turn-indicator')[0].innerText = "Enemy's turn";
					$('#turn-indicator')[0].style.color = 'red';
					$('#ally-gameboard-text')[0].scrollIntoView({
						behavior: 'smooth'
					});

					wait(fturn);
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
			var sqst = allyGameBoard[data.row][data.col]; // square state
			if (sqst == states.sunk || sqst == states.miss) {
				console.log(`Received wrong attack coordinates: ${data.row}${data.col}\nState: ${sqst}`);
				if (turn > fturn + 2) return;
				setTimeout(wait, interval);
				return;
			} else if (turn > fturn + 2) return;
			++turn;
			console.log('a' + data.row + data.col + ' was hit');
			console.log('Your turn!');
			$('#turn-indicator')[0].innerText = 'Your turn';
			$('#turn-indicator')[0].style.color = 'green';
			$('#enemy-gameboard-text')[0].scrollIntoView({
				behavior: 'smooth'
			});

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
					break;
				default:
					console.log(`Invalid state: allyGameBoard[${row}][${col}]=${allyGameBoard[row][col]}, expected ${states.empty} or ${states.ship}.`);
			}

			var objReveal = {
				row: row,
				col: col,
				state: allyGameBoard[row][col],
			};

			(function resendReveal() {
				if (Date.now() - ttt > interval * 10) {
					debugger;
					ttt = Date.now();
				} // debug if game stuck
				if (turn > fturn + 2) return;
				csmPush('sendReveal', objReveal);
				setTimeout(resendReveal, interval);
			})();

		} else {
			if (turn > fturn + 2) return;
			setTimeout(wait, interval);
		}
	});
}

//function isEmpty(obj) {
//	return Object.keys(obj).length == 0;
//}
