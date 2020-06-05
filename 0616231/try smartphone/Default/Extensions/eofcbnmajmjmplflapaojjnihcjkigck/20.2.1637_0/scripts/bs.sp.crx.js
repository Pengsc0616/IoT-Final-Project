/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *******************************************************************************
 *
 *  Background Browser Specific - Core Chrome Extensions functionality
 *
 ******************************************************************************/

(function (_) {

    'use strict';

    var bal = null; //AvastWRC.bal instance - browser agnostic

    /**
     * User has change from tab to tab or updated an url in the tab
     *
     * @param  {String} url    Site url loaded into the tab
     * @param  {Object} tab    Tab object reference
     * @return {void}
     */
    function urlChange(url, tab, updateEvent) {

        if(AvastWRC.bal && AvastWRC.bal.sp && AvastWRC.bal.sp.isCouponInTab(url, tab))return;

        else{
            console.log("url change no coupons to show");
            AvastWRC.UtilsCache.remove("closed_applied_coupon", tab.id);
        }

        var lastUrl = AvastWRC.TabReqCache.get(tab.id,"last_url_in_tab");
        let domainInfo = AvastWRC.DomainsWhiteList.getDomainInfo(AvastWRC.bal.getDomainFromUrl(url));
        let response = {
            match: (domainInfo.flag & AvastWRC.DomainsWhiteList.FLAGS_MASK.WL) ? true : false,
            urlInfoRequestUrl: (lastUrl) ? lastUrl.url || "" : "",
            urlInfoRequestTab: (lastUrl) ? lastUrl.tab || "" : "",
            isfakeShop: (domainInfo.flag & AvastWRC.DomainsWhiteList.FLAGS_MASK.FAKE_SHOP) ? true : false,
            isPhishing: false, //TODO how do we now now if is clean or not
            isSecureSSl: url.indexOf("https://") === 0 ? true : false,
            showResult: true
        };


        AvastWRC.bal.emitEvent("message.isShopDomain", url, response, tab, updateEvent);


    }
    /**
     * User updates URL  in the browser (clicking a link, etc.) Question: why is it also triggered for unloaded tabs
     *
     * @param  {Number} tabId      Tab Identification
     * @param  {Object} changeInfo state of loading {status : "loading | complete", url: "http://..."}  - url property appears only with status == "loading"
     * @param  {Object} tab        Tab properties
     * @return {void}
     */
    function onTabUpdated(tabId, changeInfo, tab) {

        AvastWRC.bs.tabExists(tabId, function () {
            //console.log("URLS UPDATE", tab.url, changeInfo.status);
            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.
            // and disable the browser extension for those tabs

            if (!AvastWRC.bs.checkUrl(tab.url)) {
                if (AvastWRC.bal.sp) AvastWRC.bal.sp.disableBadgeAnimation();
                AvastWRC.bal.emitEvent("control.hide", tabId);
                AvastWRC.bal.emitEvent("control.hide", tabId);
                return;
            }

            AvastWRC.bal.emitEvent("control.show", tabId);

            switch(changeInfo.status)
            {
                case 'complete':
                    //console.log("Listener onTabUpdated-> ", tab.url, changeInfo.status);

                    var couponInTabsToShow = AvastWRC.UtilsCache.get("coupons_tabs_to_show", tab.id);
                    if(couponInTabsToShow && (AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateDomain) || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateName))){
                        couponInTabsToShow.toBeShownIn[tab.url] = true;
                        AvastWRC.UtilsCache.set("coupons_tabs_to_show", tab.id, couponInTabsToShow);
                        console.log("couponInTabsToShow complete-> ", tab, couponInTabsToShow);
                    }

                    var couponInTabsToRemove = AvastWRC.UtilsCache.get("coupons_tabs_to_remove", tab.id);
                    if(couponInTabsToRemove && couponInTabsToRemove.coupons && !couponInTabsToRemove.timer){
                        console.log("couponTab onPageComplete: couponTab page complete removed ", couponInTabsToRemove);
                        var _tab = tab;
                        couponInTabsToRemove.timer = true;
                        var couponsShowConfig = AvastWRC.Shepherd.getCouponsShowConfig();
                        var couponShowConfig = {};
                        if(couponInTabsToRemove.coupons[0].code){
                            couponShowConfig = couponsShowConfig.couponsWithCode;
                        }
                        else{
                            couponShowConfig = couponsShowConfig.couponsWithoutCode;
                        }
                        console.log("couponTab onPageComplete: couponTab page complete removed ", couponInTabsToRemove, " config: ", couponShowConfig);
                        if(!isNaN(parseInt(couponShowConfig.closeAfter))){
                            closeTabWitTimeout(tab, parseInt(couponShowConfig.closeAfter));
                        }else{
                            closeTab(_tab);
                        }
                    }

                    function closeTabWitTimeout (tab, time){
                        var _tab = tab;
                        setTimeout(() => {
                            closeTab(_tab);
                        }, time*1000);
                    }
                    function closeTab (tab){
                        var _tab = tab;
                        AvastWRC.bs.tabExists(_tab.id, function () {
                            AvastWRC.bs.closeTab(_tab);
                            AvastWRC.UtilsCache.remove("coupons_tabs_to_remove", _tab.id);
                        });
                    }

                    var lastUrl = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id,"last_url_in_tab") || {}));
                    var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id, "safePriceInTab") || {}));
                    var time = parseInt(new Date().getTime())/1000;
                    console.log('===============complete=====================');
                    console.log("lastUrl data", lastUrl, "\n cachedData data", cachedData, "\n new tab data", tab, "\n time old", (lastUrl)?lastUrl.time:"", "\n time now", time);
                    console.log("lastUrl.url: " + JSON.stringify(lastUrl.url || ""), "\n new tab.url: " + JSON.stringify(tab.url || ""));
                    console.log("same url: ", JSON.stringify(lastUrl.url || "") === JSON.stringify(tab.url || "")?true:false);
                    console.log('===============complete=====================');
                    if( cachedData && !cachedData.transactionFinished && lastUrl && lastUrl.url === tab.url){
                        console.log("onTabUpdated() do nothing same url and transactionFinished = false ");
                        break;
                    }
                    if( cachedData && cachedData.transactionFinished && cachedData.scrapers && cachedData.scrapers.length > 0  &&
                        lastUrl && lastUrl.url === tab.url &&
                        (time - lastUrl.time) < 300){
                        console.log(" onTabUpdated() same url and transactionFinished = true but less than 5m elapsed re-parse");
                        cachedData.transactionFinished = false;
                        AvastWRC.TabReqCache.set(tab.id, "safePriceInTab",cachedData);
                        AvastWRC.bal.sp.runTabParser(tab, cachedData.scrapers, cachedData.clientInfo);
                        break;
                    }

                    AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);
                    AvastWRC.bal.sp.disableBadgeAnimation(tabId);
                    AvastWRC.bal.emitEvent("control.hide", tabId);

                    let clientInfo = AvastWRC.Utils.getClientInfo();
                    clientInfo.transaction_id = AvastWRC.Utils.getRandomUID();
                    clientInfo.request_id = AvastWRC.Utils.getRandomUID();

                    AvastWRC.TabReqCache.set(tab.id,"last_url_in_tab", {url: tab.url, tab: tab, time: parseInt(new Date().getTime())/1000});
                    AvastWRC.TabReqCache.set(tab.id, 'safePriceInTab', {transactionFinished: false, clientInfo: clientInfo, transactionStarted: false});

                    console.log("onTabUpdated() Clean the cache of the scraper (new onComplete event)", "transactionID: ", clientInfo.transaction_id, " requestID: ", clientInfo.request_id);
                    AvastWRC.bs.accessContent(tab, {
                        message: "cleanScraperData",
                        data: {}
                    });

                    console.log("onTabUpdated() complete", tab, changeInfo);
                    urlChange(tab.url, tab, true);

                break;

                default:
                break;
            }
        });
    }
    function onRedirect(info) {
        //console.log("URLS REDIRECT", info.redirectUrl);
    }


	/**
     * User clic SP icon when it is on hide mode
     *
     * @param  {Object} tab        Tab object
     * @return {void}
     */
    function onClicked(tab){
        AvastWRC.bs.tabExists(tab.id, function () {
            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.
            // and disable the browser extension for those tabs
            if (!AvastWRC.bs.checkUrl(tab.url)) {
                AvastWRC.bal.emitEvent("control.hide", tab.id);
                AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);
                return;
            }

            var cachedData = AvastWRC.TabReqCache.get(tab.id, "safePriceInTab");
            var closedCoupon = AvastWRC.UtilsCache.get("closed_applied_coupon", tab.id);
            var clientInfo = (cachedData && cachedData.clientInfo && typeof cachedData.clientInfo === "string") ?
                            JSON.parse(cachedData.clientInfo) :
                            null;
            if(closedCoupon && tab.url.indexOf(closedCoupon.closedCouponUrl) !== -1){
                console.log("onClicked", closedCoupon.closedCouponUrl);
                AvastWRC.bs.accessContent(tab, {
                    message: "applyCouponInTab",
                    data: closedCoupon,
                });
                AvastWRC.bal.emitEvent("control.show", tab.id);
                AvastWRC.bal.emitEvent("control.setIcon", tab.id, "common/ui/icons/logo-safeprice-128.png");
                clientInfo = (typeof closedCoupon.clientInfo === "string") ? JSON.parse(closedCoupon.clientInfo) : null;
                sendIconClickedBurgerEvent(clientInfo);
            }else if(cachedData && cachedData.url === tab.url && clientInfo.transaction_id){

                if(!cachedData.panelData) {
                    cachedData.panelData = JSON.parse(JSON.stringify(AvastWRC.bal.sp.panelData));
                }
                if(!cachedData.search){
                    cachedData.search = {couponsSearch: {}, offersSearch: {}};
                }
                cachedData.iconClicked = 1;

                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                console.log("extensionIconClicked -> update the data", cachedData);
                AvastWRC.bs.accessContent(tab, {
                    message: "extensionIconClicked",
                    data: cachedData,
                });
                if(cachedData.badgeHighlighted){
                    sendIconClickedBurgerEvent(clientInfo);
                }
            }else{
                var data = {panelData: JSON.parse(JSON.stringify(AvastWRC.bal.sp.panelData)),
                    iconClicked: 1};
                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", data);

                urlChange(tab.url, tab,false);
                console.log("onClicked Icon clicked: no data");
            }

            function sendIconClickedBurgerEvent(clientInfo) {
                var eventDetails = {
                    clientInfo: (clientInfo) ? clientInfo : AvastWRC.Utils.getClientInfo(),
                    url: tab.url,
                    eventType: "EXTENSION_ICON",
                    type: "CLICKED_CTA",
                    offer: null,
                    offerType: ""
                };
                if(eventDetails.clientInfo.referer === ""){
                    eventDetails.clientInfo.referer = AvastWRC.TabReqCache.get(tab.id,"referer");
                }

                console.log("onClicked", eventDetails);
                if(AvastWRC.Burger !== undefined){
                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                }
                else{
                    console.log("no burger lib");
                }
            }
        });
    }

    /**
     * Forwards all the messages to the browser agnostic core
     */
    function messageHub(request, sender, reply) {
        console.log("onMessage messageHub bs.core.crx");
        let tab = sender.tab || request.tab;
        if(request.message === "control.onClicked"){
            onClicked(request.tab);
        }
        else if(tab){
            if(request.message.indexOf("message.") !== -1){
                AvastWRC.bs.accessContent(tab, {
                    message: request.message,
                    data: request,
                });
            }else{
                bal._ee.emit("message." + request.message, request, tab);
            }
        }
        return reply({response: "message received"}) || Promise.resolve({response: "message received"});
    }

    function onDOMContentLoaded(event){
        var _event = event;

        if(!_event || !_event.tabId || _event.tabId < 0){
            return;
        }

        var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(_event.tabId, "safePriceInTab") || {}));

        if(!_event.url || !AvastWRC.bs.checkUrl(_event.url) || !cachedData || !cachedData.url || !cachedData.transactionFinished){
            return;
        }

        cachedData.transactionFinished = false;
        AvastWRC.TabReqCache.set(_event.tabId, "safePriceInTab",cachedData);

        AvastWRC.bs.getTabFromUrl(cachedData.url, (tab)=>{
            if(!tab){
                console.log("Listener onDOMContentLoaded-> url: ", event.url, event, "no tab to re-parse");
                cachedData.transactionFinished = true;
                AvastWRC.TabReqCache.set(_event.tabId, "safePriceInTab",cachedData);
            }else{
                console.log("Listener onDOMContentLoaded-> url: ", event.url, event, "re-parse -> maybe this site changed");
                AvastWRC.bal.sp.runTabParser(tab, cachedData.scrapers, cachedData.clientInfo);
            }
        });
    }
    /*****************************************************************************
     * bs.aos - browser specific AOS functionality
     ****************************************************************************/
    AvastWRC.bs.core = AvastWRC.bs.core || {};
    _.extend(AvastWRC.bs.core, // Browser specific
        {
            /**
             * Function called on BAL initialization to initialize the module.
             */
            init: function (balInst) {
                bal = balInst;

                chrome.tabs.onUpdated.addListener(onTabUpdated);
                chrome.tabs.onRemoved.addListener(AvastWRC.onTabRemoved);

                // chrome.webNavigation might also be an option, but it has a bug that affects google search result page: https://bugs.chromium.org/p/chromium/issues/detail?id=115138
                chrome.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] });

                chrome.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded);

                //clic on SP icon
                balInst.registerEvents(function (ee) {
                    ee.on("control.onClicked", onClicked);
                });

                chrome.runtime.onMessage.addListener(messageHub);

                chrome.webRequest.onSendHeaders.addListener(
                    AvastWRC.onSendHeaders,
                    { urls: ["http://*/*", "https://*/*"] },
                    ["requestHeaders"]
                );
            },

        }); // AvastWRC.bs.aos

    AvastWRC.bal.registerModule(AvastWRC.bs.core);
}).call(this, _);

/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *  Background Browser Specific - AOS specific - module for stadalone execution
 *
 ******************************************************************************/

(function(AvastWRC, chrome, _) {

  function show (tabId) {
    if(tabId < 0)return;
    chrome.browserAction.enable(tabId);
  }

  function hide (tabId) {
    if(tabId < 0)return;
    chrome.browserAction.disable(tabId);
  }

  function showText (tabId, text, bgcolor) {
    if(tabId < 0)return;
    if (AvastWRC.Utils.getBrowserInfo().isFirefox() && AvastWRC.getBrowserVersion() >= 63) chrome.browserAction.setBadgeTextColor({color: "white"});

    chrome.browserAction.setBadgeText({
      tabId: tabId,
      text: text || ""
    });

    if (bgcolor) {
      chrome.browserAction.setBadgeBackgroundColor({
        tabId: tabId,
        color: bgcolor
      });
    }
  }

  function setTitle (tabId, title) {
    if(tabId < 0)return;
    chrome.browserAction.setTitle({
      tabId: tabId,
      title: title || ""
    });
  }

  function setIcon (tabId, iconPath) {
    if(tabId < 0)return;
    chrome.browserAction.setIcon({
      tabId: tabId,
      path: iconPath
    }, function (){
      if (chrome.runtime.lastError) {
        console.log("LOG: "+chrome.runtime.lastError.message);
    }});
  }

  AvastWRC.bs.icon = AvastWRC.bs.icon || {};
   _.extend(AvastWRC.bs.icon, // Browser specific
    {
      /**
       * Function called on BAL initialization to initialize the module.
       */
      init: function (balInst) {

        balInst.registerEvents(function (ee) {
          ee.on("control.show", show);
          ee.on("control.hide", hide);
          ee.on("control.showText", showText);
          ee.on("control.setTitle", setTitle);
          ee.on("control.setIcon", setIcon);
        });

        chrome.browserAction.onClicked.addListener(function (tab) {
          balInst.emitEvent("control.onClicked", tab);
        });

    },

  });

  AvastWRC.bal.registerModule(AvastWRC.bs.icon);

}).call(this, AvastWRC, chrome, _);

/*******************************************************************************
 *  Background Browser Specific - SafePrice Chrome Extensions functionality
 ******************************************************************************/

(function(_) {
  
  AvastWRC.bs.SP = AvastWRC.bs.SP || {};
  _.extend(AvastWRC.bs.SP, // Browser specific
  {
    /**
     * Function called on BAL initialization to initialize the module.
     */
    init: function (balInst) {

    }
  }); // AvastWRC.bs.aos

  AvastWRC.bal.registerModule(AvastWRC.bs.SP);
}).call(this, _);

/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *  Background Browser Specific - AOS specific - module for stadalone execution
 *
 ******************************************************************************/

(function(AvastWRC, chrome, _) {
    'use strict';
    AvastWRC.bs.SP = AvastWRC.bs.SP || {};


    _.extend(AvastWRC.bs.SP, // Browser specific
    {
        /**
         * Function called on BAL initialization to initialize the module.
         */
        init: function (balInst) {
        // Obtain userId
            var settings = balInst.settings.get();
            var userid = settings.current.userId;
            if (!!userid) balInst.storeUserId(userid);
        }
    }); // AvastWRC.bs.SP.sa

    AvastWRC.bal.registerModule(AvastWRC.bs.SP);

    AvastWRC.storageCache.load(); // loads from localstorage initialize the avastwrc modules and bal core
    // Start background page initilizing BAL core

}).call(this, AvastWRC, chrome, _);
