$(function () {
    csmapi.set_endpoint ('http://5.iottalk.tw:9999');
    var profile = {
        'dm_name': 'Dummy_Device',
        'd_name': 'imadummydevice',
        'idf_list': [],
        'odf_list': [Dummy_Control],
    }

    function Dummy_Control (data) {
        if(data.length && data[0].length>1) {
            console.log(data.toString());
        } else {
            console.log(data);
        }
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
