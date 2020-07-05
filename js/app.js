/*==JS VERSION 1==*/
var id = 'sp-';
var endPoint = 'https://5.iottalk.tw/';
var timestamp = {};
var msg = {};
var passwd = undefined;
var errCounter = 0;

const csmRegister = function (pf, callback) {
	id += btoa(Math.random()).substring(1, 10);
	if (pf.is_sim == undefined) {
		pf.is_sim = false;
	}
	if (pf.d_name == undefined) {
		// pf.d_name = (Math.floor(Math.random() * 99)).toString() + '.' + pf.dm_name ;
		pf.d_name = undefined;
	}
	$.ajax({
		url: endPoint + id,
		type: 'POST',
		data: JSON.stringify({
			profile: pf
		}),
		//dataType: 'json',
		contentType: 'application/json',
		success: function (msg) {
			document.title = pf.d_name;
			window.onunload = csmDelete;
			window.onbeforeunload = csmDelete;
			window.onclose = csmDelete;
			window.onpagehide = csmDelete;
			console.log('Registered as ' + id)
			callback(msg);
		},
		error: function (a, b, c) {
			alert('register fail');
		}
	}).done(function (result) {
		passwd = result.password;
		csmPush('__Ctl_I__', ['SET_DF_STATUS_RSP', {
			'cmd_params': []
		}])
	});
};


const csmPull = function (df, handler) {
	var preHandler = function (data) {
		let value = null;
		if (!timestamp[df]) {
			timestamp[df] = '';
		}
		if ((data.samples.length > 0) && data.samples[0][0] != timestamp[df]) {
			timestamp[df] = data.samples[0][0];
			if (data.samples[0][1].length == 1) {
				value = data.samples[0][1][0];
			} else {
				value = data.samples[0][1];
			}
		}
		console.log(`Pull: ${df} ${JSON.stringify(value)}`);
		handler(value);
	}
	$.ajax({
			url: endPoint + id + '/' + df,
			type: 'GET',
			headers: {
				'password-key': passwd
			},
			error: function (a, b, c) {
				handler();
			}
		})
		.done(preHandler);
};

const csmPush = function (df, rawData) {
	rawData = Array.isArray(rawData) ? rawData : [rawData];
	jsonData = {
		'data': rawData
	};
	console.log(`Push: ${df} ${JSON.stringify(jsonData)}`);

	$.ajax({
		url: endPoint + id + '/' + df,
		type: 'PUT',
		data: JSON.stringify(jsonData),
		dataType: 'json',
		contentType: 'application/json',
		headers: {
			'password-key': passwd
		},
		error: (jqxhr, status, errthrown) => {},
	}).done(function () {
		console.log("This line will never display");
	})
};

const csmDelete = function () {
	$.ajax({
		url: endPoint + id,
		type: 'DELETE'
	})
};
