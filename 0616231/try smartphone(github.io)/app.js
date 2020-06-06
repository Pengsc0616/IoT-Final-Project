/*==JS VERSION 1==*/
var id = 'sp-';
//var endPoint = window.location.origin + '/';
var endPoint = "https://5.iottalk.tw/"    //change here
//var endPoint = "https://5.iottalk.tw/da/Smartphone/"
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
        data: JSON.stringify({ profile: pf }),
        //dataType: 'json',
        contentType: 'application/json',
        success: function (msg) {
            document.title = pf.d_name;
            window.onunload = csmDelete;
            window.onbeforeunload = csmDelete;
            window.onclose = csmDelete;
            window.onpagehide = csmDelete;
            callback(msg);
        },
        error: function (a, b, c) {
            alert('register fail');
        }
    }).done(function (result) {
        passwd = result.password;
        csmPush('__Ctl_I__', ['SET_DF_STATUS_RSP', { 'cmd_params': [] }])
    });
};


const csmPush = function (df, rawData) {
    jsonData = { 'data': rawData };
    $.ajax({
        url: endPoint + id + '/' + df,
        type: 'PUT',
        data: JSON.stringify(jsonData),
        dataType: 'json',
        contentType: 'application/json',
        headers: { 'password-key': passwd },
    })
};

const csmDelete = function () {
    $.ajax({
        url: endPoint + id,
        type: 'DELETE'
    })
};


