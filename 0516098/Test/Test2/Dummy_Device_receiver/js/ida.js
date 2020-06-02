var t = 0;
$(function () {
    csmapi.set_endpoint ('http://5.iottalk.tw:9999');
    var profile = {
        'dm_name': 'Dummy_Device',
        'd_name': 'output_dummy_' + Math.floor(Math.random()*1e6),
        'idf_list': [],
        'odf_list': [Dummy_Control],
    }

    function Dummy_Control (data) {
        if(data.length) {
            console.log(data.toString());
        } else {
            console.log(data);
        }
        console.log('dt = ', (Date.now()-t)/1000);
        t = Date.now()
    }

    function ida_init () {
        document.write("<h1>d_name: ", profile.d_name,"</h1><br>");
        document.write("<h2>Watch the console for output</h2>");
        document.title = profile.d_name;
    }

    var ida = {
        'ida_init': ida_init,
    };

    dai(profile, ida);
});
