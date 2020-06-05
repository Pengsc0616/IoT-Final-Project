/*==JS VERSION 1==*/
var id ='sp-';
//var endPoint = window.location.origin + '/';
var endPoint = "https://5.iottalk.tw/"    //change here
//var endPoint = "https://5.iottalk.tw/da/Smartphone/"
var timestamp = {};
var msg = {};
var passwd = undefined;
var errCounter = 0;

const csmRegister = function(pf, callback) {
    id += btoa(Math.random()).substring(1, 10);
    if (pf.is_sim == undefined){
        pf.is_sim = false;
    }
    if (pf.d_name == undefined){
        // pf.d_name = (Math.floor(Math.random() * 99)).toString() + '.' + pf.dm_name ;
        pf.d_name = undefined; 
    }
    $.ajax({
        url: endPoint + id,
        type: 'POST',
        data: JSON.stringify({profile: pf}),
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
        error: function (a,b,c) {
            alert('register fail');
        }
    }).done(function(result){
        passwd = result.password;
        csmPush ('__Ctl_I__',['SET_DF_STATUS_RSP',{'cmd_params':[]}])
    });
};


const csmPull = function(df, handler) {
  var preHandler = function(data) {
    let value = null;
    if (!timestamp[df]){
      timestamp[df] = '';
    }
    if ((data.samples.length > 0) && data.samples[0][0] != timestamp[df]) {
      timestamp[df] = data.samples[0][0];
      if (data.samples[0][1].length == 1) {
        value = data.samples[0][1][0];
      }
      else {
        value = data.samples[0][1];
      }
    }
    handler(value);
  }
    $.ajax({
    url: endPoint + id + '/' + df,
    type: 'GET',
    headers: {'password-key': passwd},	  
    error: function(a, b, c) {handler();}
  })
  .done(preHandler);
};

const csmPush = function (df, rawData) {
  jsonData = {'data': rawData};
  $.ajax({
    url: endPoint + id + '/' + df,
    type: 'PUT',
    data: JSON.stringify(jsonData),
    dataType: 'json',
    contentType: 'application/json',
    headers: {'password-key': passwd},
  })
};

const dataget = function(handler) {
    var preHandler = function(data) {
        var morid = document.getElementById("morsensor");
        let value1 = null;
        let value2 = null;
        let value3 = null;
        value1 = parseFloat(data.humi);
        value2 = parseFloat(data.uv);
        value3 = parseFloat(data.alc);
        if(value1>=0||value2>=0||value3>=0){
            if(morid.style.display ==="none")
                morid.style.display = "flex";
        }
        handler(value1,value2,value3);
    }
    $.ajax({
        //url: 'http://5.iottalk.tw:8080' + '/dataget',
        url: 'http://5.iottalk.tw:8080' + '/dataget',
           type: 'GET',
           error: function(a,b,c) {
           var morid = document.getElementById("morsensor");
           var humiid = document.getElementById("humi");
           var uvid = document.getElementById("uv");
           var alcid = document.getElementById("alc");
           //alert("error msg "+jq.status);
           //alert('response fail');
           //alert("error type "+b);
           if(morid.style.display !="none")
           morid.style.display = "none";
           if(humiid.style.display != "none")
           humiid.style.display = "none";
           if(uvid.style.display != "none")
           uvid.style.display = "none";
           if(alcid.style.display != "none")
           alcid.style.display = "none";
           }
           })
    .done(preHandler)
    .fail(function(err){
        //console.log(err.statusText);	    
	errCounter += 1;
    });	
};

const csmDelete = function() {
  $.ajax({
    url: endPoint + id,
    type: 'DELETE'
  })
};


