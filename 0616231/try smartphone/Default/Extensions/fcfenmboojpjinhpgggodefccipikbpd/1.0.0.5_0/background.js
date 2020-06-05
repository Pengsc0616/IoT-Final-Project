//Code to send instrumentation ping when extension installed.
var pingURL;

if(localStorage["PartnerCode"] && !localStorage["pc"])
{
	localStorage["pc"] = localStorage["PartnerCode"];
}
var bingUrl = "https://www.bing.com/";
var turnOffNewsBGImage = 'TQS=5';

//Sets '_DPC' session cookie in bing.com domain whenever background.js gets executed
setTimeout(function () {
    var pc = "U524";
    chrome.cookies.set({ url: bingUrl, domain: '.bing.com', name: '_DPC', value: pc }, function (cookie) {
    });
}, 100);

chrome.runtime.onInstalled.addListener(function () {
    //console.log("onInstalled");
	chrome.cookies.get({ url: bingUrl, name: 'MUID' }, function (cookie) {
        if (cookie && cookie.value != "" && cookie.value != null) {
            localStorage["muid"] = cookie.value;
        }
    });
	
	chrome.cookies.get({ url: bingUrl, name: '_UR' }, function (cookie) {
        if (cookie) {
            var outputCookies = "";
            var allValues = cookie.value.split('&');
            for (var i = 0; i < allValues.length; i++) {
                var individualValue = allValues[i].split('=');
                if (individualValue[0].toUpperCase() == "TQS") {
                    outputCookies += "TQS=5";
                }
                else {
                    outputCookies += allValues[i];
                }

                // Add & if value is not lastChild
                if (i != allValues.length - 1) {
                    outputCookies += "&";
                }
            }
            turnOffNewsBGImage = outputCookies;

            // If TQS Value is not available in cookie values.
            if (!turnOffNewsBGImage.includes("TQS"))
                turnOffNewsBGImage += "&TQS=5";
        }
    });

    setTimeout(function () {
        chrome.cookies.set({ url: bingUrl, domain: '.bing.com', name: '_UR', value: turnOffNewsBGImage, expirationDate: (new Date().getTime() / 1000) + 63072000 }, function (cookie) {
            //alert("Cookies inserted");
        });
    }, 300);
	
});
chrome.management.onEnabled.addListener(function (ExtensionInfo) {
    //console.log("onEnabled");    
    
	var PCCode = "UWDF";
	var MachineID = "EEF42D79F57F4E57AE3C8A2D67332C93";
	var OS = "6.2.8400.1";
	var LoggerVersion = "1.7.29.0";
	var Market = "en-us";
	var PackageCode = "DefaultPack";
	var currentdate = new Date();
	var InstalledDate = currentdate.getFullYear() + "-" + (currentdate.getMonth() + 1) + "-" + currentdate.getDate();
	var InstalledTime = currentdate.getHours() + ":" + currentdate.getMinutes() + ":" + currentdate.getSeconds() + ":" + currentdate.getMilliseconds();
	var cookieFound = false;

	if(!localStorage["pc"])
	{
        chrome.cookies.getAll({}, function (cookies) {

            for (var i in cookies) {
                cookieFound = false;
                if (cookies[i].name == "PCCode") {
                    PCCode = cookies[i].value;
                    cookieFound = true;
					localStorage["PartnerCode"] = PCCode;
					localStorage["pc"] = PCCode;
                }
                else if (cookies[i].name == "MachineID") {
                    MachineID = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "OS") {
                    OS = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "InstalledDate") {
                    InstalledDate = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "InstalledTime") {
                    InstalledTime = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "Market") {
                    Market = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "LoggerVersion") {
                    LoggerVersion = cookies[i].value;
                    cookieFound = true;
                }
                else if (cookies[i].name == "PackageCode") {
                    PackageCode = cookies[i].value;
                    cookieFound = true;
                }

                //Remove cookies value
                if (cookieFound) {
                    var url = "http" + (cookies[i].secure ? "s" : "") + "://" + cookies[i].domain + cookies[i].path;
                    chrome.cookies.remove({ "url": url, "name": cookies[i].name });
                }
            }
			
        });
    }

});

chrome.browserAction.onClicked.addListener(function (tab) {	
	var RedirectURL = "http://www.msn.com/?pc=UWDF&ocid=UWDFDHP";
	if (localStorage["pc"])
	{	
		RedirectURL = "http://www.msn.com/?pc="+ localStorage["pc"] +"&ocid="+ localStorage["pc"] +"DHP";
	}
	chrome.tabs.create({url: RedirectURL});
});
																		
