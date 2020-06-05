/*******************************************************************************
 *
 *  avast! Online Security plugin
 *  (c) 2013 Avast Corp.
 *
 *  @author: Lucian Corlaciu
 *
 *  Background Core - cross browser
 *
 ******************************************************************************/

(function(_, EventEmitter) {
    "use strict";

    // Extension editions
    var DEFAULT_EDITION = 0; // if no ed. determined start with AOS ed.

    if (typeof AvastWRC === "undefined") { AvastWRC = {}; } //AVAST Online Security - namespace

    var localStorage = null; // Browser specific local storage

    AvastWRC.bal = {
        _bal_modules : [], // initialized modules
        _core_modules : [], // core modules
        _bootstrap_modules : [], // bootstrap modules based on edition config
        sendHeartbeatInterval: null,
        /**
         * Register BAL module.
         * @param {Object} module to register
         */
        registerModule: function(module) {
            console.log("registerModule: ", module);
            if (typeof module.bootstrap === "function") {
                this._bootstrap_modules.push(module);
            } else {
                this._core_modules.push(module);
            }
        },
        /**
         * EventEmitter instance to hangle background layer events.
         * @type {Object}
         */
        _ee: new EventEmitter({wildcard:true, delimiter: ".",}),
        /**
         * Register events with instance of EventEmitter.
         * @param  {Object} callback to register with instance of eventEmitter
         * @return {void}
         */
        registerEvents: function(registerCallback, thisArg) {
            if (typeof registerCallback === "function") {
                registerCallback.call(thisArg, this._ee);
            }
        },
        // TODO mean to unregister the events
        /**
         * Emit background event
         * @param {String} event name
         * @param {Object} [arg1], [arg2], [...] event arguments
         */
        emitEvent: function() {
        // delegate to event emitter
            this._ee.emit.apply(this._ee, arguments);
        },
        /**
         * browser type
         * @type {String}
         */
        browser: "",

        /**
         * Get important info about the extension running.
         */
        trace: function (log) {
            _.each(this._bal_modules, function(module) {
                if (typeof module.trace === "function") {
                    module.trace(log);
                }
            });

            console.log("> all listeners ", this._ee.listeners("*").length);
        },

        /**
         * Initialization
         * @param  {Object} _back
         * @return {Object}
         */
        init: function() {
            if(AvastWRC.CONFIG.OPT_IN && !AvastWRC.CONFIG.OPT_IN.functional && AvastWRC.Utils.getBrowserInfo().isFirefox() )return;

            AvastWRC.avastConfig.load();

            var defSettings = AvastWRC.storageCache.get("settings") || AvastWRC.CORE_DEFAULT_SETTINGS;

            if (!defSettings.userSPPoppupSettings.privacy) {
                defSettings.userSPPoppupSettings.privacy = AvastWRC.CORE_DEFAULT_SETTINGS.userSPPoppupSettings.privacy;
            }
            if (AvastWRC.CONFIG.OPT_IN && AvastWRC.CONFIG.OPT_IN.updateSettings){
                defSettings.userSPPoppupSettings.privacy.accepted = AvastWRC.CONFIG.OPT_IN.privacy;
                AvastWRC.CONFIG.OPT_IN.updateSettings = false;
                AvastWRC.storageCache.save("opt_in", AvastWRC.CONFIG.OPT_IN);

            }
                
            AvastWRC.bal.settings = new AvastWRC.bal.troughStorage("settings", defSettings);

            var shepherdPromise = [];
            shepherdPromise.push(AvastWRC.Shepherd.init());

            Promise.all(shepherdPromise).then(() => {

                Q.fcall(function() {
                    return this._core_modules;
                }.bind(this))
                .then(this.initModules.bind(this))
                .then(this.initModuleSettings.bind(this))
                .then(this.bootstrapInit.bind(this))
                .then(()=>{
                    var result = AvastWRC.storageCache.get("landingPageShown");
                    console.log("landingPageShown", result);
                    if (result === null || result === false) {
                        if (!AvastWRC.Utils.getBrowserInfo().isAvast()){
                            console.log("landingPageShown: open it");
                            AvastWRC.bal.openLandingPageTab();
                        }
                        else{
                            AvastWRC.storageCache.save("landingPageShown", true);
                        }
                        AvastWRC.storageCache.save("installedVersion", AvastWRC.bs.getVersion());
                    }

                    AvastWRC.Utils.Burger.initBurger(false/*sendAll*/);
                    //Heartbeat
                    AvastWRC.bal.sp.sendHeartbeat();

                    if(AvastWRC.bal.sendHeartbeatInterval){
                        clearInterval(AvastWRC.bal.sendHeartbeatInterval);
                        AvastWRC.bal.sendHeartbeatInterval = null;
                    }
                    //send heartbeat each 16H (milisecond 57600000) or the ttl from shepherd
                    AvastWRC.bal.sendHeartbeatInterval = setInterval(function() {
                        AvastWRC.bal.sp.sendHeartbeat();
                    }, AvastWRC.Shepherd ? AvastWRC.Shepherd.getHeartbeat()*1000 : 57600*1000);

                    AvastWRC.CloseTooltip.init();
                    AvastWRC.SettingsTooltip.init();
                    AvastWRC.Social.init();
                    AvastWRC.YesNo.init();
                    AvastWRC.NotificationsManager.init();
                    AvastWRC.UpdateManager.init();
                    AvastWRC.Uninstall.setUninstallURL();
                    AvastWRC.ASDetector.init();
                    AvastWRC.DomainsWhiteList.init();

                })
                .fail(function (e) {
                    console.log("Error in bal.init: ", e);
                });
            });

            return this;
        },
        initEdition : function (edition) {
            return Q.fcall(function() { return edition;});
        },
        bootstrapInit : function (edition) {
            var features = AvastWRC.CORE_DEFAULT_SETTINGS.features;
            var bootstrapped = _.reduce(this._bootstrap_modules, function(bModules, moduleBootstrap) {
                var module = moduleBootstrap.bootstrap(features);
                if (module) bModules.push(module);
                return bModules;
            }, [], this);
            return Q.fcall(function () { return bootstrapped; });
        },
        initModules : function (modules) {
            _.each(modules, function(module) {
                if (module) {
                    // register individual modules - init and register with event emitter
                    if (typeof module.init === "function") module.init(this);
                    if (typeof module.registerModuleListeners === "function") module.registerModuleListeners(this._ee);
                    this._bal_modules.push(module);
                }
            }, this);
            return Q.fcall(function () { return modules; });
        },
        initModuleSettings : function (modules) {
            var value = AvastWRC.bal.settings.get();

            if(value.current.callerId < AvastWRC.CONFIG.CALLERID){
                value.current.callerId = AvastWRC.CONFIG.CALLERID;
            }
            AvastWRC.bal.settings.set(value);
            AvastWRC.bal.updateOldSettings();
            AvastWRC.bal.updateOldUserSettings();
            AvastWRC.bal.updateSp291Settings();
            return Q.fcall(function () { return modules; });
        },
        afterInit : function () {
            _.each(this._bal_modules, function(module) {
                // after init - all modules initialized
                if (typeof module.afterInit === "function") module.afterInit();
                this._bal_modules.push(module);
            }, this);
        },

        /**
         * creates the settings object or updates an already present one
         * @return {void}
         */
        mergeInSettings: function(settings) {
            var newSettings = this.settings.get(),
                big, small;
            if(!newSettings){
                this.settings.set(settings);
            }else{
                for(big in settings) {
                    if(newSettings[big] === undefined){
                        newSettings[big] = settings[big];
                    }
                    else {
                        for(small in settings[big]) {
                            if (newSettings[big][small] === undefined) {
                                newSettings[big][small] = settings[big][small];
                            }
                        }
                    }
                }
            }
            this.settings.set(newSettings);
        },
        /**
         * updates the stored settings from AvastWRC
         * @return {void}
         *
         * TODO - save and use settings in a single place
         */
        updateOldSettings: function() {
            var settings = this.settings.get();
            AvastWRC.CONFIG.USERID = settings.current.userId;
        },
        updateOldUserSettings: function(){
            var settings = this.settings.get();
            var newSettings = settings.userSPPoppupSettings;
            if(!newSettings || !newSettings.help || !newSettings.notifications)return;

            if(newSettings.advanced){
                if(newSettings.advanced.selected){
                    newSettings.help.selected = false;
                    newSettings.notifications.selected = true;
                    newSettings.customList.selected = false;
                }
                if(newSettings.general){
                    newSettings.notifications.offers.item1Selected = (newSettings.advanced.offers.item1Selected && !newSettings.general.item2Selected) ? true : false;
                    newSettings.notifications.offers.item2Selected = (newSettings.advanced.offers.item2Selected && !newSettings.general.item2Selected) ? true : false;
                    newSettings.notifications.offers.item3Selected = (newSettings.advanced.offers.item3Selected && !newSettings.general.item2Selected) ? true : false;
                    newSettings.notifications.coupons.item1Selected = (newSettings.advanced.coupons.item1Selected && !newSettings.general.item2Selected) ? true : false;
                    newSettings.notifications.coupons.item2Selected = (newSettings.advanced.coupons.item2Selected && !newSettings.general.item2Selected) ? true : false;
                }
                newSettings.notifications.offers.include.eShop = newSettings.advanced.offers.include.eShop ? true : false;
                newSettings.notifications.offers.include.accommodations = newSettings.advanced.offers.include.accommodations ? true : false;
                newSettings.notifications.others.item1Selected = newSettings.advanced.offers.include.special ? true : false;
            }
            if(newSettings.customList && newSettings.customList.selected){
                    newSettings.help.selected = false;
                    newSettings.notifications.selected = false;
                    newSettings.customList.selected = true;
            }
            if (newSettings.general){
                if(newSettings.general.selected){
                    newSettings.help.selected = true;
                    newSettings.notifications.selected = false;
                    newSettings.customList.selected = false;
                }
                newSettings.notifications.offers.item4Selected = (newSettings.general.item2Selected) ? true : false;
                newSettings.notifications.coupons.item3Selected = newSettings.general.item2Selected ? true : false;
            }

            delete newSettings.general;
            delete newSettings.advanced;
            settings.userSPPoppupSettings = newSettings;
            this.settings.set(settings);
        },
        updateSp291Settings: function () {
            let settings = this.settings.get();
            let newSettings = settings.userSPPoppupSettings;
            if(!newSettings || !newSettings.help || !newSettings.notifications)return;

            let newSettingsNotifications = newSettings.notifications;

            let newDefault = {
                offers: {
                    showAlways: true,// show always
                    showBetter: false,// show better than the original price
                    hide: false,// hide
                },
                accommodations: {
                    showBetter: true,// show better than the original price
                    showSimilar: true,// show similar hotels
                    showPopular: true,// show popular hotels
                },
                coupons: {
                    showAlways: true, // show always
                    showOnce: false, // show once
                    hide: false, // hide notifications
                },
                others: {
                    showAlways: true, // show always
                }
            };
            if(newSettingsNotifications.offers.item1Selected !== undefined){
                newSettingsNotifications.offers.showAlways = newSettingsNotifications.offers.item1Selected;
                delete newSettingsNotifications.offers.item1Selected;
                newSettingsNotifications.accommodations = newDefault.accommodations;
            }else if(newSettingsNotifications.offers.showAlways === undefined) {
                newSettingsNotifications.offers.showAlways = newDefault.offers.showAlways;
            }
            if (newSettingsNotifications.offers.item2Selected  !== undefined){
                newSettingsNotifications.offers.showBetter = newSettingsNotifications.offers.item2Selected;
                delete newSettingsNotifications.offers.item2Selected;
                delete newSettingsNotifications.offers.item3Selected;
             }else if(newSettings.notifications.offers.item3Selected  !== undefined) {
                newSettingsNotifications.offers.showBetter = newSettingsNotifications.offers.item3Selected;
                delete newSettingsNotifications.offers.item2Selected;
                delete newSettingsNotifications.offers.item3Selected;
             }else if(newSettingsNotifications.offers.showBetter === undefined) {
                newSettingsNotifications.offers.showBetter = newDefault.offers.showBetter;
            }
            if(newSettingsNotifications.offers.item4Selected !== undefined){
                newSettingsNotifications.offers.hide = newSettingsNotifications.offers.item4Selected;
                delete newSettingsNotifications.offers.item4Selected;
            }else if(newSettingsNotifications.offers.hide === undefined) {
                newSettingsNotifications.offers.hide = newDefault.offers.hide;
            }

            if(newSettingsNotifications.coupons.item1Selected !== undefined){
                newSettingsNotifications.coupons.showAlways = newSettingsNotifications.coupons.item1Selected;
                delete newSettingsNotifications.coupons.item1Selected;
            }else if(newSettingsNotifications.coupons.showAlways === undefined) {
                newSettingsNotifications.coupons.showAlways = newDefault.coupons.showAlways;
            }
            if(newSettingsNotifications.coupons.item2Selected !== undefined){
                newSettingsNotifications.coupons.showOnce = newSettingsNotifications.coupons.item2Selected;
                delete newSettingsNotifications.coupons.item2Selected;
            }else if(newSettingsNotifications.coupons.showOnce === undefined) {
                newSettingsNotifications.coupons.showOnce = newDefault.coupons.showOnce;
            }
            if(newSettingsNotifications.coupons.item3Selected !== undefined){
                newSettingsNotifications.coupons.hide = newSettingsNotifications.coupons.item3Selected;
                delete newSettingsNotifications.coupons.item3Selected;
            }else if(newSettingsNotifications.coupons.hide === undefined) {
                newSettingsNotifications.coupons.hide = newDefault.coupons.hide;
            }
            if(newSettingsNotifications.others.item1Selected !== undefined){
                newSettingsNotifications.others.showAlways = newSettingsNotifications.others.item1Selected;
                delete newSettingsNotifications.others.item1Selected;
            }else if(newSettingsNotifications.others.showAlways === undefined) {
                newSettingsNotifications.others.showAlways = newDefault.others.showAlways;
            }

            delete newSettingsNotifications.offers.include;

            settings.userSPPoppupSettings.notifications = newSettingsNotifications;
            this.settings.set(settings);

        },

        getCurrentEdition : function(localAvastEdition) {
            var deferred = Q.defer();
            var settings = this.settings.get();
            var storedEdition = settings.current.edition;
            if (localAvastEdition !== undefined && localAvastEdition !== null) {
                if (!storedEdition || storedEdition !== localAvastEdition) {
                    settings.current.edition = localAvastEdition;
                    this.settings.set(settings);
                }
                deferred.resolve( localAvastEdition );
            } else {
                deferred.resolve( storedEdition || DEFAULT_EDITION );
            }
            return deferred.promise;
        },
        /**
         * Default settings with default values
         * @return {Object}
         */
        getDefaultSettings: function(modules) {
            return _.reduce (modules,
                function(defaults, module) {
                    if (typeof module !== "undefined" && typeof module.getModuleDefaultSettings === "function") {
                        var moduleDefaults = module.getModuleDefaultSettings();
                        if (moduleDefaults) {
                            defaults = _.merge(defaults, moduleDefaults);
                        }
                    }
                    return defaults;
                },
                AvastWRC.CORE_DEFAULT_SETTINGS
            );
        },
        getLandingPageCode: function (lang, local) {
            if (lang === "af" && local === "za") return "en-za";
            if (lang === "ar" && local === "sa") return "ar-sa";
            if (lang === "ar" && local === "ae") return "en-ae";
            if (lang === "ar") return "ar-ww";
            if (lang === "be") return "ru-ru";
            if (lang === "ca") return "es-es";
            if (lang === "cs") return "cs-cz";
            if (lang === "cy") return "en-gb";
            if (lang === "da") return "da-dk";
            if (lang === "de") return "de-de";
            if (lang === "el") return "el-gr";
            if (lang === "en" && local === "au") return "en-au";
            if (lang === "en" && local === "ca") return "en-ca";
            if (lang === "en" && local === "gb") return "en-gb";
            if (lang === "en" && local === "ph") return "en-ph";
            if (lang === "en" && local === "us") return "en-us";
            if (lang === "en" && local === "za") return "en-za";
            if (lang === "es" && local === "ar") return "es-ar";
            if (lang === "es" && local === "co") return "es-co";
            if (lang === "es" && local === "es") return "es-es";
            if (lang === "es" && local === "mx") return "es-mx";
            if (lang === "es") return "es-ww";
            if (lang === "eu") return "es-es";
            if (lang === "gu") return "en-in";
            if (lang === "fi") return "fi-fi";
            if (lang === "fo" && local === "fo") return "wn-ww";
            if (lang === "fr" && local === "be") return "fr-be";
            if (lang === "fr" && local === "ca") return "fr-ca";
            if (lang === "fr" && local === "ch") return "fr-ch";
            if (lang === "fr") return "fr-fr";
            if (lang === "gl") return "es-es";
            if (lang === "he") return "he-il";
            if (lang === "hi") return "hi-in";
            if (lang === "hu") return "hu-hu";
            if (lang === "id") return "id-id";
            if (lang === "it") return "it-it";
            if (lang === "ja") return "ja-jp";
            if (lang === "kk") return "ru-kz";
            if (lang === "ko") return "ko-kr";
            if (lang === "nb") return "no-no";
            if (lang === "nl" && local === "be") return "nl-be";
            if (lang === "nl") return "nl-nl";
            if (lang === "nn") return "no-no";
            if (lang === "ns") return "en-za";
            if (lang === "ms") return "en-my";
            if (lang === "pa") return "en-in";
            if (lang === "pl") return "pl-pl";
            if (lang === "pt" && local === "br") return "pt-br";
            if (lang === "pt") return "pt-pt";
            if (lang === "ru") return "ru-ru";
            if (lang === "se" && local === "fi") return "fi-fi";
            if (lang === "se" && local === "no") return "no-no";
            if (lang === "se" && local === "se") return "sv-se";
            if (lang === "sk") return "cs-sk";
            if (lang === "sv") return "sv-se";
            if (lang === "ta") return "en-in";
            if (lang === "te") return "en-in";
            if (lang === "tl") return "tl-ph";
            if (lang === "th") return "th-th";
            if (lang === "tr") return "tr-tr";
            if (lang === "tt") return "ru-ru";
            if (lang === "uk") return "uk-ua";
            if (lang === "vi") return "vi-vn";
            if (lang === "qu") return "es-ww";
            if (lang === "zh" && local === "tw") return "zh-tw";
            if (lang === "zh") return "zh-cn";
            if (lang === "zu" && local === "za") return "en-za";
            return "en-ww";
        },
        openLandingPageTab: function () {
            let url = AvastWRC.getLandingPageURL();
            console.log("openLandingPageTab: urlData", url);
            AvastWRC.storageCache.save("landingPageShown", true);
            AvastWRC.bs.tabExistsWithUrl(url, function (tab) {
                if (tab) {
                    console.log("openLandingPageTab: tab exist with url", tab, url);
                    AvastWRC.bs.tabRedirectAndSetActive(tab, url);
                } else {
                    console.log("openLandingPageTab: tab exist with url", tab, url);
                    AvastWRC.bs.openInNewTab(url);
                }
            });
        },

        openSearchPageInTab: function (tab) {
            let url = "https://search.avast.com/";
            if(AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVG){
                url = "https://mysearch.avg.com/";
            }
            if (tab) {
                AvastWRC.bs.tabRedirectAndSetActive(tab, url);
            } else {
                AvastWRC.bs.openInNewTab(url);
            }
        },

        getFAQsUrl: function(){
            var bLang = ABEK.locale.getBrowserLang().toLowerCase();

            let brandingSpecifics = {
                brandingType: "avast",
                contain: "support.avast.com",
                pPro: 43,
                pElem: 202,
                pScr: "61"
            };

            if(AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVG){
                brandingSpecifics = {
                    brandingType: "avg",
                    contain: "/welcome/safeprice-new",
                    pPro: 72,
                    pElem: 334,
                    pScr: "AVG-SafePrice-Frequently-Asked-Questions"
                };
            }
            var data = { url: `https://ipm-provider.ff.avast.com/?action=2&p_pro=${brandingSpecifics.pPro}&p_elm=${brandingSpecifics.pElem}&p_lng=${bLang}&p_scr=${brandingSpecifics.pScr}`,
                contain: brandingSpecifics.contain
            };
            console.log(data);
            return data;
        },

        openFAQsPageTab: function() {
            let urlData = AvastWRC.bal.getFAQsUrl();

            AvastWRC.bs.tabExistsWithUrl(urlData.contain, function (tab) {
                if (tab) {
                    AvastWRC.bs.tabRedirectAndSetActive(tab, urlData.url);
                } else {
                    AvastWRC.bs.openInNewTab(urlData.url);
                }
            });

        },
    /**
     * Persistent Storage wrapper
     * @param  {String} key
     * @param  {Object} initializer - in case the key is not present in localStorage
     * @return {Object} - troughStorage instance with get and set
     */
        troughStorage: function(key, initializer) {
            var tmpVal = null, tmpKey = key;

            return {
                get: function() {
                    return tmpVal || (tmpVal = initializer);
                },
                set: function(val) {
                    tmpVal = val;
                    AvastWRC.storageCache.save(tmpKey, tmpVal);
                },
            };
        },
    /**
     * Helper functions
     */
        isFirefox: function() {
            return AvastWRC.bal.browser === "Firefox";
        },
        getHostFromUrl: function(url) {
            if (!url) {
                return undefined;
            }

            var lcUrl = url.toLowerCase();

            if (lcUrl.toLowerCase().indexOf("http") !== 0 ||
                lcUrl.toLowerCase().indexOf("chrome") === 0 ||
                lcUrl.toLowerCase().indexOf("data") === 0 ||
                lcUrl.toLowerCase() === "about:newtab" ||
                lcUrl.toLowerCase() === "about:blank"){
                return undefined;
            }

            var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/);
            return match.length > 2 ? match[2] : undefined;
        },
        getDomainFromHost: function(host){
            // return only the last 2 levels of the domain
            return host ? host.split(".").slice(-2).join(".") : undefined;
        },
        getDomainFromUrl: function(url) {
            // return the complete domain (host)
            return AvastWRC.bal.getHostFromUrl(url);
        },
        jsonToString: function(obj) {
            var s = "";
            for(var key in obj) {
                if(typeof obj[key] === "object") {
                    s += key+"<br />";
                    s += this.jsonToString(obj[key]);
                } else {
                    s += key+": "+obj[key]+"<br />";
                }
            }

            return s;
        },

        /* Wraps bal to register to submodule events */
        Core : {
            registerModuleListeners : function (ee) {

            },
        },

        /**
         * AvastWRC.bal specific utilities.
         */
        utils : {
            /**
             * Retrieve localised strings into given data object
             * based on the string ids array.
             * @param {Object} data to load the strings to
             * @param {Array} identifiers of strings to load
             * @return {Object} updated data object
             */
            loadLocalizedStrings : function (data, stringIds) {
                return _.reduce (stringIds, function(res, stringId) {
                    res[stringId] = AvastWRC.bs.getLocalizedString(stringId);
                    return res;
                }, data);
            },

            /**
             * Create local image url for given key/file map.
             * @param {Object} to add local URLs to
             * @param {Object} map key / image file to create the local URLs for
             * @return {Object} updated data object
             */
            getLocalImageURLs : function (data, imagesMap) {
                return _.reduce (imagesMap, function(res, image, key) {
                    res[key] = AvastWRC.bs.getLocalImageURL(image);
                    return res;
                }, data);
            },

            /**
            * Generate hash from string.
            */
            getHash(str) {
                var hash = 0;
                if (str.length === 0) return hash;
                for (var i = 0; i < str.length; i++) {
                    var char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32bit integer
                }
                return hash;
            },
        }, // utils

        /**
         * Set bal instance with local storage instance.
         * @param {Object} browser local storage instance
         */
        setLocalStorage : function (ls) {
            localStorage = ls;
        },

        /**
         * Stores user Id so it is available to subsequent requests and persisted in local storage.
         * @param {String} userid to store
         */
        storeUserId : function (userId) {
            var settings = AvastWRC.bal.settings.get();
            settings.current.userId = userId;
            AvastWRC.bal.settings.set(settings);
            AvastWRC.bal.updateOldSettings(); // refresh settings accessible through AvastWRC
        },

        config: {
            installationVersionLocalStorageKey: "installedVersion"
        }
    }; // AvastWRC.bal

    // Init the core module to register for event from sub-modules.
    AvastWRC.bal.registerModule(AvastWRC.bal.Core);

}).call(this, _, EventEmitter2);

/*******************************************************************************
     *
     *  AvastWRC Shepherd
     * 
     ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.Shepherd = {
        /**
         * Initialize rules class
         * @return {Object} Self reference
         */
        init: function () {
            return new Promise((resolve, reject)=> {
                self.setBrowserCampaign().then(() => {
                    self.restore();                    
                    if (!self.isValidTtl()) {
                        new AvastWRC.Query.Shepherd((rules, ttl)=>{
                            self.loadOnSuccess(rules, ttl);
                            resolve();
                        });
                    }else{
                        resolve();
                    }                    
                });
            });
        },
        /**
         * Default / Current rules version (timestamp)
         * @type {Number}
         */
        rules : {
            expireTime: 170926000000000,
            showABTest: false,
            updateTimeOut: null
        },

        defaultSearchConfig: {
            coupons: {
                active: true,
                designType: {
                    expanded: true,
                    collapsed: false
                }
            },
            offers: {
                active: true,
                designType: {
                    expanded: true,
                    collapsed: false
                }
            }
        },

        couponsShowInTabConfig: {
            couponsWithCode: {
                showInTab: "INACTIVE",
                close: true,
                closeAfter: 5

            },
            couponsWithoutCode: {
                showInTab: "ACTIVE",
                close: false,
                closeAfter: null

            }
        },

        tooltipsConfigs: {
            settings: false
        },
        defaultEmptySearch: {
            offers: {
                url: "",
                image: "",
                domain: "",
                domainName: "",
                trySearchIn: "",
                searchIn: ""
            },
            coupons: {
                url: "",
                image: "",
                domain: "",
                domainName: "",
                trySearchIn: "",
                searchIn: ""
            }
        },
        afsrcDetector: {
            blockref: null,
            ciuvo_rex: null,
            SESSION_TIMEOUT: null,
            NEW_EVENT_THRESHOLD_TIME: null,
            TAB_EVENT_EXPIRATION_TIME: null
        },
        /**
         * Restore rules from cache
         * @return {void}
         */
        restore: function () {
            var rules = AvastWRC.storageCache.get("Shepherd");
            self.rules = JSON.parse(rules);
            self.rules = self.updateCouponsShowConfig(self.rules);
            self.rules = self.updateEmptySearchConfig(self.rules);
            self.rules.searchConfigs = (rules && rules.searchConfigs) ? rules.searchConfigs : { Configs: self.defaultSearchConfig };
            console.log("Shepherd -> Restored: ", self.rules);
        },

        loadOnSuccess: function (rules, ttl) {
            let defRules = {
                expireTime: self.getNewExpirationTime(ttl || 86400),
                campaignId: (self.rules && self.rules.campaignId) ? self.rules.campaignId : "default",
                BarUISpecifics: (self.rules && self.rules.BarUISpecifics) ? self.rules.BarUISpecifics : null //not downloaded and not in cache (null)
            };

            if(rules){
                rules.expireTime = self.getNewExpirationTime(ttl || 86400);
                if(!rules.abtests || !rules.abtests.variant_id){
                    rules.campaignId = "default";
                }else{
                    rules.campaignId = rules.abtests.test_id+rules.abtests.variant_id;
                }   
            }
            else{
                rules = JSON.parse(JSON.stringify(defRules));
            }
            // do not use the search config from the server
            rules.searchConfigs = JSON.parse(JSON.stringify(self.rules.searchConfigs));
            self.rules = self.updateCouponsShowConfig(rules);
            self.rules = self.updateEmptySearchConfig(rules);
            console.log("Shepherd-> Response before being saved: "+ JSON.stringify(rules));
            self.save();            
        },

        /**
         * Generate the new expiration time based on ttl
         * @return expiration time 
         */
        getNewExpirationTime: function(ttl){
            var expireTime = parseInt(new Date().getTime())/1000 + parseInt(ttl);
            return expireTime;
        },
        /**
         * Return if the Ttl is still valid
         * @return true if still valid otherwise false
         */
        isValidTtl: function(){
            var now = parseInt(new Date().getTime())/1000;
            if(self.rules && self.rules.expireTime)
                return (self.rules.expireTime > now);
            else return false;
        },
        
        /**
         *  all the rules currently stored locally to cache
         * @return {void}
         */
        save: function () {
            AvastWRC.storageCache.save("Shepherd", JSON.stringify(self.rules));
            self.updateShepherdConfigs();
        },

        updateShepherdConfigs: function () {
            if(self.rules.updateTimeOut){
                clearTimeout(self.rules.updateTimeOut);
                self.rules.updateTimeOut = null;
            }
            self.rules.updateTimeOut = setTimeout(()=>{
                if (!self.rules.isValidTtl()) {
                    self.load();
                }
                self.updateShepherdConfigs();
            }, 86400000); // check if we need to update shepherd 24H timeout. (1000 * 60 * 60 * 24)
        },

        setBrowserCampaign: function () {
            return new Promise((resolve, reject) => {
                if (!(AvastWRC.Utils.getBrowserInfo().isAvast() && chrome.avast)) resolve(null);

                chrome.avast.getPref("install_channel", function (name, val) {
                    if (isNaN(val) || ((val + "").length > 4)) resolve(null);
                    AvastWRC.Shepherd.browserCampaign = val;
                    resolve(val);
                });
            });
        },

        browserCampaign: null
    };

    let self = AvastWRC.Shepherd;

}).call(this, AvastWRC, _);
/*******************************************************************************
 *
 *  AvastWRC Shepherd specifics for SP
 * 
 ********************************************************************************/
(function(_,Shepherd) {
    'use strict';
    _.extend(Shepherd,{
        /**
         * Get a individual rule based on the regexp defined in the rule
         * @param  {String} url Url of the site
         * @return {Object}     Rule object (default topBarRules object if no applicable rule was found)
         */
        getUIAdaptionRule: function (url) {
            if(!Shepherd.rules || !Shepherd.rules.BarUISpecifics) return null;

            var topBarRules = {
                rulesToApply: 0,
                specifics: []
            };

            var ui_specifics = (Shepherd.rules.BarUISpecifics.Configs) ? Shepherd.rules.BarUISpecifics.Configs : [];
            var styles = [], node = null, specific = null;
            for (var i = 0; i < ui_specifics.length; i++) {
                if (RegExp(ui_specifics[i].domainPattern).test(url)) {
                    styles = ui_specifics[i].styles;
                    for(let j=0; j>styles.length; j++){
                        node = styles[j];
                        if (AvastWRC.Utils.getBrowserInfo().getBrowser() === node.browser || node.browser === "ALL") {
                            if(node.specifics instanceof Array){
                                for(let k = 0; k < node.specifics.length; k++){
                                    specific = node.specifics[0];
                                    if(specific.styleName && specific.styleProperty){
                                        topBarRules.specifics.push({
                                            styleName: specific.styleName,
                                            styleProperty: specific.styleProperty,
                                            computedStyle: specific.computedStyle ? specific.computedStyle : null,
                                            dynamicValue: specific.dynamicValue ? specific.dynamicValue : null,
                                            dynamicOldValue: specific.dynamicOldValue ? specific.dynamicOldValue : ""
                                        });
                                        topBarRules.rulesToApply = specific.rulesToApply;
                                    }
                                }
                            }else {
                                specific = node.specifics;
                                if(specific.styleName && specific.styleProperty){
                                    topBarRules.specifics.push({
                                        styleName: specific.styleName,
                                        styleProperty: specific.styleProperty,
                                        computedStyle: specific.computedStyle ? specific.computedStyle : null,
                                        dynamicValue: specific.dynamicValue ? specific.dynamicValue : null,
                                        dynamicOldValue: specific.dynamicOldValue ? specific.dynamicOldValue : ""
                                    });
                                    topBarRules.rulesToApply = specific.rulesToApply;
                                }                               
                            }                            
                        }
                    }
                }
            }
            return topBarRules;
        },
        /**
         * ObcompaingId 
         * @param  {String} url Url of the site
         * @return {Object}     Rule object (default topBarRules object if no applicable rule was found)
         */
        getCampaing: function () {
             return {
                campaignId: (Shepherd.rules && Shepherd.rules.campaignId) ? Shepherd.rules.campaignId : "default"
            };           
        },

        getPowerUserConfig: function () {
            if(!Shepherd.rules || !Shepherd.rules.powerUser) return null;
            return Shepherd.rules.powerUser.Configs;
        },

        getIconBlinkAnimationConfig: function () {
            return Shepherd.rules && Shepherd.rules.spIconAnimation && Shepherd.rules.spIconAnimation.Configs ? Shepherd.rules.spIconAnimation.Configs : {
                icon: "common/ui/icons/logo-safeprice-128.png",
                color: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "#0CB754" : "#556688",
                times: 4,
                milliseconds: 230
            };
        },

        getIconBlinkingAnimationAfterCloseTooltip: function () {
            return Shepherd.rules && Shepherd.rules.spIconAnimationCloseTooltip && Shepherd.rules.spIconAnimationCloseTooltip.Configs ? Shepherd.rules.spIconAnimationCloseTooltip.Configs : {
                icon: "common/ui/icons/logo-safeprice-128.png",
                color: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "#0CB754" : "#556688",
                times: 22,
                milliseconds: 230
            };
        },

		getHeartbeat: function () {       
            if(!Shepherd.rules || !Shepherd.rules.heartbeat) return 57600; // 16h
            return (Shepherd.rules.heartbeat.ttl) ? Shepherd.rules.heartbeat.ttl : 57600;
        },

        getRecruitmentConfig: function () {
            return Shepherd.rules && Shepherd.rules.recruitment ? Shepherd.rules.recruitment.Configs : null;
        },

        getNotificationsConfig: function () {
            let defaultNotificationsConfig = {
                redirectTTL: 86400,
                closeTTL: 1800
            };

            let notificationsConfig = (Shepherd.rules && Shepherd.rules.notifications && Shepherd.rules.notifications.configs) ? Shepherd.rules.notifications.configs : defaultNotificationsConfig;

            // we need this check becuase of the update
            if(!notificationsConfig.closeTTL){
                notificationsConfig.closeTTL = defaultNotificationsConfig.closeTTL;
            }
            return notificationsConfig;
        },

        getSocialConfig: function () {
            return Shepherd.rules && Shepherd.rules.socialSharing && Shepherd.rules.socialSharing.Configs || false;
        },

        getAnimationsConfig: function () {
            return Shepherd.rules && Shepherd.rules.animations || false;
        },

        getIgnoredTabs: function () {
            return Shepherd.rules && Shepherd.rules.ignoreTabs && Shepherd.rules.ignoreTabs.configs ? Shepherd.rules.ignoreTabs.configs : false;
        },
        updateEmptySearchConfig: function (rules) {
            if(!rules){
                return {emptySearch: {Configs: Shepherd.defaultEmptySearch}};
            } 
            if(!rules.emptySearch || !rules.emptySearch.Configs){
                rules.emptySearch = {Configs: Shepherd.defaultEmptySearch};
                return rules;
            }
            if(!rules.emptySearch.Configs.offers){
                rules.emptySearch.Configs.offers = {Configs: Shepherd.defaultEmptySearch.offers};
            }
            if(!rules.emptySearch.Configs.coupons){
                rules.emptySearch.Configs.coupons = {Configs: Shepherd.defaultEmptySearch.coupons};
            }

            rules.emptySearch.Configs.offers.trySearchIn = "";
            rules.emptySearch.Configs.offers.searchIn = "";
            rules.emptySearch.Configs.coupons.trySearchIn = "";
            rules.emptySearch.Configs.coupons.searchIn = "";

            if(rules.emptySearch.Configs.offers.domain){
                rules.emptySearch.Configs.offers.trySearchIn = AvastWRC.bs.getLocalizedString("spTrySearchInAmazon", [rules.emptySearch.Configs.offers.domain]);
            }
            if(rules.emptySearch.Configs.offers.domainName){
                rules.emptySearch.Configs.offers.searchIn = AvastWRC.bs.getLocalizedString("spSearchInAmazon", [rules.emptySearch.Configs.offers.domainName]);
            }
            if(rules.emptySearch.Configs.coupons.domain){
                rules.emptySearch.Configs.coupons.trySearchIn = AvastWRC.bs.getLocalizedString("spTrySearchDeals", [rules.emptySearch.Configs.coupons.domain]);
            }
            if(rules.emptySearch.Configs.coupons.domainName){
                rules.emptySearch.Configs.coupons.searchIn = AvastWRC.bs.getLocalizedString("spSearchInAmazon", [rules.emptySearch.Configs.coupons.domainName]);
            }
            return rules;

        },

        getEmptySearchConfig: function () {
            if(!Shepherd.rules || !Shepherd.rules.emptySearch || !Shepherd.rules.emptySearch.Configs){
                return Shepherd.defaultEmptySearch;
            } 
            return Shepherd.rules.emptySearch.Configs;
        },

        getSearchConfig: function () {
            if(!Shepherd.rules || !Shepherd.rules.searchConfigs || !Shepherd.rules.searchConfigs.Configs) return Shepherd.defaultSearchConfig;
            return Shepherd.rules.searchConfigs.Configs;
        },
        isSearchActive: function(){
            if(Shepherd.rules && Shepherd.rules.searchConfigs && Shepherd.rules.searchConfigs.Configs && 
               ((Shepherd.rules.searchConfigs.Configs.coupons && Shepherd.rules.searchConfigs.Configs.coupons.active) || 
                (Shepherd.rules.searchConfigs.Configs.offers && Shepherd.rules.searchConfigs.Configs.offers.active))){
                return true;
            }
            return false;
        },
        getBurgerSendInfo: function () {
            var defBurgerSendInfo = {
				BATCH_MAX_MESSAGES: null,
                SEND_INTERVAL_TIME: null,
                EVENT_MAX_RESEND: null,
				HEARTBEAT_EVENT_MAX_RESEND: null
            };
            if(Shepherd.rules && Shepherd.rules.burgerSendInfo && Shepherd.rules.burgerSendInfo.Configs){
                if(Shepherd.rules.burgerSendInfo.Configs.BATCH_MAX_MESSAGES){
                    defBurgerSendInfo.BATCH_MAX_MESSAGES = Shepherd.rules.burgerSendInfo.Configs.BATCH_MAX_MESSAGES;
                }
                if(Shepherd.rules.burgerSendInfo.Configs.SEND_INTERVAL_TIME){
                    defBurgerSendInfo.SEND_INTERVAL_TIME = Shepherd.rules.burgerSendInfo.Configs.SEND_INTERVAL_TIME;
                }
                if(Shepherd.rules.burgerSendInfo.Configs.EVENT_MAX_RESEND){
                    defBurgerSendInfo.EVENT_MAX_RESEND = Shepherd.rules.burgerSendInfo.Configs.EVENT_MAX_RESEND;
                }
                if(Shepherd.rules.burgerSendInfo.Configs.HEARTBEAT_EVENT_MAX_RESEND){
                    defBurgerSendInfo.HEARTBEAT_EVENT_MAX_RESEND = Shepherd.rules.burgerSendInfo.Configs.HEARTBEAT_EVENT_MAX_RESEND;
                }
            }
            return defBurgerSendInfo;
        },
        updateCouponsShowConfig: function(rules){
            if(!rules)return Shepherd.couponsShowInTabConfig;

            if(!rules.couponsShow || !rules.couponsShow.Configs){
                rules.couponsShow = {Configs: Shepherd.couponsShowInTabConfig};
                return rules;
            }
            if(!rules.couponsShow.Configs.couponsWithCode){
                rules.couponsShow.Configs.couponsWithCode = Shepherd.couponsShowInTabConfig.couponsWithCode;
            }
            if(!rules.couponsShow.Configs.couponsWithoutCode){
                rules.couponsShow.Configs.couponsWithoutCode = Shepherd.couponsShowInTabConfig.couponsWithoutCode;
            }
            return rules;
            
        },
        getCouponsShowConfig: function () {
            if(!Shepherd.rules || !Shepherd.rules.couponsShow || !Shepherd.rules.couponsShow.Configs) return Shepherd.couponsShowInTabConfig;
            
            return Shepherd.rules.couponsShow.Configs;
        },
        tooltips: function(){
            if(!Shepherd.rules || !Shepherd.rules.tooltips || !Shepherd.rules.tooltips.Configs) return Shepherd.tooltipsConfigs;
            
            return Shepherd.rules.tooltips.Configs;
        },
        getAfsrcDetectorConfig: function(){
            if(!Shepherd.rules || !Shepherd.rules.afsrcDetector || !Shepherd.rules.afsrcDetector.Configs) return Shepherd.afsrcDetector;
            var afsrcDetector = Shepherd.afsrcDetector;
            if(Shepherd.rules.afsrcDetector.Configs.blockref){
                afsrcDetector.blockref = [];
                Shepherd.rules.afsrcDetector.Configs.blockref.forEach(blockref => {
                    afsrcDetector.blockref.push(new RegExp(blockref));
                });
            }
            if(Shepherd.rules.afsrcDetector.Configs.ciuvo_rex){
                afsrcDetector.ciuvo_rex = [];
                Shepherd.rules.afsrcDetector.Configs.ciuvo_rex.forEach(ciuvo_rex => {
                    afsrcDetector.ciuvo_rex.push(new RegExp(ciuvo_rex));
                });
            }
            if(Shepherd.rules.afsrcDetector.Configs.SESSION_TIMEOUT)
                afsrcDetector.SESSION_TIMEOUT = Shepherd.rules.afsrcDetector.Configs.SESSION_TIMEOUT;
            
            if(Shepherd.rules.afsrcDetector.Configs.NEW_EVENT_THRESHOLD_TIME)
                afsrcDetector.NEW_EVENT_THRESHOLD_TIME = Shepherd.rules.afsrcDetector.Configs.NEW_EVENT_THRESHOLD_TIME;

            if(Shepherd.rules.afsrcDetector.Configs.TAB_EVENT_EXPIRATION_TIME)
                afsrcDetector.TAB_EVENT_EXPIRATION_TIME = Shepherd.rules.afsrcDetector.Configs.TAB_EVENT_EXPIRATION_TIME;
           
            return afsrcDetector;
        }
    });

    let self = Shepherd;
}).call(this, _, AvastWRC.Shepherd);

/*******************************************************************************
 *
 *  ende AvastWRC Shepherd
 */


(function (AvastWRC, _) {
    'use strict';
    AvastWRC.ASDetector = {

        
    init: function() {
        var afsrcConfig = {
            blockref: null,
            ciuvo_rex: null,
            SESSION_TIMEOUT: null,
            NEW_EVENT_THRESHOLD_TIME: null,
            TAB_EVENT_EXPIRATION_TIME: null
        };

        if (AvastWRC && AvastWRC.Shepherd) {
            afsrcConfig = AvastWRC.Shepherd.getAfsrcDetectorConfig();
        }

        self.pastEvents = {};
        self.listeners = [];
        self.blockref = afsrcConfig.blockref || [new RegExp('\.*&afsrc=1|\\?afsrc=1'),
            new RegExp('7eer\.net'),
            new RegExp('ad\.zanox\.com'),
            new RegExp('affiliate\.buy\.com'),
            new RegExp('affiliates\.market-ace\.com'),
            new RegExp('awin1\.com'),
            new RegExp('click\.linksynergy\.com'),
            new RegExp('clickserve\.cc-dt\.com'),
            new RegExp('clkde\.tradedoubler\.com'),
            new RegExp('clk\.tradedoubler\.com'),
            new RegExp('clkuk\.tradedoubler\.com'),
            new RegExp('dtrk4\.com'),
            new RegExp('evyy\.net'),
            new RegExp('gan\.doubleclick\.net'),
            new RegExp('linksynergy\.onlineshoes\.com'),
            new RegExp('linksynergy\.walmart\.com'),
            new RegExp('ojrq\.net'),
            new RegExp('operator\.savings\.int'),
            new RegExp('partners\.webmasterplan\.com'),
            new RegExp('prf\.hn'),
            new RegExp('rover\.ebay\.com'),
            new RegExp('scripts\.affiliatefuture\.com'),
            new RegExp('send\.onenetworkdirect\.net'),
            new RegExp('tc\.tradetracker\.net'),
            new RegExp('track\.moreniche\.com'),
            new RegExp('track\.webgains\.com'),
            new RegExp('.*\.belboon\.de'),
            new RegExp('.*\.savoocompare\.co\.uk'),
            new RegExp('.*\.anrdoezrs\.net'),
            new RegExp('.*\.avantlink\.com'),
            new RegExp('.*\.awin1\.com'),
            new RegExp('.*\.clixGalore\.com'),
            new RegExp('.*\.dpbolvw\.net'),
            new RegExp('.*\.gopjn\.com'),
            new RegExp('.*\.jdoqocy\.com'),
            new RegExp('.*\.kqzyfj\.com'),
            new RegExp('.*\.linkconnector\.com'),
            new RegExp('.*\.mysupermarket\.co\.uk'),
            new RegExp('.*\.paidonresults\.net'),
            new RegExp('.*\.pjatr\.com'),
            new RegExp('.*\.pjtra\.com'),
            new RegExp('.*\.pntrac\.com'),
            new RegExp('.*\.pntra\.com'),
            new RegExp('.*\.pntrs\.com'),
            new RegExp('.*\.rent\.com'),
            new RegExp('.*\.shareasale\.com'),
            new RegExp('.*\.tkqlhce\.com'),
            new RegExp('.*\.zanox-affiliate\.de'),
            new RegExp('.*savings\.com'),
            new RegExp('.*affiliate\.rakuten\.com')
        ];

        self.ciuvo_rex = afsrcConfig.ciuvo_rex || [new RegExp('.*ciuvo\.com'), // ciuvo
            new RegExp('.*localhost:8002'), // ciuvo
            new RegExp('cacp\.herokuapp\.com'), // comprigo
            new RegExp('comprigo\.com'), // comprigo
            new RegExp('a\.aclk\.pw'), // affilio
        ];

        self.NEW_EVENT_THRESHOLD_TIME = afsrcConfig.NEW_EVENT_THRESHOLD_TIME || 1500;
        self.SESSION_TIMEOUT = afsrcConfig.SESSION_TIMEOUT || 60 * 60 * 1000; // 1 hour
        self.TAB_EVENT_EXPIRATION_TIME = afsrcConfig.TAB_EVENT_EXPIRATION_TIME || self.SESSION_TIMEOUT + 10 * 1000; // 10 seconds

        console.log("DETECTOR initialized: blockref" , self.blockref, 
                    " ciuvo_rex: ", self.ciuvo_rex, 
                    " NEW_EVENT_THRESHOLD_TIME: ", self.NEW_EVENT_THRESHOLD_TIME, 
                    " SESSION_TIMEOUT: " , self.SESSION_TIMEOUT,
                    " TAB_EVENT_EXPIRATION_TIME: ", self.TAB_EVENT_EXPIRATION_TIME);
    },

    /**
     * Add a new navigation event of the tab's main frame.
     * 
     * @param tabId
     *            the tabId for this navigation event (required)
     * @param url
     *            the url for this navigation event (required)
     * @param requestId
     *            the request-id if available. It helps recognizing multiple
     *            urls which actually belong to one navigation event because
     *            of redirects. (optional)
     * @param timestamp
     *            the timestamp in ms of the navigation event. It is usefull
     *            for recognizing events which belong together (optional).
     * @param main_page_changed
     *            only used in firefox because there a workaround to recognize main-page changes
     *            is needed
     * @returns true if the current chain of navigation events has been
     *          marked as affiliate source. False otherwise.
     */
    onNavigationEvent: function(tabId, url, requestId, timestamp, main_page_changed) {
        timestamp = timestamp || Date.now();

        var lastEvent = self.getLastEvent(tabId);
        var newEvent = self.isNewEvent(lastEvent, url, requestId, timestamp, main_page_changed);

        // update timestamp & hostname
        lastEvent.timestamp = timestamp;
        lastEvent.hostname = AvastWRC.bal.getHostFromUrl(url);
        if (newEvent || !lastEvent.isFromCiuvo) {
            lastEvent.isFromCiuvo = self.isCiuvoEvent(url);
        }

        if (lastEvent.isFromCiuvo) {
            // ignore afsrc if ciuvo itself triggered the coupon-click
            lastEvent.isAfsrc = false;
        } else if (!lastEvent.isAfsrc) {
            lastEvent.isAfsrc = self.ifAfsrcEvent(url);
        }
        console.log("DETECTOR -> CIUVO: onBeforeRedirect", "tabId: ", tabId, "url: ", url, "lastEvent: ", lastEvent, "newEvent: ", newEvent);
        return lastEvent.isAfsrc;
    },

    /**
     * Whether the event originated with an clickout from ciuvo
     */
    isCiuvoEvent: function(url) {
        for (var i = 0; i < self.ciuvo_rex.length; ++i) {
            if (self.ciuvo_rex[i].exec(url)) {
                return true;
            }
        }
        return false;
    },

    /**
     * Whether the event originated with an clickout from another affiliate source
     */
    ifAfsrcEvent: function(url) {
        for (var i = 0; i < self.blockref.length; i++) {
            if (self.blockref[i].exec(url)) {
                return true;
            }
        }
        return false;
    },

    /**
     * @returns dictionary
     */
    getSessionBlockList: function() {
        var sbl = window.localStorage.getItem("__ciuvo__afsrc__sbl");

        if (sbl && typeof sbl === "string") {
            sbl = JSON.parse(sbl);
        }

        if (!sbl || typeof sbl !== "object") {
            // recover gracefully
            sbl = {};
            self.storeSessionBlockList(sbl);
        }

        return sbl;
    },

    /**
     * @param sbl
     *          dictionary
     */
    storeSessionBlockList: function(sbl) {
        window.localStorage.setItem("__ciuvo__afsrc__sbl", JSON.stringify(sbl));
    },

    /**
     * @param hostname
     *          the hostname of the request
     */
    addToSessionBlockList: function(hostname) {
        var blockList = self.getSessionBlockList();
        blockList[hostname] = Date.now();
        self.storeSessionBlockList(blockList);
    },

    /**
     * @param hostname
     *          the hostname of the request
     * @returns true
     *         if it is on the blocklist, resets session timestamp
     **/
    isOnSessionBlockList: function(hostname) {
        var blockList = self.getSessionBlockList(),
            timestamp = blockList[hostname];

        if (!timestamp) {
            // "The host <" + hostname + "> is not on session block list."
            return false;
        }

        var now_ts = Date.now();

        if (timestamp + self.SESSION_TIMEOUT > now_ts) {
            // "The host <" + hostname + "> is on session block list."
            return true;
        }

        // cleanup expired timestamp
        delete blockList[hostname];
        self.storeSessionBlockList(blockList);
        return false;
    },

    /**
     * decide whether it is a new event or not
     * @param lastEvent
     *            the last Event recorded for this tab
     * @param url
     *            the url for this navigation event (required)
     * @param requestId
     *            the request-id if available. It helps recognizing multiple
     *            urls which actually belong to one navigation event because
     *            of redirects. (optional)
     * @param timestamp
     *            the timestamp in ms of the navigation event. It is usefull
     *            for recognizing events which belong together (optional).
     * @param main_page_changed
     *            only used in firefox because there a workaround to recognize main-page changes
     *            is needed
     * @returns true if this is a new navigation event or part of the same clickout
     **/
    isNewEvent: function(lastEvent, url, requestId, timestamp, main_page_changed) {
        console.log("DETECTOR: isNewEvent", "lastEvent: ", lastEvent, "url: ", url, "requestId: ", requestId, "timestamp: ", timestamp, "main_page_changed: ", main_page_changed);
        // try to detect if this is a new navigation event
        if (typeof requestId !== 'undefined') {
            if (requestId === lastEvent.requestId) {
                return false;
            }
        }

        // those damn JS redirects make requestId unreliable
        var delta = timestamp - lastEvent.timestamp;
        console.log("DETECTOR: delta ", delta, "NEW_EVENT_THRESHOLD_TIME: ", self.NEW_EVENT_THRESHOLD_TIME, "url: ", url);
        if (delta < self.NEW_EVENT_THRESHOLD_TIME) {
            return false;
        }

        if (lastEvent.isAfsrc) {
            if (main_page_changed !== undefined) {
                if (!main_page_changed) {
                    return false;
                }
            } else if ((AvastWRC.bal.getHostFromUrl(url) === lastEvent.hostname) && self.ifAfsrcEvent(url)) {
                // still on the same event
                return false;
            }
        }

        // create a new event if one has been detected
        lastEvent.isAfsrc = false;
        lastEvent.isFromCiuvo = false;
        lastEvent.requestId = requestId;

        return true;
    },

    /**
     * be nice, clean up a bit after ourselves
     */
    cleanupExpiredTabs: function() {
        now = Date.now();
        for (var tabId in this.pastEvents) {
            if (self.pastEvents.hasOwnProperty(tabId)) {
                var event = self.pastEvents[tabId];
                if ((now - event.timestamp) > self.TAB_EVENT_EXPIRATION_TIME) {
                    delete self.pastEvents[tabId];
                }
            }
        }
    },

    /**
     * @param tabId
     *            the tab's id
     * @returns the last navigation event or an empty one
     */
    getLastEvent: function(tabId) {
        var lastEvent = self.pastEvents[tabId];
        if (typeof lastEvent === 'undefined') {
            lastEvent = {
                isAfsrc: false,
                requestId: undefined,
                isFromCiuvo: false,
                timestamp: 0,
                hostname: undefined
            };
            self.pastEvents[tabId] = lastEvent;
        }
        return lastEvent;
    },

    /**
     * @param tabId the id of the tab to be checked for the affiliate source
     * @param cleanup will clear the affiliate source flag since displays are allowed
     *          on subsequent requests
     * @returns true if the current chain of navigation events has been
     *          marked as affiliate source. False otherwise.
     */
    isAffiliateSource: function(tabId, cleanup) {
        var lastEvent = self.getLastEvent(tabId);

        // add hostname to session blocklist / check if it is on one
        if (lastEvent.isAfsrc) {
            self.addToSessionBlockList(lastEvent.hostname);
        } else if (self.isOnSessionBlockList(lastEvent.hostname)) {
            return true;
        }

        if (cleanup) {
            self.cleanupExpiredTabs();
        }

        return lastEvent.isAfsrc;
    },
    updateConfig: function(blockref, ciuvoRex, sessionTimeOut, newEventThresholdTime, tabEventExpirationTime) {
        self.blockref = blockref || self.blockref;

        self.ciuvo_rex = ciuvoRex || self.ciuvo_rex;

        self.NEW_EVENT_THRESHOLD_TIME = newEventThresholdTime || self.NEW_EVENT_THRESHOLD_TIME;

        self.SESSION_TIMEOUT = sessionTimeOut || self.SESSION_TIMEOUT; // 1 hour

        self.TAB_EVENT_EXPIRATION_TIME = tabEventExpirationTime || self.TAB_EVENT_EXPIRATION_TIME; // 10 seconds
    },
};

let self = AvastWRC.ASDetector;

}).call(this, AvastWRC, _);

/*******************************************************************************
 *
 *  AvastWRC Yes/No
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    AvastWRC.YesNo = {
        init: function () {
            this.updateStoredValue();
        },
        updateStoredValue: function () {
            this.updateValue();
        },
        updateValue: function () {
            let value = AvastWRC.storageCache.get(this.keyName) || {};
            if(typeof value === "string"){
                value = JSON.parse(value);
            }
            if (value.askedTTL) {
                this.powerUserData = value;
            } else {
                this.setInitialConfig();
            }
        },
        isValidDelay: function (delay, ttlToCompare) {
            return ((parseInt(new Date().getTime()) / 1000) - ttlToCompare) > delay;
        },
        setInitialConfig: function () {
            let powerUserConfig = AvastWRC.Shepherd.getPowerUserConfig();

            if (powerUserConfig && powerUserConfig.delays) this.powerUserData.serverConfig = powerUserConfig;

            this.saveData();
        },
        isPowerUser: function () {
            return this.currentLanguageIsSupported() && 
                this.rating[AvastWRC.Utils.getBrowserInfo().getBrowser()] && 
                !this.userAlreadyProvidedFeedback() && 
                this.userHasInteractEnough() && 
                this.isTimeToAsk();
        },
        userAlreadyProvidedFeedback: function () {
            return this.powerUserData.reactions.positive || this.powerUserData.reactions.negative;
        },
        userHasInteractEnough: function () {
            return (daysSinceInstallation() > this.powerUserData.serverConfig.minimumTime) && (this.powerUserData.interactions.length >= this.powerUserData.serverConfig.minimumInteracionts);

            function daysSinceInstallation() {
                let date = AvastWRC.CONFIG.InstallDate.split(" ")[0], millisecondsOfOneDay = 86400000;
                return Math.round((new Date().getTime() / millisecondsOfOneDay) -
                    (new Date(`${date.split("/")[0]}/${parseInt(date.split("/")[1]) + 1}/${date.split("/")[2]}`).getTime() / millisecondsOfOneDay));
            }
        },
        isTimeToAsk: function () {
            let validTTLFound = false,
                delaysLeftToCheck = this.powerUserData.serverConfig.delays.slice(this.powerUserData.askedTTL.standard.length);

            for (let i = 0; i < delaysLeftToCheck.length; i++) {
                if (this.isValidDelay(delaysLeftToCheck[i], this.powerUserData.askedTTL.standard.slice(-1)[0] || 0)) {
                    validTTLFound = true;
                    break;
                }
            }

            return validTTLFound && this.askLaterValid();
        },
        getFeedBackInfo: function () {
            return {
                askForFeedback: this.isPowerUser()
            };
        },
        askLaterValid: function () {
            let askLaterValid = !this.powerUserData.askLaterEnabled || (this.isValidDelay(this.powerUserData.serverConfig.askLaterDelay * 86400, this.powerUserData.askedTTL.askLater)),
                self = this;

            if (askLaterValid) updateAskLater();

            return askLaterValid;

            function updateAskLater() {
                self.powerUserData.askedTTL.askLater = 0;
                self.powerUserData.askLaterEnabled = false;
                self.saveData();
            }
        },
        getHowToImproveLink: function () {
            return AvastWRC.Query.CONST.SAFESHOP_FEEDBACK_SERVER[AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "AVAST" : "AVG"];
        },
        userAsked: function () {
            this.powerUserData.askedTTL.standard.push(Math.round(new Date().getTime() / 1000));
            this.saveData();
        },
        negativeFeedback: function () {
            this.config.powerUserData.reactions.negative = true;
            this.saveData();
        },
        positiveFeedback: function () {
            this.config.powerUserData.reactions.positive = true;
            this.saveData();
        },
        saveData: function () {
            AvastWRC.storageCache.save(this.keyName, JSON.stringify(this.powerUserData));
        },
        enableAskLater: function () {
            this.powerUserData.askLaterEnabled = true;
            this.powerUserData.reactions.askLater = true;
            this.powerUserData.askedTTL.askLater = Math.round(new Date().getTime() / 1000);
            this.powerUserData.askedTTL.standard.pop(); // It removes the ttl coming from on shown
            this.saveData();
        },
        getRatingLink: function () {
            return this.rating[AvastWRC.Utils.getBrowserInfo().getBrowser()] && this.rating[AvastWRC.Utils.getBrowserInfo().getBrowser()].rateLinks[AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "AVAST" : "AVG"]
                .replace(new RegExp('__BROWSER_LANGUAGE__', 'g'), ABEK.locale.getBrowserLang());
        },
        currentLanguageIsSupported: function () {
            return this.ratingLanguagesSupported.indexOf(ABEK.locale.getBrowserLang()) >= 0;
        },
        getTemplateData: function () {
            return {
                strings: AvastWRC.bal.utils.loadLocalizedStrings({}, this.config.template.strings),
                images: AvastWRC.bal.utils.getLocalImageURLs({}, this.config.template.images),
                isAvast: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? true : false
            };
        },
        registerInteraction: function (tab) {
            let self = this;
            if (this.powerUserData.interactions.length > this.powerUserData.serverConfig.minimumInteracionts) return;

            addInteraction(tab);

            function addInteraction(tab) {
                let domain = AvastWRC.bal.getDomainFromUrl(tab.url), tabId = tab.id, index = domain + tabId;

                if ((self.powerUserData.interactions.length > self.powerUserData.serverConfig.minimumInteracionts) || 
                    (self.powerUserData.interactions.indexOf(index) >= 0))
                    return;

                self.powerUserData.interactions.push(index);
                self.saveData();
            }
        },
        negativeFeedbackDone: function () {
            this.openFeedbackPageInNewTab(this.getHowToImproveLink()).then(() => {
                this.powerUserData.reactions.negative = true;
                this.saveData();
            });
        },
        positiveFeedbackDone: function () {
            this.openFeedbackPageInNewTab(this.getRatingLink()).then(() => {
                this.powerUserData.reactions.positive = true;
                this.saveData();
            });
        },
        openFeedbackPageInNewTab: function (link) {
            return new Promise((resolve, reject) => {
                AvastWRC.bs.openInNewTab(link, function (newTab) {
                    resolve();
                });
            });
        },
        keyName: "YesNo",
        rating: {
            "CHROME": {
                rateLinks: {
                    "AVG": "https://chrome.google.com/webstore/detail/avg-safeprice/mbckjcfnjmoiinpgddefodcighgikkgn/reviews?hl=__BROWSER_LANGUAGE__",
                    "AVAST": "https://chrome.google.com/webstore/detail/avast-safeprice/eofcbnmajmjmplflapaojjnihcjkigck/reviews?hl=__BROWSER_LANGUAGE__"
                }
            },
            "FIREFOX": {
                rateLinks: {
                    "AVG": "https://addons.mozilla.org/__BROWSER_LANGUAGE__/firefox/addon/avg-safeprice/reviews/add",
                    "AVAST": "https://addons.mozilla.org/__BROWSER_LANGUAGE__/firefox/addon/avast-safeprice/reviews/add"
                }
            },
            "OPERA": {
                rateLinks: {
                    "AVG": false,
                    "AVAST": "https://auth.opera.com/account/login?return_url=https://addons.opera.com/__BROWSER_LANGUAGE__/extensions/details/avast-safeprice/?display=__BROWSER_LANGUAGE__&service=addons"
                }
            }
        },
        ratingLanguagesSupported: ["en", "fr", "de", "ru", "pt", "es"],
        powerUserData: {
            serverConfig: {
                delays: [86400, 172800, 259200],
                minimumTime: 21,
                askLaterDelay: 60,
                minimumInteracionts: 3
            },
            askedTTL: {
                standard: [],
                askLater: 0
            },
            reactions: {
                positive: false,
                negative: false,
                askLater: false
            },
            interactions: [],
            askLaterEnabled: false
        },
        config: {
            template: {
                strings: [
                    "safePriceEnjoyQuestion_Avast", "safePriceEnjoyQuestion_AVG",
                    "sasGladYouLike", "sasSorry", "sasWhatToDo",
                    "safePriceLeaveRating", "sasAnswerYes", "sasAnswerNo",
                    "safePriceAskMeLater", "sasfeedback", "sasRate"
                ],
                images: {
                    logoSP32x32: "logo-safe-price-32.png",
                    positiveFeedback: "img-positive.png",
                    negativeFeedback: "img-negative.png",
                    closeIcon: "sp-settings-close.png"
                }
            }
        }
    };

}).call(this, AvastWRC, _);

/*******************************************************************************
 *
 *  AvastWRC Social
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    AvastWRC.Social = {
        init: function () {            
            this.updateStoredValue();
        },
        updateStoredValue: function () {
            this.updateValue();
        },
        alignWithServer: function (value) {
            let socialConfig = AvastWRC.Shepherd.getSocialConfig(), result = JSON.parse(JSON.stringify(value));

            if (socialConfig) {
                for (let key in value.serverConfig) {
                    result.serverConfig[key] = socialConfig[key];
                }
            }

            return result;
        },
        updateValue: function () {
            let value = AvastWRC.storageCache.get(this.config.keyName) || "{}";
            if(typeof value === "string"){
                value = JSON.parse(value);
            }
            if (value.interactionsTTL) {
                this.config.socialData = this.alignWithServer(value);
            } else {
                this.setInitialConfig();
            }

            this.saveData();
        },
        setInitialConfig: function () {
            let socialConfig = AvastWRC.Shepherd.getSocialConfig();

            if (socialConfig) this.config.socialData.serverConfig = socialConfig;
        },
        shareOnFb: function () {
            AvastWRC.bs.openInNewTab(`${this.config.sharer.fb.url}?u=${encodeURIComponent(this.getFbLinkToShare())}`);
            this.addInteraction();
        },
        shareOnTttr: function () {
            AvastWRC.bs.openInNewTab(`${this.config.sharer.tttr.url}?url=${encodeURIComponent(this.getTttrLinkToShare())}`);
            this.addInteraction();
        },
        getFbLinkToShare: function () {
            return this.config.sharer.fb.urlToShare[AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "AVAST" : "AVG"];
        },
        getTttrLinkToShare: function () {
            return this.config.sharer.tttr.urlToShare[AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "AVAST" : "AVG"];
        },
        getTemplateData: function () {
            this.config.templateData.loaded = this.config.templateData.loaded || loadTemplateData();

            return this.config.templateData.loaded;

            function loadTemplateData() {
                return {
                    strings: AvastWRC.bal.utils.loadLocalizedStrings({}, AvastWRC.Social.config.templateData.strings),
                    images: AvastWRC.bal.utils.getLocalImageURLs({}, AvastWRC.Social.config.templateData.images)
                };
            }
        },
        isPowerSocialUser: function () {
            return AvastWRC.YesNo.userHasInteractEnough();
        },
        getDisplayInfo: function (data) {
            let isPowerSocialUser = this.isPowerSocialUser() || false;

            return {
                isPowerSocialUser: isPowerSocialUser,
                showInTop: isPowerSocialUser && this.interactionDelayIsValid(),
                showInBottomOffers: isPowerSocialUser && ((data.producstLength >= this.config.displayInfo.minimumOffers) || (data.accommodationsLength >= this.config.displayInfo.minimumOffers)),
                showInBottomCoupons: isPowerSocialUser && (data.couponsLength >= this.config.displayInfo.minimumCoupons)
            };
        },
        saveData: function () {
            AvastWRC.storageCache.save(this.config.keyName, JSON.stringify(this.config.socialData));
        },
        interactionDelayIsValid: function () {
            let self = this;

            return ((new Date().getTime() / 1000) - getLastInteractionTTL()) > (this.config.socialData.serverConfig.delay * 3600 * 24);

            function getLastInteractionTTL() {
                return self.config.socialData.interactionsTTL.length ? self.config.socialData.interactionsTTL.slice(-1).pop() : 0;
            }
        },
        addInteraction: function () {
            let currentDateInSeconds = Math.round((new Date().getTime() / 1000)),
                maximumInteractions = this.config.socialData.serverConfig.maximumInteractions;

            if (this.config.socialData.interactionsTTL.length < maximumInteractions) {
                this.config.socialData.interactionsTTL.push(currentDateInSeconds);
            } else {
                this.config.socialData.interactionsTTL = this.config.socialData.interactionsTTL.slice(maximumInteractions - 1).concat(currentDateInSeconds);
            }

            this.saveData();
        },
        config: {
            socialData: {
                serverConfig: {
                    maximumInteractions: 2,
                    delay: 60
                },
                interactionsTTL: []
            },
            sharer: {
                fb: {
                    url: "https://www.facebook.com/sharer/sharer.php",
                    urlToShare: {
                        AVAST: "https://www.avast.com/safeprice-new?utm_source=facebook&utm_campaign=social_sharing",
                        AVG: "https://www.avg.com/safeprice?utm_source=facebook&utm_campaign=social_sharing"
                    }
                },
                tttr: {
                    url: "https://twitter.com/share",
                    urlToShare: {
                        AVAST: "https://www.avast.com/safeprice-new?utm_source=twitter&utm_campaign=social_sharing",
                        AVG: "https://www.avg.com/safeprice?utm_source=twitter&utm_campaign=social_sharing"
                    }
                },
            },
            templateData: {
                strings: [
                    "spSocialShare",
                    "spSocialShareFb",
                    "spSocialSharetttr",
                    "avastAppName"
                ],
                images: {
                    fbLogo5x11: "fbLogo5x11.png",
                    fbLogo5x11HoverAndActive: "fbLogo5x11HoverAndActive.png",
                    tttrLogo5x11: "tttrLogo5x11.png",
                    tttrLogo5x11HoverAndActive: "tttrLogo5x11HoverAndActive.png",
                    closeIcon12x12: "close-icon-copy-8.png",
                },
                loaded: false
            },
            displayInfo: {
                minimumCoupons: 2,
                minimumOffers: 3
            },
            keyName: "Social"
        }
    };
    
}).call(this, AvastWRC, _);
/*******************************************************************************
 *
 *  AvastWRC Uninstall Service
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.Uninstall = {
        setUninstallURL: function () {
            let url = this.getUninstallURL();
            chrome.runtime.setUninstallURL(url, function () {
                console.log("UninstallURL has been updated", url);
            });
        },
        getUninstallURL: function () {
            let uninstallDataParameters = {
                action: this.config.defaultURLParameters.action,
                p_pro: this.config.defaultURLParameters.p_pro[AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? "AVAST" : "AVG"],
                p_elm: this.config.defaultURLParameters.p_elm,
                p_lng: ABEK.locale.getBrowserLang(),
                p_lid: AvastWRC.bal.getLandingPageCode(ABEK.locale.getBrowserLang(), ABEK.locale.getBrowserLocale()),
                p_hid: AvastWRC.CONFIG.GUID || AvastWRC.CONFIG.PLG_GUID,
                p_eguid: AvastWRC.CONFIG.PLG_GUID,
                p_its: this.installationDateToMilliseconds(AvastWRC.CONFIG.InstallDate),
                p_cmp: AvastWRC.Shepherd.getCampaing().campaignId,
                p_vep: AvastWRC.CONFIG.VERSION.split(".")[0],
                p_ves: AvastWRC.CONFIG.VERSION.split(".")[1],
                p_vbd: AvastWRC.CONFIG.VERSION.split(".")[2]
            };
            
            return `${this.config.uninstallURL}${AvastWRC.Utils.buildQueryString(uninstallDataParameters)}`;
        },
        /*
            @installationDate: input format 2018/0/22 16:22:14, output in milliseconds
         */
        installationDateToMilliseconds: function (installationDate) {
            let date = installationDate.split(" ")[0], time = installationDate.split(" ")[1];
            return (new Date(`${date.split("/")[0]}/${parseInt(date.split("/")[1]) + 1}/${date.split("/")[2]} ${time}`).getTime()).toString();
        },
        config: {
            uninstallURL: `https://ipm-provider.ff.avast.com:443/`,
            defaultURLParameters: {
                action: 2,
                p_pro: {
                    AVAST: 43,
                    AVG: 72
                },
                p_elm: 298
            }
        }
    };
    
}).call(this, AvastWRC, _);

/*******************************************************************************
 *
 *  AvastWRC Update Manager
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.UpdateManager = {
        init: function () {
            if(self.config.recoveredFromLocalStorage !== true){

                let data = AvastWRC.storageCache.get(self.config.localStorage.keyNames.main);
                let thisVersion = self.getCurrentVersion();
                if(data){
                    self.config.recoveredFromLocalStorage = true;
                    self.config.localStorage.value = JSON.parse(data);

                    let excluded = self.isUpdatePageExcludedForThisRelase(thisVersion);
                    if(self.config.localStorage.value.showNextTime && !excluded){
                        // self.showUpdatePage(); Disabled it by default for 19.4 and on
                    }
                    else{
                        let oldVersion = self.config.localStorage.value.currentVersion;
                        if(excluded && self.config.localStorage.value.currentVersion !== thisVersion){
                            self.config.localStorage.value.currentVersion = thisVersion;
                            self.config.localStorage.value.previousVersion = oldVersion;
                            self.config.localStorage.value.showNextTime = false;
                        }
                        else{
                            let change = self.isMajorVersionChange(self.config.localStorage.value.currentVersion, thisVersion);

                            console.log("UpdateManager: isMajorVersionChange result ", change, self.config.localStorage.value.currentVersion, thisVersion);

                            if(change && change.major){
                                self.config.localStorage.value.currentVersion = thisVersion;
                                self.config.localStorage.value.previousVersion = oldVersion;
                                self.config.localStorage.value.showNextTime = true;
                            }
                            if(change && change.minor){
                                self.config.localStorage.value.currentVersion = thisVersion;
                                self.config.localStorage.value.previousVersion = oldVersion;
                                self.config.localStorage.value.showNextTime = false;
                            }
                        }

                        self.saveValues();
                    }
                }
                else{
                    self.config.localStorage.value = {
                        currentVersion: thisVersion,
                        showNextTime: false
                    };
                    self.saveValues();
                }
            }
        },
        isMajorVersionChange: function (storageVersion, newVersion){
            let storageVersionValues = (storageVersion) ? storageVersion.split(".") : [];
            let newVersionValues = (newVersion) ? newVersion.split(".") : [];
            let change = {
                major: false,
                minor: false
            };
            if(parseInt(storageVersionValues[0]) < parseInt(newVersionValues[0]) || parseInt(storageVersionValues[1]) < parseInt(newVersionValues[1])){
                change.major = true;
            }
            else if(parseInt(storageVersionValues[2]) < parseInt(newVersionValues[2])){
                change.minor = true;
            }
            return change;
        },
        isUpdatePageExcludedForThisRelase: function (newVersion) {
            // let excluded = false;

            // if(typeof newVersion !== "string" || !self.config.excludedReleases)return excluded;

            // self.config.excludedReleases.forEach(v => {
            //     if(newVersion.indexOf(v) !== -1){
            //         excluded = true;
            //         return;
            //     }
            // });

            // return excluded;
            
            return true;

        },
        getCurrentVersion: function () {
            return chrome.runtime.getManifest().version;
        },
        getUpdatePageLink: function () {
            var link = (AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST) ?  self.config.updatePageLinkAvast : self.config.updatePageLinkAVG;
            return link.replace("__VERSION__", self.getCurrentVersion);
        },
        showUpdatePage: function () {
            let link = self.getUpdatePageLink();
            if (AvastWRC.Utils.getBrowserInfo().isAvast()){
                self.updatePageShown();
                return;
            }
            console.log("showUpdatePage: url",  link);
            AvastWRC.bs.tabExistsWithUrl("lp-safeprice-update", function (tab) {
                if (tab) {
                    AvastWRC.bs.tabRedirectAndSetActive(tab, link);
                } else {
                    AvastWRC.bs.openInNewTab(link);
                }
                self.updatePageShown();
            });
        },
        updatePageShown: function () {
            self.config.localStorage.value.showNextTime = false;
            self.saveValues();
        },
        saveValues: function () {
            console.log("UpdateManager: saveValues", self.config.localStorage.value);
            AvastWRC.storageCache.save(self.config.localStorage.keyNames.main, JSON.stringify(self.config.localStorage.value));
        },
        config: {
            localStorage: {
                keyNames: {
                    main: "update"
                },
                value: {}
            },
            excludedReleases: ["19.1.", "19.2", "19.3"],
            recoveredFromLocalStorage: false,
            updatePageLinkAvast: "https://www.avast.com/lp-safeprice-update-v2?version=__VERSION__&utm_medium=link&utm_source=safeprice&utm_campaign=safeprice-update",
            updatePageLinkAVG: "https://www.avg.com/en-ww/lp-safeprice-update-v3?version=__VERSION__&utm_medium=link&utm_source=safeprice&utm_campaign=safeprice-update"
        }
    };
    let self = AvastWRC.UpdateManager;
}).call(this, AvastWRC, _);

/*******************************************************************************
 *
 *  AvastWRC Notifications Manager Service
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    "use strict";
    AvastWRC.NotificationsManager = {
        init: function () {
            let self = this;

            let data = AvastWRC.storageCache.get(this.config.localStorageKey);
            if (data) {
                self.config.values = _.extend(self.config.values, JSON.parse(data));
            }
            this.saveValues();
        },
        setTrustedFakeDomain: function (domain) {
            this.config.values.trustedFakeDomain[domain] = true;
            this.saveValues();
        },
        setTrustedPhishingDomain: function (domain) {
            this.config.values.trustedPhishingDomain[domain] = true;
            this.saveValues();
        },
        isTrustedFakeShop: function (domain) {
           return this.config.values.trustedFakeDomain && this.config.values.trustedFakeDomain[domain] ? true : false;
        },
        isTrustedPhishing: function (domain) {
            return this.config.values.trustedPhishingDomain && this.config.values.trustedPhishingDomain[domain] ? true : false;
        },
        notificationsAreMinimized: function (domain) {
            return this.config.onlyInMemoryValues.minimized && !AvastWRC.NotificationsManager.isDomainInBlacklist(domain);
        },
        removeDomainFromBlacklist: function (domain) {
            let index = this.config.onlyInMemoryValues.domainsBlacklist.indexOf(domain);

            if (index >= 0) this.config.onlyInMemoryValues.domainsBlacklist.splice(index, 1);
        },
        addDomainToBlacklist: function (domain) {
            let index = this.config.onlyInMemoryValues.domainsBlacklist.indexOf(domain);

            if (index < 0) this.config.onlyInMemoryValues.domainsBlacklist.push(domain);
        },
        isDomainInBlacklist: function (domain) {
            return this.config.onlyInMemoryValues.domainsBlacklist.indexOf(domain) >= 0;
        },
        isDomainInSettingsWhiteList: function(urlDomain){
            if(!urlDomain) return false;

            var settings = AvastWRC.bal.settings.get();

            if( !settings || !urlDomain) return false;
            
            var poppupSettings = settings.userSPPoppupSettings;

            function checkList(item) {
                return ((item.indexOf(urlDomain) !== -1) || (urlDomain.indexOf(item) !== -1));
            }

            if (poppupSettings && poppupSettings.customList && poppupSettings.customList.whiteList.length > 0 && poppupSettings.customList.whiteList.findIndex(checkList) !== -1) {
                return true;
            }
            return false;
        },
        disableCategoryForDomain: function (domain, category) {
            let domainData = this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain] || {categoryFlag: 0, closedTimestamps: []};
            domainData.categoryFlag = domainData.categoryFlag + category;
            domainData.closedTimestamps[category] = (new Date()).getTime();
            this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain] = domainData;
            console.log(this.config.onlyInMemoryValues.categoriesBlackListedOnDomain, "after disable");
        },
        isCategoryAvailableForDomain: function (domain, notificationName) {
            let category = this.config.notificationsFlags[notificationName];
            let closedCategoryData = this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain] || {categoryFlag: 0, closedTimestamp: []};
            if( (closedCategoryData.categoryFlag & category) === category){
                let closedTime = closedCategoryData.closedTimestamps[category];
                let closedCategoryTtlIsValid = (closedTime) ? ((new Date()).getTime() - closedTime) < AvastWRC.Shepherd.getNotificationsConfig().closeTTL*1000 : false;
                if(closedCategoryTtlIsValid){
                    console.log("NotificationName: ", notificationName, "Category: ", category, " ----NOT AVAILABLE----", this.config.onlyInMemoryValues.categoriesBlackListedOnDomain);
                    return false;
                }else{
                    this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain].closedTimestamps[category] = null;
                    this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain].categoryFlag = this.config.onlyInMemoryValues.categoriesBlackListedOnDomain[domain].categoryFlag - category;
                    console.log("NotificationName: ", notificationName, "Category: ", category, " ----AVAILABLE (TTL expired)----", this.config.onlyInMemoryValues.categoriesBlackListedOnDomain);
                    return true;
                }
            }else{
                console.log("NotificationName: ", notificationName, "Category: ", category, " ----AVAILABLE (not blocked)----", this.config.onlyInMemoryValues.categoriesBlackListedOnDomain);
                return true;
            }
        },
        isTimeForRedirect: function (domain) {
            let currentTimeInMilliseconds = (new Date()).getTime(),
                redirectTTLIsValid = (currentTimeInMilliseconds - this.getTTLForRedirectUrl(domain)) >= (AvastWRC.Shepherd.getNotificationsConfig().redirectTTL * 1000);

            return redirectTTLIsValid;
        },
        getTTLForRedirectUrl: function (domain) {
            return this.config.values.redirectTTL[domain] || 0;
        },
        updateRedirectTTL: function (domain, dateInMilliseconds) {
            this.config.values.redirectTTL[domain] = dateInMilliseconds;
            this.cleanRedirectUrlTTl();
            this.saveValues();
        },
        cleanRedirectUrlTTl: function () {
            let currentTimeInMilliseconds = (new Date()).getTime();

            for (let key in  this.config.values.redirectTTL) {
                if ((currentTimeInMilliseconds - this.config.values.redirectTTL[key]) >= (AvastWRC.Shepherd.getNotificationsConfig().redirectTTL * 1000)) delete this.config.values.redirectTTL[key];
            }
        },
        saveValues: function () {
            AvastWRC.storageCache.save(this.config.localStorageKey, JSON.stringify(this.config.values));
        },
        isdisabledForRedirect: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "SPECIAL_DEALS") || 
                !AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.others.showAlways ||
                !AvastWRC.NotificationsManager.isTimeForRedirect(domain);
        },
        isdisabledForOffers: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "OFFERS") || 
                AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.offers.hide; 
        },
        couponHaveBeenShowedInDomain: function (domain) {
            var value = (AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.coupons.showOnce && 
                this.config.values.domainsWhereCouponsHaveBeenShowed.indexOf(domain) >= 0);
            return value;
        },
        disableCouponsForDomain: function (domain) {
            if (!AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.coupons.showOnce) {
                this.config.values.domainsWhereCouponsHaveBeenShowed = [];
            } else {
                if (this.config.values.domainsWhereCouponsHaveBeenShowed.indexOf(domain) < 0){
                    this.config.values.domainsWhereCouponsHaveBeenShowed.push(domain);
                }
            }

            this.saveValues();
        },
        isdisabledForCoupons: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "COUPONS") || 
                AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.coupons.hide ||
                AvastWRC.NotificationsManager.couponHaveBeenShowedInDomain(domain);
        },
        isdisabledForAccommodation: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "OFFERS") || 
                !AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.accommodations.showBetter; 
        },
        isdisabledForOffersCoupons: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "OFFERS_AND_COUPONS") || 
                AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.offers.hide || 
                AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.coupons.hide ||
                AvastWRC.NotificationsManager.couponHaveBeenShowedInDomain(domain);
        },
        isdisabledForAccommodationCoupons: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "OFFERS_AND_COUPONS") || 
                !AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.accommodations.showBetter ||
                AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.coupons.hide ||
                AvastWRC.NotificationsManager.couponHaveBeenShowedInDomain(domain);
        },
        isdisabledForCityHotels: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "POPULAR_HOTELS") || 
                !AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.accommodations.showPopular; 
        },
        isdisabledForSimilarHotels: function(domain){
            return !AvastWRC.NotificationsManager.isCategoryAvailableForDomain(domain, "ALTERNATIVE_HOTELS") || 
                !AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.accommodations.showSimilar; 
        },
        getNotificationsFlag: function(domain){
            let notificationsFlags = {
                minimized: AvastWRC.NotificationsManager.notificationsAreMinimized(domain) || false,
                allDisabled: AvastWRC.NotificationsManager.isDomainInSettingsWhiteList(domain),
                disabledForRedirect: AvastWRC.NotificationsManager.isdisabledForRedirect(domain),
                disabledForOffers: AvastWRC.NotificationsManager.isdisabledForOffers(domain),
                disabledForCoupons: AvastWRC.NotificationsManager.isdisabledForCoupons(domain),
                disabledForAccommodation: AvastWRC.NotificationsManager.isdisabledForAccommodation(domain),
                disabledForOffersCoupons: AvastWRC.NotificationsManager.isdisabledForOffersCoupons(domain),
                disabledForAccommodationCoupons: AvastWRC.NotificationsManager.isdisabledForAccommodationCoupons(domain),
                disabledForCityHotels: AvastWRC.NotificationsManager.isdisabledForCityHotels(domain),
                disabledForSimilarHotels: AvastWRC.NotificationsManager.isdisabledForSimilarHotels(domain),
                disabledForCheckoutCoupons: false
            };
            
            return notificationsFlags;
        },
        getFlagFromNotificationType: function (notificationType) {
            return this.config.notificationsFlags[notificationType] || 0;
        },
        setMinimized: function (value) {
            this.config.onlyInMemoryValues.minimized = value;
        },

        config: {
            notificationsFlags: {
                "OFFERS": 2,                    
                "COUPONS": 4,
                "OFFERS_AND_COUPONS": 8,
                "SPECIAL_DEALS": 64,
                "POPULAR_HOTELS": 128,
                "ALTERNATIVE_HOTELS": 256,
                "OFFERS_TAB_HIGHLIGHTED": 2,
                "COUPONS_TAB_HIGHLIGHTED": 4,
                "OTHERS_TAB_HIGHLIGHTED": 64
            },
            values: {
                redirectTTL: {},
                domainsWhereCouponsHaveBeenShowed: [],
                trustedFakeDomain: {},
                trustedPhishingDomain: {}
            },
            onlyInMemoryValues: {
                categoriesBlackListedOnDomain: [],
                domainsBlacklist: [],
                minimized: false,
            },
            localStorageKey: "__NOTIFICATIONS__"
        }
    };

}).call(this, AvastWRC, _);

/*******************************************************************************
 *
 *  AvastWRC Close Tooltip Service
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.CloseTooltip = {
        init: function(){
            let data = AvastWRC.storageCache.get("CloseTooltip");
            if(data){
                AvastWRC.CloseTooltip.config.storedValues.show = data.show;
            }else{
                AvastWRC.storageCache.save("CloseTooltip", AvastWRC.CloseTooltip.config.storedValues);
                AvastWRC.CloseTooltip.config.storedValues.show = true;
            }
            console.log("CloseTooltip -> " + JSON.stringify(AvastWRC.CloseTooltip.config.storedValues));
        },
        getCloseTooltipInfo: function () {
            return AvastWRC.CloseTooltip.config.storedValues;
        },
        closeTooltipShown: function (data) {
            // TODO Generate Events
            AvastWRC.CloseTooltip.setBadgeAnimation(data);
        },
        closeTooltipClicked: function (data) {
            AvastWRC.CloseTooltip.config.storedValues.show = false;
            AvastWRC.storageCache.save("CloseTooltip", AvastWRC.CloseTooltip.config.storedValues);
            let cachedData = AvastWRC.TabReqCache.get(data.tabId, "safePriceInTab");
            if(cachedData && cachedData.closeTooltipInfo && cachedData.closeTooltipInfo.show){
                cachedData.closeTooltipInfo.show = false;
                AvastWRC.TabReqCache.set(data.tabId, cachedData);
            }            
            AvastWRC.CloseTooltip.disableCloseTooltipForAllTabs();
            AvastWRC.bal.sp.disableBadgeAnimation(data.tabId);
        },
        autoHideTooltip: function (data) {
            AvastWRC.bal.sp.disableBadgeAnimation(data.tabId);
        },
        disableCloseTooltipForAllTabs: function () {
            AvastWRC.bs.messageAllTabs({
                message: "closeTooltipShown",
                data: {},
            });
        },
        setBadgeAnimation: function (data) {
            AvastWRC.bal.sp.setBadge(data.tabId, AvastWRC.bal.sp.getCurrentBadge(data.tabId), true, null, AvastWRC.Shepherd.getIconBlinkingAnimationAfterCloseTooltip());
        },
        getTemplateData: function () {
            return {
                strings: AvastWRC.bal.utils.loadLocalizedStrings({}, this.config.template.strings),
                images: AvastWRC.bal.utils.getLocalImageURLs({}, this.config.template.images)
            };
        },
        feedback: function (data, tab) {
            let actions = {
                "SHOWN": AvastWRC.CloseTooltip.closeTooltipShown,
                "CLICKED_CTA": AvastWRC.CloseTooltip.closeTooltipClicked,
                "HIDE": AvastWRC.CloseTooltip.autoHideTooltip
            };

            if (actions[data.action]) actions[data.action](_.extend(data, {tabId: tab.id}));
        },
        config: {
            storedValues: {
                show: true
            },
            template: {
                strings: ["spAfterCloseTooltip", "spAfterCloseTooltipGotIt"],
                images: {
                    closeTooltipImage: "close-tooltip-image.png",
                }
            }
        }
    };
}).call(this, AvastWRC, _);
/*******************************************************************************
 *
 *  AvastWRC SettingsTooltip Service
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.SettingsTooltip = {
        init: function(){
            var data = AvastWRC.storageCache.get(AvastWRC.SettingsTooltip.config.key);
            if(data){
                AvastWRC.SettingsTooltip.config.data = data;
            }else{
                AvastWRC.SettingsTooltip.saveData();
            }
            console.log("SettingsTooltip data -> " + JSON.stringify(AvastWRC.SettingsTooltip.config.data));
        },
        saveData: function () {
            if(AvastWRC.SettingsTooltip.config.data === null){
                AvastWRC.SettingsTooltip.config.data = JSON.parse(JSON.stringify(AvastWRC.SettingsTooltip.config.defaultData));
            }

            AvastWRC.storageCache.save(AvastWRC.SettingsTooltip.config.key, AvastWRC.SettingsTooltip.config.data);

        },
        getNextTimeToShow : function(){
            var numberOfMonths = 3; //or whatever offset
            var CurrentDate = new Date();
        return CurrentDate.setMonth(CurrentDate.getMonth() + numberOfMonths);        
        },
        isTimeToShow : function(offersNumber){
            if(offersNumber === 0 || !AvastWRC.Shepherd.tooltips().settings)return false;

            var now = parseInt(new Date().getTime())/1000;
            if(AvastWRC.YesNo.powerUserData.interactions && AvastWRC.YesNo.powerUserData.interactions.length === 0 && 
                ((AvastWRC.SettingsTooltip.config.data.showIn < now) || (AvastWRC.SettingsTooltip.config.data.shown === false))){
                return true;
            }

            return false;
        },
        tooltipShown: function () {
            AvastWRC.SettingsTooltip.config.data.shown = true;
            AvastWRC.SettingsTooltip.config.data.showIn = AvastWRC.SettingsTooltip.getNextTimeToShow();
            AvastWRC.SettingsTooltip.saveData();
            AvastWRC.bs.messageAllTabs({
                message: "hideSettingsTooltip",
                data: {},
            });
        },
        config: {
            key: "SettingsTooltip",
            data: null,
            defaultData: {
                shown: false, // if it was shown
                showIn: 0 // when it should be show again
            }
        }
    };

}).call(this, AvastWRC, _);
/*******************************************************************************
 *
 *  AvastWRC Shops WhiteList
 *
 ********************************************************************************/
(function (AvastWRC, _) {
    'use strict';
    AvastWRC.DomainsWhiteList = {
        init: function () {
            let data = AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey);
            if (!data || !AvastWRC.DomainsWhiteList.isValidTime(data.expireTime) || data.wl.length === 0) {
                AvastWRC.DomainsWhiteList.updateDomainWhiteList();
                console.log("DomainsWhiteList -> call server");
            }
            AvastWRC.DomainsWhiteList.initialized = true;
            console.log("DomainsWhiteList -> ", AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey));
        },
        /**
         * Generate the new expiration time
         * @return expiration time 
         */
        getNewExpirationTime: function () {
            return parseInt(new Date().getTime()) / 1000 + parseInt(AvastWRC.DomainsWhiteList.ttl);
        },
        /**
         * Return if the Ttl is still valid
         * @return true if still valid otherwise false
         */
        isValidTime: function (timeToValidate) {
            var now = parseInt(new Date().getTime()) / 1000;
            return (timeToValidate > now);
        },
        searchInfo: function (domain, domainInfoList) {
            let domainInfo = { found: false, flag: 0 };
            domainInfoList.forEach(element => {
                let elemArray = element.split(";");
                if (elemArray.length > 1 && elemArray[0].indexOf(domain) >= 0) {
                    domainInfo.found = true;
                    domainInfo.flag = elemArray[1];
                    AvastWRC.DomainsWhiteList.visitedDomainInfoData.push(element);
                    return;
                }
            });
            return domainInfo;
        },
        getDomainInfo: function (domain) {
            let domainInfo = { found: false, flag: 0 };
            if (!AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey) || !AvastWRC.DomainsWhiteList.isValidTime(AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey).expireTime)){
                AvastWRC.DomainsWhiteList.updateDomainWhiteList();
            }
            if (AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey)){
                if (AvastWRC.DomainsWhiteList.visitedDomainInfoData.length > 0) {
                    domainInfo = AvastWRC.DomainsWhiteList.searchInfo(domain, AvastWRC.DomainsWhiteList.visitedDomainInfoData);
                }
                if (!domainInfo.found) {
                    domainInfo = AvastWRC.DomainsWhiteList.searchInfo(domain, AvastWRC.storageCache.get(AvastWRC.DomainsWhiteList.localKey).wl);
                }
            }
            return domainInfo;
        },
        updateDomainWhiteList: function () {
            //TODO call the server
            AvastWRC.DomainsWhiteList.visitedDomainInfoData = [];
            new AvastWRC.Query.DomainWhiteList({
                callback: function (resp) {
                    AvastWRC.storageCache.save(AvastWRC.DomainsWhiteList.localKey,
                        { wl: resp, expireTime: AvastWRC.DomainsWhiteList.getNewExpirationTime() });
                }
            });
        },
        initialized: false,
        ttl: 604800,
        localKey: "domainsWhiteList",
        FLAGS_MASK: {
            WL: 1,
            FAKE_SHOP: 2,
        },
        visitedDomainInfoData: []

    };
}).call(this, AvastWRC, _);
/*******************************************************************************
 *  avast! Online Security plugin
 *  (c) 2014 Avast Corp.
 *
 *  Background Layer - SafePrice
 ******************************************************************************/

(function (AvastWRC, _) {
    'use strict';
    (function (definition) {
        AvastWRC.bal.registerModule({
            bootstrap: function () {
                return definition();
            }
        });
    })(function () {
        AvastWRC.bal.sp = _.extend(AvastWRC.bal.SP || {}, {

            panelData: {
                strings: AvastWRC.bal.utils.loadLocalizedStrings({}, ["spOffersTab",
                    "spCouponsTab",
                    "spOthersTab",
                    "spAdditionalFees",
                    "spShippingLabel",
                    "spGetCouponCode",
                    "spApply",
                    "spCopyAtCheckOut",
                    "spCouponApplied",
                    "spCouponsSelectedText",
                    "spCouponsAvailableText",
                    "spCouponsSelected",
                    "spNothingFoundCoupons",
                    "spNothingFoundOffers",
                    "spNothingFoundOthers",
                    "spCouponsExpiration",
                    "spCityHotelNotificationMessage",
                    "spSimilarHotelsMessage",
                    "spNotificationRedirectShowLessMessage",
                    "spNotificationRedirectShowMoreMessage",
                    "save",
                    "sasOpenShop",
                    "spCloseTooltip",
                    "spMinimizeTooltip",
                    "spHelpTooltip",
                    "spSettingsTooltip",
                    "spNoresultsFoundForOthers",
                    "spNoResultsFoundCoupons",
                    "spNoResultsFoundOffersBasedOnQuery",
                    "spNoResultsFoundOffers",
                    "spGreatDeal",
                    "spSiteVerified",
                    "spSiteNotVerified",
                    "spSiteNotVerifiedHover",
                    "spConnectionSecure",
                    "spConnectionNotSecure",
                    "spConnectionNotSecureHover",
                    "spSiteUntrustworthy",
                    "spSiteUntrustworthyDesc",
                    "spLeaveSite",
                    "spITrustThisSite",
                    "spRecommendESHop",
                    "spRecommendWhy",
                    "spRecommendExcellentSelectionOfProducts",
                    "spRecommendGreatValue",
                    "spRecommendGreatCcustomerService",
                    "spReportESHop",
                    "spReportWhy",
                    "spReportPaidAndNotGet",
                    "spReportGetSomethingDifferent",
                    "spReportTreatedMePoorly",
                    "spRequired",
                    "spOther",
                    "spTellUsMore",
                    "spEShopName",
                    "spProductOrdered",
                    "spLinkToProductPage",
                    "spReport",
                    "spRecommend",
                    "spThanksForVoting",
                    "spAvailableOffers",
                    "spAvailableHotels",
                    "spAvailableCoupons",
                    "spSelectedCoupons",
                    "spAvailableOthers",
                    "spProductsSearchInput",
                    "spCouponsSearchInput",
                    "spProductsSearchIconHover",
                    "spSearchForOffers",
                    "spSearchForCoupons",
                    "spCouponsSearchIconHover",
                    "spPhishingSite",
                    "spPhishingSiteDesc",
                    "spNoResultsFoundCouponsNow",
                    "spFeedback",
                    "spFeedbackShare",
                    "spFeedbackback",
                    "spFeedbackSend",
                    "spFeedbackNext",
                    "spFeedbackGeneral",
                    "spFeedbackReportOnlineStore",
                    "spFeedbackThanks",
                    "spFeedbackGeneral",
                    "spFeedbackGeneralDesc",
                    "spFeedbackReportOnlineStore",
                    "spFeedbackReportOnlineStoreDesc",
                    "spFeedbackSPExp",
                    "spFeedbackWriteAComment",
                    "spFeedbackWhichOnlineStoreReporting",
                    "spFeedbackOnlineStoreName",
                    "spFeedbackRetailerMerchant",
                    "spFeedbackProductOrdered",
                    "spFeedbackLinkToProductPage",
                    "spFeedbackProblem",
                    "spFeedbackSomethingDifferent",
                    "spFeedbackPaidAndNotGet",
                    "spFeedbackOther",
                    "spFeedbackWhatWasTheProblem",
                    "spCodeCopied",
                    "spCouponWorks",
                    "spCouponCodeWorks",
                    "spRateCouponsThanks",
                    "spLoadingNotificationMessage",
                    "spCouponsNotificationMessage",
                    "spBetterOffersNotificationMessage",
                    "spOffersAndCouponsNotificationMessage",
                    "spBetterSpecialDealsNotificationMessage",
                    "spShowNotificationMessage",
                    "spShowAll",
                    "spShowNotificationRedirectMessage",
                    "spNotificationRedirectShowRedirectMessage",
                    "spLoadingNotificationDescriptionMessage",
                    "spSimilarHotelsNotificationMessage",
                    "spBetterOffersNotificationBarMessage",
                    "spBetterSpecialDealsNotificationBarMessage",
                    "spCouponsNotificationSaveTextMessage",
                    "spBetterOfferLowerPricesNotificationMessage",
                    "spAfterCloseTooltip",
                    "spOnboardingSearchOffers",
                    "spOnboardingSearchCoupons",
                    "spTrySearchInAmazon",
                    "spSearchInAmazon",
                    "spOnboardingSettingsMsg",
                    "spOnboardingSettingsButton",
                    "spMoreOffersFound"
                ]),
                images: AvastWRC.bal.utils.getLocalImageURLs({}, {
                    logo: "logo-safeprice-48.png",
                    close: "close-icon-copy-8.png",
                    min: "minimise-icon.png",
                    settings: "settings-icon.png",
                    redirectPlaceholder: "Default-90x30.png",
                    redirectPlaceholderBig: "general.png",
                    dashedLine: "dashed-line.png",
                    help: "help-icon.png",
                    noCouponsImg: "no-coupons-img.png",
                    noOffers: "no-offers.png",
                    shield: "shield.png",
                    shieldRed: "shieldRed.png",
                    powered: "powered.png",
                    warningIcon: "warning.png",
                    dashedLineOffers: "combined-shape-offers.png",
                    searchIcon: "search-icon.svg",
                    searchOffers: "search-offers.png",
                    searchCoupons: "search-coupons.png",
                    couponsDefault: "coupons-default.png",
                    ribbonOffers: "ribbon-xl.svg",
                    ribbonImageCouponShopName: "ribbon-coupon-shop.png",
                    rateCouponPositive: "rateCouponPositive.png",
                    rateCouponPositiveHover: "rateCouponPositiveHover.png",
                    rateCouponNegative: "rateCouponNegative.png",
                    rateCouponNegativeHover: "rateCouponNegativeHover.png",
                    arrowRate: "arrow-rate.png",
                    checkMarkIcon: "checkmark-icon.png",
                    arrowFeedback: "arrow-feedback.png",
                    checkGif: "rate-check-gif.gif",
                    back: "back.png",
                    ribbonRedirect: "ribbon-redirect.png",
                    hotelsBar: "Hotels-Horizontal.gif",
                    couponsBar: "Coupons-Horizontal.gif",
                    offersAndCouponsBar: "Deals-Coupons-Horizontal.gif",
                    specialDealsBar: "Special-Deals-Horizontal.gif",
                    moreOffersBar: "Deals-Horizontal.gif",
                    arrow: "arrow.png",
                    arrowDi: "arrowDi.svg"
                }),
                animations: AvastWRC.bal.utils.getLocalImageURLs({}, {
                    moreOffersBar: "Anim-Deals-Horizontal.gif",
                    hotelsBar: "Anim-Hotels-Horizontal.gif",
                    couponsBar: "Anim-Coupons-Horizontal.gif",
                    offersAndCouponsBar: "Anim-Deals-Coupons-Horizontal.gif"
                }),
                userFeedback: { templateData: AvastWRC.YesNo.getTemplateData() },
                socialSharing: { templateData: AvastWRC.Social.getTemplateData() },
                closeTooltip: { templateData: AvastWRC.CloseTooltip.getTemplateData() },
                animationsSettings: AvastWRC.Shepherd.getAnimationsConfig(),
                avastBranding: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? true : false,
                browserType: {
                    isFirefox: AvastWRC.Utils.getBrowserInfo().isFirefox(),
                    isChrome: AvastWRC.Utils.getBrowserInfo().isChrome(),
                    isEdge: AvastWRC.Utils.getBrowserInfo().isEdge(),
                    isOpera: AvastWRC.Utils.getBrowserInfo().isOpera(),
                    isAvast: AvastWRC.Utils.getBrowserInfo().isAvast()
                },
                searchBack: {
                    couponsSearchQueries: [],
                    lastCouponsSearchPos: 0,
                    offersSearchQueries: [],
                    lastOffersSearchPos: 0,
                },
                isInstallUrl: false,
                showOffersTooltip: false,
                showCouponsTooltip: false,
                showSettingsTooltip: false
            },

            appiedCouponData: {
                images: AvastWRC.bal.utils.getLocalImageURLs({}, {
                    logo: "logo-safeprice-48.png",
                    close: "close-icon-copy-8.png",
                    checkMarkIcon: "checkmark-icon.png",
                    dashedLine: "dashed-line.png",
                    couponsDefault: "coupons-default.png",
                    ribbonImageCouponShopName: "ribbon-coupon-shop.png",
                    rateCouponPositive: "rateCouponPositive.png",
                    rateCouponPositiveHover: "rateCouponPositiveHover.png",
                    rateCouponNegative: "rateCouponNegative.png",
                    rateCouponNegativeHover: "rateCouponNegativeHover.png"
                }),
                browserType: {
                    isFirefox: AvastWRC.Utils.getBrowserInfo().isFirefox(),
                    isChrome: AvastWRC.Utils.getBrowserInfo().isChrome(),
                    isEdge: AvastWRC.Utils.getBrowserInfo().isEdge(),
                    isOpera: AvastWRC.Utils.getBrowserInfo().isOpera(),
                    isAvast: AvastWRC.Utils.getBrowserInfo().isAvast()
                },
                strings: AvastWRC.bal.utils.loadLocalizedStrings({}, ["sasCouponAppliedOnPage",
                    "spNotificationRedirectShowLessMessage",
                    "spNotificationRedirectShowMoreMessage",
                    "save",
                    "spCopyAtCheckOut",
                    "spCodeCopied",
                    "spCouponWorks",
                    "spCouponCodeWorks",
                    "spClickThenPaste",
                    "spRateCouponsThanks"])
            },

            siteNameIsContainedOnCurrentURL: function (url, urlToBeContained) {
                console.log("siteNameIsContainedOnCurrentURL: url: " + url + " urlToBeContained: " + urlToBeContained);
                let urlDomain = AvastWRC.bal.getDomainFromUrl(url);
                let urlToBeContainedDomain = AvastWRC.bal.getDomainFromUrl(urlToBeContained);

                if (urlDomain.indexOf(urlToBeContainedDomain.split(".")[0]) !== -1) {
                    console.log("siteNameIsContainedOnCurrentURL couponinTab: merchant (" + urlToBeContained + ") contained in url (" + url + ")");
                    return true;
                } else if (urlToBeContainedDomain.indexOf(urlDomain.split(".")[0]) !== -1) {
                    console.log("siteNameIsContainedOnCurrentURL couponinTab: url (" + url + ") contained in merchant (" + urlToBeContained + ")");
                    return true;
                } else
                    return false;
            },

            affiliateIsContainedOnCurrentURL: function (url, urlToBeContained) {
                if (!url || !urlToBeContained || urlToBeContained === "") return false;
                console.log("affiliateIsContainedOnCurrentURL: url: " + url + " urlToBeContained: " + urlToBeContained);
                let urlDomain = AvastWRC.bal.getDomainFromUrl(url);
                let urlToBeContainedDomain = clearAffiliateName(urlToBeContained);
                if (!urlDomain || !urlToBeContainedDomain || urlToBeContainedDomain === "") return false;
                if (urlDomain === urlToBeContainedDomain) {
                    console.log("affiliateIsContainedOnCurrentURL: couponinTab: affiliate domain (" + urlToBeContained + ") equals to url domain (" + url + ")");
                    return true;
                } else if (urlDomain.indexOf(urlToBeContainedDomain) !== -1 || urlDomain.indexOf(urlToBeContainedDomain.split(".")[0]) !== -1) {
                    console.log("affiliateIsContainedOnCurrentURL: couponinTab: affiliate (" + urlToBeContained + ") contained in url (" + url + ")");
                    return true;
                } else if (urlToBeContainedDomain.indexOf(urlDomain) !== -1 || urlToBeContainedDomain.indexOf(urlDomain.split(".")[0]) !== -1) {
                    console.log("affiliateIsContainedOnCurrentURL: couponinTab: url (" + url + ") contained in affiliate (" + urlToBeContained + ")");
                    return true;
                }
                return false;

                function clearAffiliateName(affiliate) {
                    if (!affiliate) return "";
                    var val = affiliate.toLowerCase().split(" ");
                    if (val[0] && val[0] !== "") {
                        return val[0];
                    } else if (val[1] && val[1] !== "") {
                        return val[1];
                    }
                    return "";
                }
            },
            isCouponInTab: function (url, tab) {
                var couponInTabsToShow = AvastWRC.UtilsCache.get("coupons_tabs_to_show", tab.id);
                if (couponInTabsToShow && couponInTabsToShow.coupons) {
                    let _taburl = false, _url = false, _tabTedirectUrl = false;

                    _taburl = couponInTabsToShow.toBeShownIn[tab.url] || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateDomain) || AvastWRC.bal.sp.siteNameIsContainedOnCurrentURL(tab.url, couponInTabsToShow.url) || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateName);

                    if (url !== tab.url) {
                        _url = couponInTabsToShow.toBeShownIn[url] || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateDomain) || AvastWRC.bal.sp.siteNameIsContainedOnCurrentURL(tab.url, couponInTabsToShow.url) || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.url, couponInTabsToShow.affiliateName);
                    }

                    if (tab.redirectUrl && tab.redirectUrl !== "") {
                        _tabTedirectUrl = couponInTabsToShow.toBeShownIn[tab.redirectUrl] || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.redirectUrl, couponInTabsToShow.affiliateDomain) || AvastWRC.bal.sp.siteNameIsContainedOnCurrentURL(tab.redirectUrl, couponInTabsToShow.url) || AvastWRC.bal.sp.affiliateIsContainedOnCurrentURL(tab.redirectUrl, couponInTabsToShow.affiliateName);
                    }

                    if (_taburl || _url || _tabTedirectUrl) {

                        console.log("couponTab onUrlInfoResponse show " + JSON.stringify(couponInTabsToShow));

                        AvastWRC.bs.accessContent(couponInTabsToShow.tab, {
                            message: "applyCouponInTab",
                            data: couponInTabsToShow,
                        });
                        AvastWRC.bal.emitEvent("control.show", tab.id);
                        AvastWRC.bal.emitEvent("control.setIcon", tab.id, "common/ui/icons/logo-safeprice-128.png");
                        couponInTabsToShow.lastShown = parseInt(new Date().getTime() / 1000);
                        console.log("Show in tab.url: ", tab.url, "url: ", url, couponInTabsToShow.toBeShownIn);
                        return true;
                    }
                }
                return false;
            },

            isInstallUrl: function (url) {
                if (!url) return false;
                let installUrl = (AvastWRC && AvastWRC.bal) ? AvastWRC.getLandingPageURL() : null;
                if (installUrl && url.indexOf(installUrl) !== -1) {
                    return true;
                }
                return false;
            },

            isShopDomain: function (url, response, tab, updateEvent) {
                function sendUrlBurger(data, eventType) {
                    //this is a shop domain we support
                    var eventDetails = {
                        clientInfo: JSON.parse(data.clientInfo),
                        url: data.url,
                        eventType: eventType,
                        offer: null,
                        offerType: ""
                    };
                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                }

                function prepareData(response, url, tab) {
                    var data = { urlData: response };
                    // this is a shop domain start process to get coupons and offers
                    // generate an uuid to recognize the requests process
                    var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id, "safePriceInTab")) || {});

                    data = _.extend(data, {
                        url: url,
                        urlDomain: AvastWRC.bal.getDomainFromUrl(url),
                        tab: tab,
                        tabId: tab.id,
                        iconClicked: (cachedData && cachedData.iconClicked) ? true : false,
                        activeTab: "",
                        panelData: JSON.parse(JSON.stringify(AvastWRC.bal.sp.panelData)),
                        transactionFinished: false,
                        transactionStarted: false,
                        badgeHighlighted: false,
                        search: { couponsSearch: {}, offersSearch: {} },
                        isSearchActive: AvastWRC.Shepherd.isSearchActive(),
                        detailsToClosed: { offerNumber: 0 },
                        avastBranding: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? true : false,
                        closeTooltipInfo: AvastWRC.CloseTooltip.getCloseTooltipInfo(),
                        feedbackInfo: AvastWRC.YesNo.getFeedBackInfo(),
                        clientInfo: (cachedData && cachedData.clientInfo) ? JSON.parse(JSON.stringify(cachedData.clientInfo)) : AvastWRC.Utils.getClientInfo()
                    });

                    data = _.extend(data, JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData)));

                    data.urlData.isTrustedFakeShop = AvastWRC.NotificationsManager.isTrustedFakeShop(data.urlDomain);
                    data.urlData.isTrustedPhishing = AvastWRC.NotificationsManager.isTrustedPhishing(data.urlDomain);
                    data.urlData.showFakeShop = data.urlData.isfakeShop && !data.urlData.isTrustedFakeShop;

                    data.panelData.strings.searchTitleOffers = null;
                    data.panelData.strings.searchTitleCoupons = null;
                    data.panelData.searchConfig = AvastWRC.Shepherd.getSearchConfig();
                    data.panelData.emptySearchConfig = AvastWRC.Shepherd.getEmptySearchConfig();
                    data.panelData.searchBack = {
                        couponsSearchQueries: [],
                        lastCouponsSearchPos: 0,
                        offersSearchQueries: [],
                        lastOffersSearchPos: 0,
                    };
                    data.panelData.topBarRules = AvastWRC.Shepherd.getUIAdaptionRule(data.urlDomain);
                    data.panelData.minimizedPosition = AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.minimized || {};
                    data.panelData.standardPosition = AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.standard || {};
                    data.panelData.panelPosition = AvastWRC.bal.settings.get().userSPPoppupSettings.notifications.panel || {};

                    data.clientInfo.referer = AvastWRC.TabReqCache.get(tab.id, "referer");
                    if (data.clientInfo.transaction_id === null) {
                        data.clientInfo.transaction_id = AvastWRC.Utils.getRandomUID();
                    }
                    if (data.clientInfo.request_id === null) {
                        data.clientInfo.request_id = AvastWRC.Utils.getRandomUID();
                    }
                    data.clientInfo = JSON.stringify(data.clientInfo);

                    AvastWRC.TabReqCache.set(tab.id, 'safePriceInTab', data);

                    return data;
                }

                if (!response) {
                    console.log("no safeShop value for: " + url);
                    return;
                }
                var isSearchActive = AvastWRC.Shepherd.isSearchActive();
                if (isSearchActive) {
                    AvastWRC.bal.sp.setActiveIcon(tab);
                }
                else {
                    AvastWRC.bal.sp.setDisableIcon(tab);
                }

                AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);

                response.is_affiliate = false;

                if (AvastWRC.bal.sp.isAnAffiliateDomain(tab, updateEvent, url)) {
                    console.log("affiliate: " + url);
                    response.is_affiliate = true;
                }

                var data = prepareData(response, url, tab);

                if (AvastWRC.bal.sp.isInstallUrl(url)) {
                    data.activeTab = "OFFERS_TAB_HIGHLIGHTED";
                    data.panelData.isInstallUrl = true;
                    data.panelData.showOffersTooltip = true;
                    data.panelData.showCouponsTooltip = true;
                    data.notifications = {
                        notificationType: "OFFERS",
                        notificationName: "safeShopPanel",
                        diRules: [],
                    };
                    AvastWRC.TabReqCache.set(data.tab.id, 'safePriceInTab', data);

                    AvastWRC.bs.accessContent(tab, {
                        message: "showPanelInInstallPage",
                        data: data
                    });

                }
                else {
                    if (data.urlData.match) {
                        let firstRequestData = {
                            tab: data.tab,
                            url: data.url,
                            clientInfo: JSON.parse(data.clientInfo),
                            urlData: data.urlData
                        };
                        AvastWRC.bal.sp.getProviderInfo(firstRequestData);
                        //this is a shop domain we support
                        sendUrlBurger(data, "SAFE_SHOP_DOMAIN_VISITED");
                    }
                    else {
                        if ((!data.urlData.match && data.urlData.isfakeShop && !data.urlData.isTrustedFakeShop) ||
                            (!data.urlData.match && data.urlData.isPhishing && !data.urlData.isTrustedPhishing)) {
                            if (data.urlData.isfakeShop) {
                                data.notifications.notificationType = "BAD_SHOP";
                            } else {
                                data.notifications.notificationType = "PHISHING";
                            }

                            data.notifications.notificationName = "fakeShopPanel";

                            AvastWRC.bs.accessContent(data.tab, {
                                message: data.notifications.notificationName,
                                data: data
                            });
                            AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);
                        }

                        if (data.isSearchActive && data.iconClicked) {
                            AvastWRC.bs.accessContent(tab, {
                                message: "extensionIconClicked",
                                data: data,
                            });
                        }
                    }
                }
            },

            getProviderInfo: function (firstRequestData) {
                var queryOptions = JSON.parse(JSON.stringify(firstRequestData));
                console.log("Request: before send scrapers request" + JSON.stringify(firstRequestData.clientInfo));
                queryOptions.callback = function (domainInfoResponse) {
                    if (!domainInfoResponse) {
                        console.log("ERROR: invalid domainInfoResponse");
                        return;
                    }
                    var data = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(this.tab.id, 'safePriceInTab') || {}));

                    data.country = domainInfoResponse.country;
                    data.scrapers = domainInfoResponse.scrapers;
                    data.continue = domainInfoResponse.continue;

                    if (domainInfoResponse.notifications) {
                        data.notifications = domainInfoResponse.notifications;
                    }

                    AvastWRC.TabReqCache.set(this.tab.id, 'safePriceInTab', data);

                    if (data.continue) {
                        if (data.scrapers.length <= 0) {
                            //call the offers request to get coupons and redirect
                            AvastWRC.bal.sp.requestOffers({ tab: this.tab, result: [], clientInfo: data.clientInfo });
                        }
                        else {
                            AvastWRC.bal.sp.runTabParser(this.tab, data.scrapers, data.clientInfo);
                        }
                    } else if (data.notifications) {
                        AvastWRC.bs.accessContent(data.tab, {
                            message: data.notifications.notificationName,
                            data: data,
                        });
                    }

                };
                new AvastWRC.Query.Scrapers(queryOptions); //query Avast Scrapers Proxy
            },

            /**
             * Initiate page data check when safeShop selector received.
             * @param {String} page URL
             * @param {Object} urlInfo response
             * @param {Object} relevant tab to run the check
             */
            runTabParser: function (tab, scrapers, clientInfo) {

                var data = {
                    message: "checkSafeShop",
                    data: { scrapers: scrapers, tab: tab, clientInfo: JSON.stringify(JSON.parse(clientInfo || AvastWRC.Utils.getClientInfo())) }
                };
                console.log('===============runTabParser=====================');
                console.log(data.data.clientInfo);
                console.log('===============runTabParser=====================');
                AvastWRC.bs.accessContent(tab, data);
            },

            requestOffers: function (data) {
                var tab = data.tab;
                var cachedData = AvastWRC.TabReqCache.get(tab.id, "safePriceInTab");

                if (!cachedData) {
                    console.log("ERROR: No cachedData");
                    return;
                }

                if (JSON.parse(cachedData.clientInfo).transaction_id !== JSON.parse(data.clientInfo).transaction_id) {
                    console.log("ERROR: different transaction ID DROP", cachedData, data);
                    return;
                }

                if (JSON.parse(cachedData.clientInfo).request_id !== JSON.parse(data.clientInfo).request_id) {
                    console.log("ERROR: different request ID DROP", cachedData, data);
                    return;
                }

                cachedData.parserResults = data.result;
                cachedData.notificationsFlag = AvastWRC.NotificationsManager.getNotificationsFlag(cachedData.urlDomain);

                if (cachedData.transactionStarted === false) {
                    cachedData.transactionStarted = true;
                } else {
                    let clientInfo = JSON.parse(cachedData.clientInfo);
                    clientInfo.request_id = AvastWRC.Utils.getRandomUID();
                    cachedData.clientInfo = JSON.stringify(clientInfo);
                }

                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                console.log("Request: before send offers request" + cachedData.clientInfo);
                var queryOptions = {
                    tab: data.tab,
                    url: tab.url,
                    parserResults: cachedData.parserResults,
                    clientInfo: JSON.parse(cachedData.clientInfo),
                    urlData: cachedData.urlData,
                    notificationsFlag: cachedData.notificationsFlag,
                    callback: function (offersResponse) {
                        if (!cachedData || queryOptions.url !== cachedData.url) {
                            console.log("ERROR: not the same url requestOffers response ->: ", queryOptions, offersResponse, cachedData);
                            AvastWRC.bs.accessContent(tab, {
                                message: "removeAll",
                                data: null,
                            });
                            return;
                        }

                        if (cachedData.iconClicked === 1) {
                            cachedData.iconClicked = 0;
                        }

                        cachedData.detailsToClosed = {
                            offerNumber: offersResponse.offersRequestTotalLength,
                            closed: 0
                        };

                        cachedData = _.extend(cachedData, offersResponse);

                        cachedData.offersNumberLength = cachedData.detailsToClosed.offerNumber.toString().length;
                        cachedData.showShowAllButton = cachedData.detailsToClosed.offerNumber > 1;

                        cachedData.social = AvastWRC.Social.getDisplayInfo(cachedData);

                        cachedData.offersToBeShown = ((offersResponse.producstLength + offersResponse.accommodationsLength) > 0) ? true : false;
                        cachedData.couponsToBeShown = offersResponse.couponsLength > 0 ? true : false;
                        cachedData.othersToBeShown = offersResponse.redirectLength > 0 ? true : false;

                        //cachedData.transactionFinished = true;

                        cachedData.panelData.strings.searchTitleOffers = cachedData.searchTitleForOffersTab;
                        cachedData.panelData.strings.searchTitleOffersRequest = cachedData.searchTitleForOffersTab;
                        cachedData.panelData.searchBack.offersSearchQueries = JSON.parse(JSON.stringify(AvastWRC.bal.sp.panelData.searchBack.offersSearchQueries));
                        if (cachedData.panelData.strings.searchTitleOffers) {
                            cachedData.panelData.searchBack.offersSearchQueries.push(cachedData.panelData.strings.searchTitleOffers);
                        }

                        cachedData.panelData.strings.searchTitleCoupons = cachedData.couponsLength > 0 ? cachedData.urlDomain : null;
                        cachedData.panelData.strings.searchTitleCouponsRequest = cachedData.urlDomain;
                        cachedData.panelData.searchBack.couponsSearchQueries = JSON.parse(JSON.stringify(AvastWRC.bal.sp.panelData.searchBack.couponsSearchQueries));
                        if (cachedData.panelData.strings.searchTitleCoupons) {
                            cachedData.panelData.searchBack.couponsSearchQueries.push(cachedData.panelData.strings.searchTitleCoupons);
                        }

                        cachedData.panelData.showSettingsTooltip = AvastWRC.SettingsTooltip.isTimeToShow(cachedData.detailsToClosed.offerNumber);


                        AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);

                        console.log("-----------cachdata------------", cachedData);
                        AvastWRC.bs.accessContent(tab, {
                            message: cachedData.notifications.notificationName,
                            data: cachedData,
                        });

                        if (cachedData.detailsToClosed.offerNumber.toString() > 0) {
                            AvastWRC.bal.sp.setActiveIcon(tab);
                            AvastWRC.bal.sp.setBadge(tab.id, cachedData.detailsToClosed.offerNumber.toString(), cachedData.notifications.notificationName === "blinkIcon");
                            if (cachedData.notifications.notificationName === "blinkIcon") {
                                AvastWRC.bal.sp.badgeHighlighted(cachedData.tab, cachedData.clientInfo);
                                cachedData.badgeHighlighted = true;
                                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                            }
                        } else {
                            AvastWRC.bal.sp.setBadge(tab.id, null, false);
                        }
                    }
                };

                new AvastWRC.Query.SafeShopOffer(queryOptions); // query Avast Offers Proxy

            }, // processSafeShopOffers

            getUserSettings: function () {
                var settings = AvastWRC.bal.settings.get();
                var poppupSettings = {};
                poppupSettings.menuOpt = JSON.parse(JSON.stringify(settings.userSPPoppupSettings));
                if (settings.userSPPoppupSettings.defaultMenu === "help") {
                    settings.userSPPoppupSettings.help.selected = false;
                    settings.userSPPoppupSettings.notifications.selected = true;
                    settings.userSPPoppupSettings.customList.selected = false;
                    settings.userSPPoppupSettings.privacy.selected = false;
                    settings.userSPPoppupSettings.defaultMenu = "notifications";
                    AvastWRC.bal.settings.set(settings);
                }
                else if (settings.userSPPoppupSettings.defaultMenu === "notifications" && !settings.userSPPoppupSettings.notifications.selected) {
                    // to reset the values on the localstorage of the old extensions
                    settings.userSPPoppupSettings.help.selected = false;
                    settings.userSPPoppupSettings.notifications.selected = true;
                    settings.userSPPoppupSettings.customList.selected = false;
                    settings.userSPPoppupSettings.privacy.selected = false;
                    settings.userSPPoppupSettings.defaultMenu = "notifications";
                    AvastWRC.bal.settings.set(settings);
                    poppupSettings.menuOpt = settings.userSPPoppupSettings;
                }
                poppupSettings.autotrigger = false;
                poppupSettings.menuOpt.customList.newSite = [];
                poppupSettings.menuOpt.customList.removeSite = [];
                poppupSettings.images = AvastWRC.bal.utils.getLocalImageURLs({}, {
                    logo: "sp-settings-logo.png",
                    close: "sp-settings-close.png",
                    add: "sp-settings-add.png",
                    erase: "sp-settings-erase.png",
                    checkbox: "checkbox-unchecked.png",
                    checkboxChecked: "checkbox-checked.png",

                });
                poppupSettings.strings = AvastWRC.bal.utils.loadLocalizedStrings({}, [
                    "spSettingsPageTitleAvast",
                    "spSettingsPageTitleAvg",
                    "spSettingsTabNotifications",
                    "spOffersTab",
                    "spCouponsTab",
                    "spOthersTab",
                    "spSettingsTabNotificationsOffers",
                    "spSettingsTabNotificationsOffersTitle",
                    "spSettingsTabNotificationsOffersShowAll",
                    "spSettingsTabNotificationsOffersBetter",
                    "spSettingsTabNotificationsOffersHideAll",
                    "spSettingsTabNotificationsOffersHideAllDesc",
                    "spSettingsTabNotificationAccommodationsTitle",
                    "spSettingsTabNotificationsAccommodationsShowBetter",
                    "spSettingsTabNotificationsAccommodationsSimilar",
                    "spSettingsTabNotificationsAccommodationsPopular",
                    "spSettingsTabNotificationsCoupons",
                    "spSettingsTabNotificationsCouponsShowAll",
                    "spSettingsTabNotificationsCouponsShowOnce",
                    "spSettingsTabNotificationsCouponsHide",
                    "spSettingsTabNotificationsCouponsHideDesc",
                    "spSettingsTabNotificationsOthers",
                    "spSettingsTabNotificationsOthersDesc",
                    "spSettingsPageCustomList",
                    "spSettingsPageCustomListTitle",
                    "spSettingsPageCustomListTitleDesc",
                    "spSettingsPageCustomListItemAddSite",
                    "spSettingsPageCustomListItemAdd",
                    "spSettingsPrivacy",
                    "spSettingsPrivacyNotice",
                    "spSettingsPageHelp",
                    "spSettingsPageHelpNotificationsTitle",
                    "spSettingsPageHelpNotificationsTitleDesc",
                    "spSettingsPageHelpOffersTitle",
                    "spSettingsPageHelpOffersTitleDesc",
                    "spSettingsPageHelpCouponsTitle",
                    "spSettingsPageHelpCouponsTitleDesc",
                    "spSettingsPageHelpOthersTitle",
                    "spSettingsTabNotificationsOthersTitle",
                    "spSettingsPageHelpOthersTitleDesc",
                    "spSettingsPageHelpFAQsTitle",
                    "spSettingsPageCancel",
                    "spSettingsPageSave",
                    "sasHintSettings"]);
                poppupSettings.strings.spSettingsTabNotifications = poppupSettings.strings.spSettingsTabNotifications.toUpperCase();
                poppupSettings.strings.spSettingsPageCustomList = poppupSettings.strings.spSettingsPageCustomList.toUpperCase();
                poppupSettings.strings.spSettingsPageHelp = poppupSettings.strings.spSettingsPageHelp.toUpperCase();
                poppupSettings.strings.spSettingsPageCancel = poppupSettings.strings.spSettingsPageCancel.toUpperCase();
                poppupSettings.strings.spSettingsPageSave = poppupSettings.strings.spSettingsPageSave.toUpperCase();
                poppupSettings.strings.spSettingsPageCustomListItemAddSite = poppupSettings.strings.spSettingsPageCustomListItemAddSite.toUpperCase();
                poppupSettings.strings.spSettingsPageCustomListItemAdd = poppupSettings.strings.spSettingsPageCustomListItemAdd.toUpperCase();
                var whiteList = _(poppupSettings.menuOpt.customList.whiteList) || [];
                poppupSettings.menuOpt.customList.whiteList = whiteList.valueOf();
                return poppupSettings;
            },

            prepareOptionsData: function () {
                var poppupSettings = AvastWRC.bal.sp.getUserSettings();
                var browserInfo = AvastWRC.Utils.getBrowserInfo();
                var settingsData = {
                    message: "INIT_USER_SETTINGS",
                    data: {
                        poppupSettings: poppupSettings,
                        poppupSettingsNew: JSON.parse(JSON.stringify(poppupSettings)),
                        updateBar: false,
                        avastBranding: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? true : false,
                        isFirefox: browserInfo.isFirefox(),
                        isChrome: browserInfo.isChrome(),
                        isEdge: browserInfo.isEdge(),
                        isOpera: browserInfo.isOpera(),
                        isSafari: browserInfo.isSafari(),
                        isAvast: browserInfo.isAvast(),
                        ispoppupSettings: false
                    },
                };
                return settingsData;
            },

            openNotificationsInSettignsPage: function () {
                var settings = AvastWRC.bal.settings.get();
                settings.userSPPoppupSettings.help.selected = false;
                settings.userSPPoppupSettings.notifications.selected = true;
                settings.userSPPoppupSettings.customList.selected = false;
                settings.userSPPoppupSettings.privacy.selected = false;
                settings.userSPPoppupSettings.defaultMenu = "notifications";
                AvastWRC.bal.settings.set(settings);
                if (AvastWRC.Utils.getBrowserInfo().isEdge()) {
                    var optionsPage = AvastWRC.bs.getLocalResourceURL("options.html");
                    AvastWRC.bs.openInNewTab(optionsPage);
                }
                else {
                    AvastWRC.bs.openOptions();
                }
            },

            openHelpInSettignsPage: function () {
                var settings = AvastWRC.bal.settings.get();
                settings.userSPPoppupSettings.help.selected = true;
                settings.userSPPoppupSettings.notifications.selected = false;
                settings.userSPPoppupSettings.customList.selected = false;
                settings.userSPPoppupSettings.privacy.selected = false;
                settings.userSPPoppupSettings.defaultMenu = "help";
                AvastWRC.bal.settings.set(settings);
                if (AvastWRC.Utils.getBrowserInfo().isEdge()) {
                    var optionsPage = AvastWRC.bs.getLocalResourceURL("options.html");
                    AvastWRC.bs.openInNewTab(optionsPage);
                }
                else {
                    AvastWRC.bs.openOptions();
                }
            },

            getAppliedCouponData: function (tab, eventDetails, requestUrl) {
                var couponInTabInfo = {}; // data for other messages
                couponInTabInfo.appiedCouponData = AvastWRC.bal.sp.appiedCouponData;
                couponInTabInfo.tab = tab;
                var coupon = [];
                coupon.push(eventDetails.offer);
                coupon.selected = true;
                couponInTabInfo.coupons = _(coupon).valueOf() || _([]);
                couponInTabInfo.code = (coupon[0]) ? coupon[0].code : "";
                couponInTabInfo.couponsLength = 1;
                couponInTabInfo.vouchersSelected = true;
                couponInTabInfo.vouchersAvailable = false;
                couponInTabInfo.vouchersSelectedCounter = 1;
                couponInTabInfo.vouchersCounterBig = false;
                couponInTabInfo.clientInfo = JSON.stringify(eventDetails.clientInfo);
                couponInTabInfo.url = eventDetails.url;
                couponInTabInfo.urlDomain = eventDetails.urlDomain;
                couponInTabInfo.affiliateName = coupon[0].affiliate;
                couponInTabInfo.affiliateDomain = AvastWRC.bal.getDomainFromUrl(coupon[0].affiliateDomain);
                couponInTabInfo.couponUrl = coupon[0].url;
                couponInTabInfo.isSearch = coupon[0].isSearch;
                couponInTabInfo.country = eventDetails.country;
                couponInTabInfo.voucherProviderId = eventDetails.voucherProviderId;
                couponInTabInfo.avastBranding = AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? true : false;

                couponInTabInfo.toBeShownIn = [];
                couponInTabInfo.toBeShownIn[eventDetails.offer.url] = true;
                if (requestUrl) {
                    couponInTabInfo.toBeShownIn[requestUrl] = true;
                }
                console.log("couponInTabInfo", couponInTabInfo);
                return couponInTabInfo;
            },

            getBurgerClickData: function (data, isOffer, eventDetails) {
                eventDetails = _.extend(eventDetails, {
                    query: data.query,
                    offerQuery: data.offerQuery,
                    bestOffer: data.bestOffer,
                    eventType: "OFFER_PICKED",
                    clickType: data.which,
                    uiSource: data.uiSource,
                    country: data.country,
                    ui_id: data.ruleId || data.uiId || "000",
                    ruleId: data.ruleId,
                    url: data.url,
                    isLinkClick: data.isLinkClick
                });

                if (isOffer) {
                    eventDetails.offer = data.offer;
                    eventDetails.offerCategory = data.offerCategory;
                }
                else {
                    eventDetails.offer = data.coupon;
                    eventDetails.offerCategory = data.couponCategory;
                }
                eventDetails.providerId = eventDetails.offer.providerId;
                eventDetails.offer.listPosition = data.positionInList;
                eventDetails.offer.showOffersNotification = data.showOffersNotification;
                eventDetails.offer.showPriceComparisonNotification = data.showPriceComparisonNotification;
                return eventDetails;
            },
            getUrlData: function (data) {
                let PickedOfferType = {
                    UNKNOWN: 0,
                    PRODUCT: 1,
                    ACCOMMODATION: 2,
                    REDIRECT: 3,
                    VOUCHER: 4,
                    CONTEXT_VOUCHER: 5
                };
                let offerType = 0;
                if (data.coupon) {
                    offerType = data.coupon.isContextCoupon ? PickedOfferType.CONTEXT_VOUCHER : PickedOfferType.VOUCHER;
                }
                else if (data.offer) {
                    offerType = PickedOfferType[data.offerCategory];
                }
                let result = {
                    client: data.clientInfo.client,
                    campaign_id: data.clientInfo.campaign_id,
                    rule_id: data.ruleId || "000",
                    transaction_id: data.clientInfo.transaction_id,
                    browser_type: data.clientInfo.browser.type,
                    a_guid: data.clientInfo.guid,
                    x_guid: data.clientInfo.extension_guid,
                    country_code: data.country,
                    source_url: data.url,
                    offer_type: offerType,
                    provider_id: data.providerId,
                    language: data.clientInfo.browser.language,
                    provider_redirect_id: data.offer.provider_redirect_id || "",
                    request_id: data.clientInfo.request_id
                };
                console.log("getUrlData: ", data, result);
                return result;

            },
            saveCouponInTab: function (newTab, eventDetails, requestUrl, close) {
                var couponInTabInfo = AvastWRC.bal.sp.getAppliedCouponData(newTab, eventDetails, requestUrl);
                if (!close) {
                    AvastWRC.UtilsCache.set("coupons_tabs_to_show", newTab.id, couponInTabInfo);
                }
                else {
                    AvastWRC.UtilsCache.set("coupons_tabs_to_remove", newTab.id, couponInTabInfo);
                }
            },
            getClientInfoData: function (cachedData, clientInfo) {
                var clientInfoData = (clientInfo) ? JSON.parse(clientInfo) :
                    (cachedData && cachedData.clientInfo && typeof cachedData.clientInfo === "string") ?
                        JSON.parse(cachedData.clientInfo) :
                        AvastWRC.Utils.getClientInfo();
                return clientInfoData;
            },
            safeShopFeedback: function (data, tab) {
                var settings = AvastWRC.bal.settings.get();
                var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id, "safePriceInTab") || {}));
                var eventDetails = {
                    clientInfo: AvastWRC.bal.sp.getClientInfoData(cachedData, data.clientInfo),
                    url: data.url,
                    eventType: "",
                    offer: null,
                    offerCategory: ""
                };
                var requestUrl = "";
                switch (data.type) {
                    case "OFFERS_CLICK":
                        // open URL in new tab
                        AvastWRC.bal.sp.getBurgerClickData(data, true, eventDetails);
                        var offerUrlDataInfo = AvastWRC.bal.sp.getUrlData(eventDetails);

                        requestUrl = `${data.clickedUrl}&p2=${encodeURIComponent(JSON.stringify(offerUrlDataInfo))}`;
                        console.log("offer url to open: ", requestUrl);

                        AvastWRC.bs.openInNewTab(requestUrl);

                        AvastWRC.YesNo.registerInteraction(tab);

                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "COUPONS_CLICK":
                        // 1. Send burger
                        // 2. Open the link in a new tab, wait for the redirects to finish (return to original domain) increase the number of clicks
                        // 3. Insert new Bar with coupon_code and coupon_text
                        if (data.suppress_x_timeout && data.uiSource !== "SEARCH") data.uiSource = "CHECKOUT_MAINUI_ITEM";
                        AvastWRC.UtilsCache.set("active_coupons", data.coupon.url, data.coupon);
                        AvastWRC.bal.sp.getBurgerClickData(data, false, eventDetails);
                        var couponUrlDataInfo = AvastWRC.bal.sp.getUrlData(eventDetails);

                        requestUrl = `${data.clickedUrl}&p2=${encodeURIComponent(JSON.stringify(couponUrlDataInfo))}`;

                        console.log("coupon url to open: ", requestUrl);

                        var couponsShowConfig = AvastWRC.Shepherd.getCouponsShowConfig();
                        var couponShowConfig = {};

                        if (eventDetails.offer.isSearch || eventDetails.offer.isContextCoupon || eventDetails.isLinkClick) {
                            couponShowConfig = { showInTab: "ACTIVE", close: false, closeAfter: null };
                            console.log("SHOW COUPON CONFIG: this is a search coupon or a context coupon or an appliedCoupon-> config: ", couponShowConfig);
                        }
                        else if (eventDetails.offer.code) {
                            couponShowConfig = couponsShowConfig.couponsWithCode;
                            console.log("SHOW COUPON CONFIG this is a coupon with code-> config: ", couponShowConfig);
                        }
                        else {
                            couponShowConfig = couponsShowConfig.couponsWithoutCode;
                            console.log("SHOW COUPON CONFIG: this is a coupon without code-> config: ", couponShowConfig);
                        }
                        if (couponShowConfig.showInTab.toUpperCase() === "ACTIVE") {
                            AvastWRC.bs.openInNewTab(requestUrl, function (newTab) {
                                AvastWRC.bal.sp.saveCouponInTab(newTab, eventDetails, requestUrl, couponShowConfig.close);
                            });
                        } else if (couponShowConfig.showInTab.toUpperCase() === "INACTIVE") {
                            AvastWRC.bs.openInNewTabInactive(requestUrl, function (newTab) {
                                AvastWRC.bal.sp.saveCouponInTab(newTab, eventDetails, requestUrl, couponShowConfig.close);
                            });
                        }
                        AvastWRC.YesNo.registerInteraction(tab);

                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "MAIN_UI":
                        eventDetails.eventType = data.type;
                        eventDetails.uiSource = data.uiSource;
                        if (data.suppress_x_timeout && data.uiSource !== "SEARCH") eventDetails.uiSource = "CHECKOUT";
                        eventDetails.category = data.category;
                        eventDetails.ui_id = data.ruleId || data.uiId || "000";
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "SHOWN":
                                if (data.notificationName === "safeShopPanel") {
                                    if (eventDetails.category === "COUPONS_TAB_HIGHLIGHTED" || eventDetails.category === "COUPONS") {
                                        setTimeout(() => {
                                            AvastWRC.NotificationsManager.disableCouponsForDomain(AvastWRC.bal.getDomainFromUrl(data.url));
                                        }, 2000);
                                    }
                                    if (eventDetails.category === "OTHERS_TAB_HIGHLIGHTED" || eventDetails.category === "SPECIAL_DEALS") {
                                        setTimeout(() => {
                                            AvastWRC.NotificationsManager.updateRedirectTTL(AvastWRC.bal.getDomainFromUrl(data.url), (new Date()).getTime());
                                        }, 2000);
                                    }
                                }
                                AvastWRC.bal.sp.disableBadgeAnimation(tab.id);
                                AvastWRC.NotificationsManager.removeDomainFromBlacklist(AvastWRC.bal.getDomainFromUrl(data.url));
                                cachedData.transactionFinished = true;
                                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_X":
                                if (data.category === "COUPON_APPLIED_NOTIFICATION") {
                                    eventDetails.url = tab.url;
                                    data.data.closedCouponUrl = tab.url;
                                    AvastWRC.UtilsCache.set("closed_applied_coupon", tab.id, data.data);
                                    AvastWRC.UtilsCache.remove("coupons_tabs_to_show", tab.id);
                                }
                                if (data.notificationName === "safeShopPanel" && data.category !== "COUPON_APPLIED_NOTIFICATION") {
                                    AvastWRC.NotificationsManager.disableCategoryForDomain(AvastWRC.bal.getDomainFromUrl(data.url), AvastWRC.NotificationsManager.getFlagFromNotificationType(data.category));
                                    if (data.category === "OFFERS") {
                                        AvastWRC.NotificationsManager.disableCategoryForDomain(AvastWRC.bal.getDomainFromUrl(data.url), AvastWRC.NotificationsManager.getFlagFromNotificationType("OFFERS_AND_COUPONS"));
                                    }
                                }
                                AvastWRC.NotificationsManager.addDomainToBlacklist(AvastWRC.bal.getDomainFromUrl(data.url));
                                AvastWRC.NotificationsManager.setMinimized(false);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_MINIMIZE":
                                AvastWRC.NotificationsManager.setMinimized(true);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_SETTINGS":
                                AvastWRC.bal.sp.openNotificationsInSettignsPage();
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_HELP":
                                AvastWRC.bal.sp.openHelpInSettignsPage();
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_OFFERS_TAB":
                            case "CLICKED_COUPONS_TAB":
                            case "CLICKED_OTHERS_TAB":
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                        }
                        break;
                    case "NOTIFICATIONS_EVENTS":
                        eventDetails.eventType = data.notificationType;
                        eventDetails.category = data.category;
                        eventDetails.ui_id = data.ruleId || data.uiId || "000";
                        eventDetails.uiSource = data.uiSource;
                        if (data.suppress_x_timeout && data.uiSource !== "SEARCH") eventDetails.uiSource = "CHECKOUT";
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "CLICKED_CTA":
                            case "FAILED_STRING_MATCHING":
                            case "FAILED_FIND_ELEMENT":
                            case "FAILED_INJECT":
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_X":
                                AvastWRC.NotificationsManager.disableCategoryForDomain(AvastWRC.bal.getDomainFromUrl(data.url), AvastWRC.NotificationsManager.getFlagFromNotificationType(data.category));
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_SETTINGS":
                                AvastWRC.bal.sp.openNotificationsInSettignsPage();
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "SHOWN":
                                if (eventDetails.category === "COUPONS") {
                                    setTimeout(() => {
                                        AvastWRC.NotificationsManager.disableCouponsForDomain(AvastWRC.bal.getDomainFromUrl(data.url));
                                    }, 2000);
                                }
                                if (eventDetails.category === "SPECIAL_DEALS") {
                                    setTimeout(() => {
                                        AvastWRC.NotificationsManager.updateRedirectTTL(AvastWRC.bal.getDomainFromUrl(data.url), (new Date()).getTime());
                                    }, 2000);
                                }
                                AvastWRC.bal.sp.disableBadgeAnimation(tab.id);
                                cachedData.transactionFinished = true;
                                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                        }
                        break;
                    case "FAKE_SHOP":
                        eventDetails.eventType = "SECURITY";
                        eventDetails.category = data.category;
                        eventDetails.ui_id = data.ruleId || data.uiId || "000";
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "CLICKED_CTA":
                                AvastWRC.bal.openSearchPageInTab(tab);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_CONTINUE":
                                eventDetails.type = "CLICKED_CONTINUE";
                                if (data.category === "BAD_SHOP") {
                                    AvastWRC.NotificationsManager.setTrustedFakeDomain(data.urlDomain);
                                }
                                else if (data.category === "PHISHING") {
                                    AvastWRC.NotificationsManager.setTrustedPhishingDomain(data.urlDomain);
                                }
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_X":
                                AvastWRC.NotificationsManager.disableCategoryForDomain(AvastWRC.bal.getDomainFromUrl(data.url), AvastWRC.NotificationsManager.getFlagFromNotificationType(data.category));
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "SHOWN":
                                cachedData.transactionFinished = true;
                                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                        }
                        break;
                    case "UPDATE_POSITION":
                        let notificationSettings = _.extend({}, settings.userSPPoppupSettings.notifications[data.notificationType]) || {};
                        notificationSettings.position = data.position;
                        settings.userSPPoppupSettings.notifications[data.notificationType] = notificationSettings;
                        break;
                    case "RESET_ICON_CLICK":
                        if (cachedData) {
                            cachedData.iconClicked = 0;
                            AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                        }
                        break;
                    case "TRANSACTION_FINISHED":
                        if (cachedData) {
                            cachedData.transactionFinished = true;
                            AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                            console.log("re-parse -> Parser result with Same Results. DO NOTHING");
                        }
                        break;
                    case "DROP_PARSER_RESULTS":
                        console.log("DROP_PARSER_RESULTS transaction Id is not the last one");
                        break;
                    case "SETTINGS_EVENTS":
                        eventDetails.eventType = data.type;
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "GET_USER_SETTINGS":
                                var settingsData = AvastWRC.bal.sp.prepareOptionsData();
                                AvastWRC.bs.messageOptions(settingsData);
                                break;
                            case "SHOWN":
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLOSE_SETTINGS":
                                AvastWRC.bs.closeTab(tab);
                                break;
                            case "SAVE_NEW_MENU_SELECTION":
                                if (data.newSettings.help.selected) {
                                    eventDetails.type = "CLICKED_HELP";
                                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                }
                                break;
                            case "SAVE_SETTINGS":
                                eventDetails.eventType = "SAVE_SETTINGS";// different burger proto
                                var newSettings = AvastWRC.Utils.buildUserSettings(data.newSettings);
                                eventDetails.newSettings = AvastWRC.Utils.buildUserSettingsMessage(newSettings);
                                settings.userSPPoppupSettings = data.newSettings;
                                settings.userSPPoppupSettings.notifications.settingsChanged = false;
                                settings.userSPPoppupSettings.customList.settingsChanged = false;
                                settings.userSPPoppupSettings.privacy.settingsChanged = false;
                                settings.userSPPoppupSettings.defaultMenuChanged = false;
                                AvastWRC.bal.settings.set(settings);
                                //console.log("settings popup: save button click");
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                            case "CLICKED_FAQS":
                                eventDetails.type = "CLICKED_FAQS";
                                AvastWRC.bal.openFAQsPageTab();
                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                                break;
                        }
                        AvastWRC.bal.settings.set(settings);
                        break;
                    case "SETTINGS_TOOLTIP":
                        eventDetails.eventType = "DIALOGS";
                        eventDetails.category = "SETTINGS_TOOLTIP";
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "CLICKED_SETTINGS":
                            case "CLICKED_CTA":
                                AvastWRC.SettingsTooltip.tooltipShown();
                                break;
                        }
                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "FEEDBACK":
                        eventDetails.eventType = data.type;
                        eventDetails.category = data.category;
                        eventDetails.ui_id = data.ruleId || data.uiId || "000";
                        eventDetails.type = data.action;
                        switch (data.action) {
                            case "SHOWN":
                                if (data.category === "MAIN") {
                                    AvastWRC.YesNo.userAsked();
                                }
                                break;
                            case "CLICKED_ASK_ME_LATER":
                                AvastWRC.YesNo.enableAskLater();
                                break;
                            case "CLICKED_CTA":
                                if (data.category === "LIKE") {
                                    AvastWRC.YesNo.positiveFeedbackDone();
                                }
                                else if (data.category === "DISLIKE") {
                                    AvastWRC.YesNo.negativeFeedbackDone();
                                }
                                break;
                        }
                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "SOCIAL_CARD":
                        eventDetails.eventType = data.type;
                        eventDetails.type = data.action;
                        eventDetails.category = data.category;
                        eventDetails.uiSource = data.uiSource;
                        switch (data.action) {
                            case "CLICKED_F":
                                AvastWRC.Social.shareOnFb();
                                break;
                            case "CLICKED_T":
                                AvastWRC.Social.shareOnTttr();
                                break;
                        }
                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "SEARCH":
                        if (data.searchBack) {
                            cachedData.panelData.searchBack = data.searchBack;
                        }
                        cachedData.panelData.showOffersTooltip = data.showOffersTooltip;
                        cachedData.panelData.showCouponsTooltip = data.showCouponsTooltip;
                        AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                        switch (data.action) {
                            case "OFFERS":
                                AvastWRC.bal.sp.processSearchOffers(tab, data);
                                break;
                            case "COUPONS":
                                AvastWRC.bal.sp.processSearchCoupons(tab, data);
                                break;
                            case "UPDATE_EXTENSION_ICON_TOOLTIP":
                                cachedData.detailsToClosed = data.detailsToClosed;
                                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);
                                if (cachedData.detailsToClosed && cachedData.detailsToClosed.offerNumber > 0) {
                                    AvastWRC.bal.sp.setActiveIcon(tab);
                                    AvastWRC.bal.sp.setBadge(tab.id, cachedData.detailsToClosed.offerNumber.toString(), false/*no animation*/);
                                }
                                break;
                            case "EMPTY_SEARCH_REDIRECT":
                                AvastWRC.bal.sp.getBurgerClickData(data, true, eventDetails);
                                let offerUrlDataInfo = AvastWRC.bal.sp.getUrlData(eventDetails);

                                let redirectUrl = data.offer.url;

                                let serverSP = AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType] + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[4];
                                requestUrl = `${serverSP}${encodeURIComponent(redirectUrl)}&p2=${encodeURIComponent(JSON.stringify(offerUrlDataInfo))}`;
                                console.log("EMPTY_SEARCH_REDIRECT url to open: ", requestUrl);

                                AvastWRC.bs.openInNewTab(requestUrl);

                                AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);

                                break;
                        }
                        break;
                    case "OFFERS_RATING":
                        eventDetails.eventType = "OFFERS_RATING";
                        if (data.offerCategory === "VOUCHER") {
                            AvastWRC.UtilsCache.set("rated_coupons", data.offer.url, true);
                        } else if (data.offerCategory === "PRODUCT") {
                            AvastWRC.UtilsCache.set("rated_product", data.offer.url, true);
                        }
                        else if (data.offerCategory === "ACCOMMODATION") {
                            AvastWRC.UtilsCache.set("rated_accommodation", data.offer.url, true);
                        }
                        else if (data.offerCategory === "REDIRECT") {
                            AvastWRC.UtilsCache.set("rated_redirect", data.offer.url, true);
                        }
                        var appliedCouponInTab = AvastWRC.UtilsCache.get("coupons_tabs_to_show", tab.id);
                        if (appliedCouponInTab && appliedCouponInTab.coupons && appliedCouponInTab.coupons[0]) {
                            appliedCouponInTab.coupons[0].rated = true;
                            AvastWRC.UtilsCache.set("coupons_tabs_to_show", tab.id, appliedCouponInTab);
                        }
                        eventDetails.offer = data.offer;
                        eventDetails.offerCategory = data.offerCategory;
                        eventDetails.url = data.url || tab.url;
                        eventDetails.country = data.country;
                        eventDetails.ruleId = data.ruleId;
                        eventDetails.ratedPositive = data.ratedPositive ? 1 : 0;
                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                    case "TOOLTIP_CLICK_X":
                        eventDetails.type = data.action;
                        eventDetails.eventType = "DIALOGS";
                        eventDetails.category = "TOOLTIP_CLICK_X";
                        AvastWRC.CloseTooltip.feedback(data, tab);
                        if (data.action !== "HIDE") {
                            AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        }
                        break;
                    case "USER_REPORTS":
                        eventDetails.eventType = data.notificationType;
                        eventDetails.type = data.action;
                        eventDetails.category = data.category;
                        switch (data.action) {
                            case "REPORT_GENERAL":
                            case "REPORT_SHOP":
                                eventDetails.eventType = data.notificationType;
                                eventDetails.text = data.text;
                                eventDetails.shopName = data.shopName;
                                eventDetails.productOrdered = data.productOrdered;
                                eventDetails.reportReason = data.reportReason;
                                break;
                        }
                        AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                        break;
                }
                //console.log("Feedback: " , data, eventDetails);
                AvastWRC.bal.settings.set(settings);
            },

            badgeHighlighted: function (tab, clientInfo) {
                let clientInfoData = (typeof clientInfo === "string") ? JSON.parse(clientInfo) : null;
                var eventDetails = {
                    clientInfo: (clientInfoData) ? clientInfoData : AvastWRC.Utils.getClientInfo(),
                    url: tab.url,
                    eventType: "EXTENSION_ICON",
                    type: "HIGHLIGHTED",
                    offer: null,
                    offerType: ""
                };
                if (eventDetails.clientInfo.referer === "") {
                    eventDetails.clientInfo.referer = AvastWRC.TabReqCache.get(tab.id, "referer");
                }

                console.log("onClicked", eventDetails);
                if (AvastWRC.Burger !== undefined) {
                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                }
                else {
                    console.log("no burger lib");
                }
            },

            getDetailtTocloseWithSearch: function (data) {
                let total = 0;
                if (!data) return total;

                if (data.redirectLength > 0) {
                    total += data.redirectLength;
                }
                if (data.couponsTabHaveSearch) {
                    if (data.search && data.search.couponsSearch && data.search.couponsSearch.couponsLength) {
                        total += data.search.couponsSearch.couponsLength;
                    }
                }
                else {
                    total += data.couponsLength;
                }
                if (data.offersTabHaveSearch) {
                    if (data.search && data.search.offersSearch && data.search.offersSearch.producstLength) {
                        total += data.search.offersSearch.producstLength;
                    }
                }
                else {
                    total += data.offerstTotalLength;
                }
                return total;
            },

            processSearchOffers: function (_tab, data) {
                var tab = _tab;

                var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id, "safePriceInTab") || {}));
                var searchTitle = data.query;
                cachedData.panelData.strings.searchTitleOffers = searchTitle;
                cachedData.couponsTabHaveSearch = data.couponsTabHaveSearch;
                cachedData.offersTabHaveSearch = data.offersTabHaveSearch;
                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);

                var queryOptions = {
                    url: data.url,
                    query: data.query,
                    provider_id: (cachedData.search && cachedData.search.offersSearch && cachedData.search.offersSearch.providerId) ? cachedData.search.offersSearch.providerId : cachedData.providerId || "",
                    clientInfo: JSON.parse(cachedData.clientInfo),
                    couponsTabHaveSearch: data.couponsTabHaveSearch,
                    offersTabHaveSearch: data.offersTabHaveSearch,
                    callback: function (offersSearchResponse) {
                        if ((!offersSearchResponse || offersSearchResponse.offerstTotalLength === 0)) {
                            if (cachedData.iconClicked === 1) {
                                cachedData.iconClicked = 0;
                            }
                        }

                        cachedData.search.offersSearch = offersSearchResponse;

                        cachedData.search.lastSearch = "OFFERS";

                        var detailsToClosed = {
                            offerNumber: AvastWRC.bal.sp.getDetailtTocloseWithSearch(cachedData),
                            closed: 0
                        };

                        cachedData.detailsToClosed = detailsToClosed;

                        if (detailsToClosed.offerNumber.toString() > 0) {
                            cachedData.panelData.showSettingsTooltip = AvastWRC.SettingsTooltip.isTimeToShow(detailsToClosed.offerNumber);
                        }

                        AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);

                        console.log("-----------cachdata------------", cachedData);

                        AvastWRC.bs.accessContent(tab, {
                            message: "updatePanelWithSearch",
                            data: cachedData,
                        });



                        if (detailsToClosed.offerNumber === 0) {
                            AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);
                        }
                        else if (detailsToClosed && detailsToClosed.offerNumber > 0) {
                            AvastWRC.bal.sp.setActiveIcon(tab);
                            AvastWRC.bal.sp.setBadge(tab.id, detailsToClosed.offerNumber.toString(), false/*no animation*/);
                        }
                    }
                };

                new AvastWRC.Query.SearchOffers(queryOptions); // query Avast Offers Proxy
            },
            processSearchCoupons: function (_tab, data) {
                var tab = _tab;

                var cachedData = JSON.parse(JSON.stringify(AvastWRC.TabReqCache.get(tab.id, "safePriceInTab") || {}));
                var searchTitle = data.query;
                cachedData.panelData.strings.searchTitleCoupons = searchTitle;
                cachedData.couponsTabHaveSearch = data.couponsTabHaveSearch;
                cachedData.offersTabHaveSearch = data.offersTabHaveSearch;
                AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);

                var queryOptions = {
                    url: data.url,
                    provider_id: (cachedData.search && cachedData.search.couponsSearch && cachedData.search.couponsSearch.providerId) ? cachedData.search.couponsSearch.providerId : cachedData.voucherProviderId || "",
                    query: data.query,
                    showABTest: cachedData.showABTest,
                    campaignId: cachedData.campaignId,
                    clientInfo: JSON.parse(data.clientInfo),
                    couponsTabHaveSearch: data.couponsTabHaveSearch,
                    offersTabHaveSearch: data.offersTabHaveSearch,
                    callback: function (couponsSearchResponse) {
                        if ((!couponsSearchResponse || couponsSearchResponse.offerstTotalLength === 0)) {
                            if (cachedData.iconClicked === 1) {
                                cachedData.iconClicked = 0;
                            }
                        }

                        cachedData.search.couponsSearch = couponsSearchResponse;

                        cachedData.search.lastSearch = "COUPONS";

                        var detailsToClosed = {
                            offerNumber: AvastWRC.bal.sp.getDetailtTocloseWithSearch(cachedData),
                            closed: 0
                        };

                        cachedData.detailsToClosed = detailsToClosed;

                        if (detailsToClosed.offerNumber.toString() > 0) {
                            cachedData.panelData.showSettingsTooltip = AvastWRC.SettingsTooltip.isTimeToShow(detailsToClosed.offerNumber);
                        }

                        AvastWRC.TabReqCache.set(tab.id, "safePriceInTab", cachedData);

                        console.log("-----------cachdata------------", cachedData);

                        AvastWRC.bs.accessContent(tab, {
                            message: "updatePanelWithSearch",
                            data: cachedData,
                        });

                        if (detailsToClosed.offerNumber === 0) {
                            AvastWRC.bal.sp.setBadge(tab.id, null, false/*no animation*/);
                        }
                        else if (detailsToClosed.offerNumber.toString() > 0) {
                            AvastWRC.bal.sp.setActiveIcon(tab);
                            AvastWRC.bal.sp.setBadge(tab.id, detailsToClosed.offerNumber.toString(), false/*no animation*/);
                        }
                    }
                };

                new AvastWRC.Query.SearchCoupons(queryOptions); // query Avast Coupons Proxy

            },

            setBadge: function (tabID, badge, animation = true, color = null, config = null) {
                let animationConfig = config || AvastWRC.Shepherd.getIconBlinkAnimationConfig();

                AvastWRC.bal.sp.currentBadge[tabID] = badge;

                function setBadgeWithAnimation(tabID, badge) {
                    let milliseconds = 0;
                    AvastWRC.bal.sp.disableBadgeAnimation(tabID);

                    for (let i = 0; i <= animationConfig.times; i++) {
                        AvastWRC.bal.sp.badgeAnimationTimers.push(setAnimationTimeout(tabID, badge, animationConfig.color, milliseconds));
                        if (i === animationConfig.times - 1) return;
                        AvastWRC.bal.sp.badgeAnimationTimers.push(setAnimationTimeout(tabID, "", animationConfig.color, milliseconds + animationConfig.milliseconds));
                        milliseconds += animationConfig.milliseconds * 2;
                    }
                }

                function setAnimationTimeout(tabID, badge, color, milliseconds) {
                    return setTimeout(function () {
                        setBadge(tabID, badge, color);
                    }, milliseconds);
                }

                function setBadge(tabID, badge, color) {
                    AvastWRC.bal.emitEvent("control.showText", tabID, badge, color);
                }

                if (badge === null) {
                    AvastWRC.bal.emitEvent("control.showText", tabID);
                    return;
                }

                let badgeColor = color || animationConfig.color;

                if (animation) {
                    setBadgeWithAnimation(tabID, badge);
                }
                else {
                    setBadge(tabID, badge, badgeColor);
                }
            },

            /*Send heartbeat each 16H -> 57600 sec*/
            sendHeartbeat: function () {
                let date = AvastWRC.storageCache.get("HeartBeat");
                var now = parseInt(new Date().getTime()) / 1000;
                var ttl = 57600;
                var sendNow = false;
                if (AvastWRC.Shepherd) {
                    ttl = AvastWRC.Shepherd.getHeartbeat();
                }
                if (!date) {
                    // date will be now + ttl min 16h
                    date = parseInt(new Date().getTime()) / 1000 + parseInt(ttl);
                    sendNow = true;
                }
                else if (date && date < now) {
                    date = now + parseInt(ttl);
                    sendNow = true;
                }
                if (sendNow) {
                    AvastWRC.storageCache.save("HeartBeat", date);
                    var eventDetails = {
                        clientInfo: AvastWRC.Utils.getClientInfo(),
                        url: "",
                        eventType: "HEARTBEAT",
                        offer: null,
                        offerType: "",
                        sendNow: true
                    };
                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                    sendNow = false;
                    console.log("HEARTBEAT send -> eventDetails: " + JSON.stringify(eventDetails) + "date: " + date);
                } else {
                    console.log("HEARTBEAT don't send -> date: " + date + "now: " + now);
                }
            },

            isAnAffiliateDomain: function (tab, sendAffiliateDomainEvent = true, url = false) {
                function emitAFSRCMatchBurgerEvent(tab) {
                    const AFFILIATE_MATCHING_KEY = "AFFILIATE_MATCHING";

                    let eventDetails = {
                        clientInfo: AvastWRC.Utils.getClientInfo(),
                        url: `${eventTriggeredURL + (eventTriggeredURL.indexOf("?") < 0 ? "?" : "")}&${AFFILIATE_MATCHING_KEY}=${AvastWRC.ASDetector.isAffiliateSource(tab.id, false) ? "CIUVO" : "COMPRIGO"}`,
                        offer: null,
                        offerType: "",
                        eventType: "AFSRC_MATCHING"
                    };

                    eventDetails.clientInfo.referer = AvastWRC.TabReqCache.get(tab.id, "referer");
                    AvastWRC.Burger.emitEvent("burger.newEvent", eventDetails);
                    console.log("afsrc=1 detected", eventTriggeredURL);
                }

                let eventTriggeredURL = url || tab.url,
                    isAnAffiliateDomain = (AvastWRC.ASDetector && AvastWRC.ASDetector.isAffiliateSource(tab.id, false)) ||
                        (AvastWRC.bs.comprigoASdetector && AvastWRC.bs.comprigoASdetector.isBolcked(eventTriggeredURL));

                if (isAnAffiliateDomain && sendAffiliateDomainEvent) emitAFSRCMatchBurgerEvent(tab);

                return isAnAffiliateDomain;


            },

            setIcon: function (tab, icon) {
                AvastWRC.bal.emitEvent("control.setIcon", tab.id, icon);
            },

            setActiveIcon: function (tab) {
                AvastWRC.bal.emitEvent("control.show", tab.id);
                AvastWRC.bal.sp.setIcon(tab, AvastWRC.bal.sp.config.icons.active);
            },

            setDisableIcon: function (tab) {
                AvastWRC.bal.emitEvent("control.hide", tab.id);
                AvastWRC.bal.sp.setIcon(tab, AvastWRC.bal.sp.config.icons.disable);
            },

            clearTimeouts: function (timeouts) {
                for (let i = 0; i < timeouts.length; i++) {
                    clearTimeout(timeouts[i]);
                }
            },

            getCurrentBadge: function (tabId) {
                return AvastWRC.bal.sp.currentBadge[tabId];
            },

            disableBadgeAnimation: function (tabId) {
                AvastWRC.bal.sp.clearTimeouts(AvastWRC.bal.sp.badgeAnimationTimers);
                AvastWRC.bal.sp.badgeAnimationTimers = [];
                if (tabId) AvastWRC.bal.sp.setBadge(tabId, AvastWRC.bal.sp.getCurrentBadge(tabId), false);
            },

            badgeAnimationTimers: [],
            currentBadge: {},
            config: {
                icons: {
                    disable: "common/ui/icons/logo-safeprice-gray.png",
                    active: "common/ui/icons/logo-safeprice-128.png"
                }
            }

        }); // SP

        AvastWRC.bal.registerEvents(function (ee) {
            ee.on("message.isShopDomain", AvastWRC.bal.sp.isShopDomain.bind(AvastWRC.bal.sp));
            ee.on("message.safeShopFeedback", AvastWRC.bal.sp.safeShopFeedback.bind(AvastWRC.bal.sp));
            ee.on("message.parserFinished", AvastWRC.bal.sp.requestOffers.bind(AvastWRC.bal.sp));
        });

        AvastWRC.bal.registerModule(AvastWRC.bal.sp);

        return AvastWRC.bal.sp;
    });


}).call(this, AvastWRC, _);
