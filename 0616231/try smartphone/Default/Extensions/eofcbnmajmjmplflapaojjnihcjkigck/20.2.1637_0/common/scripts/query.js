(function (_, AvastWRC, PROTO) {
    'use strict';

  if (typeof (AvastWRC) === "undefined") { AvastWRC = {}; }

  var HTTPS_SERVER = "https://uib.ff.avast.com",
      HTTPS_PORT = "443",
      countryIP = null;

  if (AvastWRC && AvastWRC.storageCache) {
    countryIP = AvastWRC.storageCache.get("countryIP") || "";
  }

  /*******************************************************************************
   *
   *  Query CONSTANTS
   *
   ******************************************************************************/
  AvastWRC.Query = {
    CONST: {
      HEADERS: {
        //"Accept": "binary",
        //dataType: 'binary',
        "Content-Type": "application/octet-stream",
        //"x-forwarded-for": countryIP,
        //"Connection": "keep-alive" // refused in Chrome
      },
      SERVER: HTTPS_SERVER,
      PORT: HTTPS_PORT,
      HTTPS_SERVER: "https://uib.ff.avast.com:443",
      URLINFO: "urlinfo",
      URLINFO_V4: "v4/urlinfo",
      URLINFO_V5: "v5/urlinfo",
      LOCAL_PORTS: [27275, 18821, 7754],
      LOCAL_PORT: null,
      LOCAL_TOKEN: null,
      GAMIFICATION_SERVER: "https://gamification.ff.avast.com:8743/receiver"
    }
  };

  /*******************************************************************************
   *
   *  Query Master Class
   *
   ******************************************************************************/
  AvastWRC.Query.__MASTER__ = {
    completed: false,
    /**
     * Initialize UrlInfo request.
     * @return {[type]} [description]
     */
    init: function () {
      this.headers = _.extend({}, AvastWRC.Query.CONST.HEADERS, this.headers);
      if (countryIP === null && AvastWRC && AvastWRC.storageCache) {
        countryIP = AvastWRC.storageCache.get("countryIP");
      }
      if(countryIP && countryIP !== "" && this.options.server.indexOf("https://safeprice") !== -1){
        this.headers = _.extend({}, AvastWRC.Query.CONST.HEADERS, {"x-forwarded-for": countryIP});
      }
      // Populate proto message
      this.message();
      // Send it to server
      if (this.options.go) this.post();
    },
    headers: {},
    /**
     * Set an option value
     * @param {String} option Property name
     * @param {}     value  Property value
     */
    set: function (option, value) {
      this.options[option] = value;
      return this;
    },
    /**
     * Get an option value
     * @param  {String} option Property name
     * @return {}           Property value
     */
    get: function (option) {
      return this.options[option];
    },
    /**
     * return json string of the message
     * @return {Object} Json representation of the GPB message
     */
    toJSON: function () {

      // return AvastWRC.Utils.gpbToJSON(this.response);
      var protoJSON = function (p) {
        var res = {};
        for (var prop in p.values_) {
          if (p.values_[prop].length) {
            // repeated message
            res[prop] = [];
            for (var i = 0, j = p.values_[prop].length; i < j; i++) {
              res[prop].push(protoJSON(p.values_[prop][i]));
            }
          } else if (p.values_[prop].properties_) {
            // composite message

            res[prop] = {};
            for (var krop in p.values_[prop].values_) {
              if (p.values_[prop].values_[krop] instanceof PROTO.I64) {
                // convert PROTO.I64 to number
                res[prop][krop] = p.values_[prop].values_[krop].toNumber();
              } else {
                res[prop][krop] = p.values_[prop].values_[krop];
              }
            }
          } else {
            // value :: deprecated - remove it
            res[prop] = p.values_[prop];
          }
        }
        return res;
      };
      return protoJSON(this.response);
    },
    /**
     * Send request to server
     * @return {Object} Self reference
     */
    post: function () {
      if (this.options.server.indexOf(":null") !== -1) {
        return this;
      }
        var self = this;
      var xhr = new XMLHttpRequest();
      var buffer = "";
      if(this.options.method === "post"){
        buffer = this.getBuffer(this.request);
        console.log("Request:", this.request.message_type_, this.options.server, this.request.values_);
        xhr.responseType = "arraybuffer";
      }
      xhr.myStatus = 0;
      xhr.myResponse = "";
      xhr.open(this.options.method.toUpperCase(), this.options.server, true);
      xhr.withCredentials = true;
      xhr.timeout = this.options.timeout || 0; // default to no timeout

      if(this.options.headers)
        this.headers = _.extend({}, this.headers, this.options.headers);
      for (var prop in this.headers) {
        xhr.setRequestHeader(prop, this.headers[prop]);
      }
      xhr.onload = function (e) {
        if (typeof e.srcElement !== "undefined") {
          xhr.myStatus = e.srcElement.status;
        }
        else if (typeof e.target !== "undefined") {
          xhr.myStatus = e.target.status;
        }

        if(self.options.method === "post"){
          xhr.myResponse = xhr.response;
        }else{
          xhr.myResponse = xhr.responseText;
        }

        if (xhr.myStatus >= 400) {
          self.error(xhr);
        }

        self.callback(xhr.myResponse);
      };
      xhr.onerror = function () {
        self.error(xhr);
      };
      xhr.ontimeout = function () {
        self.error(xhr);
      };
      xhr.send(buffer);
      return this;
    },
    /**
     * Convert message to ArrayBuffer
     * @param  {Object} message Message instance
     * @return {Array}         Array Buffer
     */
    getBuffer: function (message) {

      var stream = new PROTO.ByteArrayStream();
      message.SerializeToStream(stream);
      return this.baToab(stream.getArray());
    },
    /**
     * Handle server response
     * @param  {Array}   arrayBuffer Incoming message
     * @return {void}
     */
    callback: function (arrayBuffer) {
      var format = this.options.format;
      var res = null;
      if ('string' === format) {
        res = String.fromCharCode.apply(String, this.abToba(arrayBuffer));
      } else {
        this.parser(arrayBuffer);

        if ('json' === format) {
          res = this.toJSON();
        }
        else if ('object' === format) {
          res = this.format();
        }
        else {
          res = this.response;
        }
      }

      console.log('Response:', this.response.message_type_, this.options.server, res);
      this.options.callback(res);
      this.completed = true;
    },
    /**
     * Handle error responses
     * @param  {Object} xhr xmlhttp request object
     * @return {void}
     */
    error: function (xhr) {
      var bodyEncodedInString = String.fromCharCode.apply(String, new Uint8Array(xhr.myResponseesp));
      console.log("Response Status: " + xhr.myStatus + " Error: " + bodyEncodedInString);

      if (this.options.error) this.options.error(xhr);
    },
    /**
     * Placeholder - each Instance can override this to format the message
     * @return {[type]} [description]
     */

    format: function () {
      return { error: "This call has now formatting message.", message: this.response };
    },
    /**
     * parse arrayBuffer into a ProtoJS response
     * @param  {Array} arrayBuffer
     * @return {void}
     */
    parser: function (arrayBuffer) {
      if(this.options.method === "post"){
        this.response.ParseFromStream(new PROTO.ByteArrayStream(this.abToba(arrayBuffer)));
      }
      else
       this.response = arrayBuffer;
    },
    /**
     * ByteArray to ArrayBuffer
     * @param  {Object} data [description]
     * @return {Array}
     */
    baToab: function (data) {
      var buf = new ArrayBuffer(data.length);

      var bytes = new Uint8Array(buf);
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = data[i] % 256;
      }

      return AvastWRC.Utils.getBrowserInfo().isChrome() ? bytes : buf;
    },
    /**
     * ArrayBuffer to ByteArray
     * @param  {Array} arrayBuffer [description]
     * @return {Array}             [description]
     */
    abToba: function (arrayBuffer) {
      if (arrayBuffer === null) return [];
      var bytes = new Uint8Array(arrayBuffer);
      var arr = [];
      for (var i = 0; i < bytes.length; i++) {
        arr[i] = bytes[i] % 256;
      }
      return arr;
    },
    setBaseIdentityIds: function (identity) {
      if (AvastWRC.CONFIG.GUID !== null) {
        identity.guid = PROTO.encodeUTF8(AvastWRC.CONFIG.GUID);
      }
      if (AvastWRC.CONFIG.AUID !== null) {
        identity.auid = PROTO.encodeUTF8(AvastWRC.CONFIG.AUID);
      }
      if (AvastWRC.CONFIG.USERID !== null) {
        identity.userid = PROTO.encodeUTF8(AvastWRC.CONFIG.USERID);
      }
      return identity;
    },
    setExtIdentityIds: function (identity) {
      if (AvastWRC.CONFIG.UUID) {
        identity.uuid = PROTO.encodeUTF8(AvastWRC.CONFIG.UUID);
      }
      if (AvastWRC.CONFIG.PLG_GUID) {
        identity.plugin_guid = PROTO.encodeUTF8(AvastWRC.CONFIG.PLG_GUID);
      }
      if (AvastWRC.CONFIG.HWID) {
        identity.hwid = PROTO.encodeUTF8(AvastWRC.CONFIG.HWID);
      }
      return identity;
    },
    /**
     * Format Identity message (base identity)
     * @param dnl - do not log = exclude user identification
     * @return {Object} GPB Identity message
     */
    identity: function (dnl) {
      var msg = new AvastWRC.gpb.All.Identity();
      var browserInfo = AvastWRC.Utils.getBrowserInfo();

      if (!dnl) { msg = this.setBaseIdentityIds(msg); }

      msg.browserType = AvastWRC.gpb.All.BrowserType[browserInfo.getBrowser()];

      msg.browserVersion = browserInfo.getBrowserVersion();

      return msg;
    },
    /**
     * Generate extended identity (w/ hwid + uuid) when required
     * @param dnl - do not log = exclude user identification
     */
    extIdentity: function (dnl) {
      var msg = this.identity(dnl);
      return dnl ? msg : this.setExtIdentityIds(msg);
    },
    /**
     * Generate clientIdentity for new UrlInfo format.
     * @param dnl - do not log = exclude user identification
     */
    clientIdentity: function () {
      var avIdentity = new AvastWRC.gpb.All.AvastIdentity();
      var browserInfo = AvastWRC.Utils.getBrowserInfo();

      avIdentity = this.setBaseIdentityIds(avIdentity);
      avIdentity = this.setExtIdentityIds(avIdentity);

      var extInfo = new AvastWRC.gpb.All.BrowserExtInfo();
      extInfo.extensionType = AvastWRC.CONFIG.EXT_TYPE;
      extInfo.extensionVersion = AvastWRC.CONFIG.EXT_VER;
      extInfo.dataVersion = AvastWRC.CONFIG.DATA_VER;
      extInfo.browserType = AvastWRC.gpb.All.BrowserType[browserInfo.getBrowser()];
      extInfo.browserVersion = browserInfo.getBrowserVersion();
      extInfo.os = AvastWRC.gpb.All.OS[browserInfo.os];
      extInfo.osVersion = browserInfo.osVersion;

      var client = new AvastWRC.gpb.All.Client();
      client.id = avIdentity;
      client.type = AvastWRC.gpb.All.Client.CType.BROWSER_EXT;
      client.browserExtInfo = extInfo;
      return client;
    }
  };

/*******************************************************************************
 *
 *  Query Shepherd
 *
 ********************************************************************************/
AvastWRC.Query.Shepherd = function (callback) {
    let SHEPHERD_BASE_URL = {
        0: "https://shepherd.ff.avast.com/", 
        1: "https://shepherd-test-mobile.ff.avast.com/",
        2: "https://shepherd-test-mobile.ff.avast.com/",
        3: "https://shepherd-test-mobile.ff.avast.com/",
    };
    let manifestSplitVersion = AvastWRC.bs.getVersion().split(".");
    let parameters = {
        p_pro: AvastWRC.CONFIG.BRANDING_TYPE === AvastWRC.BRANDING_TYPE_AVAST ? 43 : 72, //43 Avast SafePrice, 72 AVG SafePrice.
        p_hid: AvastWRC.CONFIG.GUID ? AvastWRC.CONFIG.GUID : AvastWRC.CONFIG.PLG_GUID || "",
        p_vep: manifestSplitVersion[0],
        p_ves: manifestSplitVersion[1],
        p_vbd: manifestSplitVersion[2],
        p_bwe: AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Browser.BrowserType[AvastWRC.Utils.getBrowserInfo().getBrowser()],
        p_lng: ABEK.locale.getBrowserLang().toLowerCase()
    };
    let SHEPHERD_CONFIGS = `${SHEPHERD_BASE_URL[AvastWRC.CONFIG.serverType]}${AvastWRC.Utils.buildQueryString(parameters)}`;

    if (AvastWRC.Shepherd.browserCampaign) {
        // Extra parameter for ASB
        SHEPHERD_CONFIGS += `&p_sbcid=${AvastWRC.Shepherd.browserCampaign}`;
     }

    let xhr = new XMLHttpRequest();
    console.log("Shepherd-> Request: " + JSON.stringify(SHEPHERD_CONFIGS));
    xhr.open("GET", SHEPHERD_CONFIGS, true);

    xhr.onreadystatechange = function () {
        let status, data, ttl;

        if (xhr.readyState === 4) {
            status = xhr.status;
            if (status === 200) {
                ttl = xhr.getResponseHeader("ttl");
                data = JSON.parse(xhr.responseText);
                console.log("Shepherd-> Response: " + JSON.stringify(data) + "ttl: " + ttl);
                callback(data, ttl, status);
            } else {
                callback(null, null, status);
            }
        }
    };

    xhr.send();
};

/*******************************************************************************
 *
 *  ende Query Shepherd
 *
 ********************************************************************************/
AvastWRC.Query.CONST.SAFESHOP_FEEDBACK_SERVER = {
    AVAST: "https://www.avast.com/survey-qualtrics?qp_sid=SV_bgeuolgWSBHEQPH",
    AVG: "https://www.avg.com/campaign-landing-pages/survey-qualtrics?qp_sid=SV_5iF6p3DJT4tP8PP"
};

AvastWRC.Query.CONST.SAFESHOP_SERVERS = {
    0: "https://safeprice.ff.avast.com:443",
    1: "https://safeprice-stage.ff.avast.com:443",
    2: "https://safeprice-test.ff.int.avast.com",
    3: "https://safeprice-test.ff.int.avast.com",
};

AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS = {
    0: "/v2/domainInfo",
    1: "/v2/offers",
    2: "/v3/search/offers",
    3: "/v3/search/coupons",
    4: "/v2/redirectOffers?p1=",
    5: "/v3/scrapers",
    6: "/v3/offers",
    7: "/v3/getClientWhiteList"
};

/*******************************************************************************
 *
 *  SafeShopCommon
 *
 ******************************************************************************/
AvastWRC.Query.SafeShopCommon = {
    defaultData: {
        products: [],
        accommodations: [],
        hotelsPriceComp: [],
        hotelsCity: [],
        hotelsSimilar: [],
        vouchersSelectedCounter: 0,
        firstCouponNotApplied: null,
        couponsLength: 0,
        vouchersSelected: false,
        vouchersAvailable: false,
        vouchersCounterBig: false,
        coupons: [],
        redirects: [],
        offerQuery: {},
        showPriceComparisonNotification: true,
        cityName: "",
        searchTitleForOffersTab: "",
        offersRequestTotalLength: 0,
        offerstTotalLength: 0,
        producstLength: 0,
        accommodationsLength: 0,
        priceComparisonLength: 0,
        cityHotelLength: 0,
        similarHoteLength: 0,
        redirectLength: 0,
        rulesLength: 0,
        notifications: {
            notificationType: "",
            notificationName: "none", // on case of error this is the default value to at least create the panel
            defaultPanelTab: "OFFERS_TAB_HIGHLIGHTED",
            diRules: [],
            activeNotification: {}
        },
        offersToBeShown: false,
        couponsToBeShown: false,
        othersToBeShown: false,
        suppress_x_timeout: false
    },

    defaultPanelTabs: {
        "DEFAULT": "OFFERS_TAB_HIGHLIGHTED",
        "BAD_SHOP": "OFFERS_TAB_HIGHLIGHTED",
        "PHISHING": "OFFERS_TAB_HIGHLIGHTED",
        "OFFERS": "OFFERS_TAB_HIGHLIGHTED",
        "OFFERS_AND_COUPONS": "OFFERS_TAB_HIGHLIGHTED",
        "POPULAR_HOTELS": "OFFERS_TAB_HIGHLIGHTED",
        "ALTERNATIVE_HOTELS": "OFFERS_TAB_HIGHLIGHTED",
        "COUPONS": "COUPONS_TAB_HIGHLIGHTED",
        "CHECKOUT_COUPONS": "COUPONS_TAB_HIGHLIGHTED",
        "SPECIAL_DEALS": "OTHERS_TAB_HIGHLIGHTED",
        "": "OFFERS_TAB_HIGHLIGHTED"
    },

    activeNotificationsDefault: {
        "OFFERS": { isOffer: true },
        "ACCOMMODATIONS": { isAccommodations: true },
        "OFFERS_AND_COUPONS": { isOfferAndCoupon: true },
        "ACCOMMODATIONS_AND_COUPONS": { isAccommodationsAndCoupon: true },
        "POPULAR_HOTELS": { isPopularHotel: true },
        "ALTERNATIVE_HOTELS": { isAlternativeHotel: true },
        "COUPONS": { isCoupon: true },
        "SPECIAL_DEALS": { isSpecialDeal: true },
        "CHECKOUT_COUPONS": {isCheckoutCoupon: true}
    },

    formatDIRules: function (resp, res) {
        var offersDIRules = resp.deep_integration;
        if (offersDIRules !== undefined && typeof offersDIRules === "object" && offersDIRules !== null) {
            if (offersDIRules.length > 0) {
                for (var m = 0, n = offersDIRules.length; m < n; m++) {
                    var diRule = offersDIRules[m].values_;
                    if (diRule !== undefined) {
                        var ruleDetails = {
                            id: diRule.id,
                            matchesRequires: diRule.matches_requires,
                            injectAt: diRule.inject_at,
                            injectMethod: diRule.inject_method,
                            template: diRule.template,
                            templateMustache: diRule.template_mustache,
                            clickAction: diRule.click_action,
                            hoverAction: diRule.hover_action,
                            leaveAction: diRule.leave_action,
                            callbackAction: diRule.callback_action,
                            search: []
                        };
                        for (var i = 0, j = diRule.search.length; i < j; i++) {
                            ruleDetails.search.push(diRule.search[i]);
                        }
                        res.notifications.diRules.push(ruleDetails);
                    }
                }
            }
        }
    },

    formatCoupons: function (vouchers, res, couponCategory) {
        var openShopString = AvastWRC.bs.getLocalizedString("spCouponApplied") + `<span class="asp-shopname-span">` + AvastWRC.bs.getLocalizedString("sasOpenShop") + `</span>`;
        if (vouchers && vouchers.length > 0) {
            var vouDetails = {};
            var affiliateName = "";
            for (var m = 0, n = vouchers.length; m < n; m++) {
                var voucher = vouchers[m].values_;
                if (voucher !== undefined) {
                    affiliateName = voucher.affiliate;
                    vouDetails = {
                        title: voucher.title || "",
                        category: voucher.category || "",
                        url: voucher.url || "",
                        affiliate: voucher.affiliate || "",
                        showAffiliateTitle: (voucher.affiliate && voucher.affiliate.length > 17) || false,
                        value: voucher.value || "",
                        expireDate: voucher.expire_date || "",
                        code: (voucher.code) ? !(voucher.code.match(/No code required/gi)) ? voucher.code : "" : "",
                        text: voucher.text || "",
                        couponTextIsLong: (voucher.text && voucher.text.length >= 31) ? voucher.text.slice(0, 31) + "..." : "",
                        freeShipping: voucher.free_shipping || 0,
                        type: voucher.type || 0,
                        selected: AvastWRC.UtilsCache.get("active_coupons", voucher.url) ? true : false,
                        rated: AvastWRC.UtilsCache.get("rated_coupons", voucher.url) ? true : false,
                        providerId: voucher.provider_id,
                        couponCategory: couponCategory,
                        isSearch: couponCategory === "SEARCH" ? 1 : 0,
                        isContextCoupon: couponCategory === "CONTEXT_VOUCHER",
                        spClickThenPaste: affiliateName ? AvastWRC.bs.getLocalizedString("spClickThenPasteSearchResult", [affiliateName]) : AvastWRC.bs.getLocalizedString("spClickThenPaste"),
                        spSearchCouponAppliedOnPage: affiliateName ? AvastWRC.bs.getLocalizedString("spSearchCouponAppliedOnPage", [affiliateName]) : openShopString,
                        spCouponWorksIsLong: AvastWRC.bal.sp.panelData.strings.spCouponWorks.length > 34 || false,
                        spCouponCodeWorksIsLong: AvastWRC.bal.sp.panelData.strings.spCouponCodeWorks.length > 34 || false,
                        affiliateImage: voucher.affiliate_image || "",
                        contextInfo: voucher.context_info || "",
                        affiliateDomain: voucher.affiliate_domain || "",
                        highlight: voucher.highlight || false
                    };
                    affiliateName = "";
                    if (vouDetails.selected) {
                        res.vouchersSelectedCounter++;
                    }
                    else if (!res.firstCouponNotApplied) {
                        res.firstCouponNotApplied = vouDetails;
                    }

                    res.coupons.push(vouDetails);

                    vouDetails = {};
                }
            }

            if (res.coupons.length > 0 && !res.firstCouponNotApplied) {
                res.firstCouponNotApplied = JSON.parse(JSON.stringify(res.coupons[0]));
            }
            res.couponsLength = res.coupons.length;
            res.vouchersSelected = (res.vouchersSelectedCounter > 0) ? true : false;
            res.vouchersAvailable = (res.coupons.length - res.vouchersSelectedCounter > 0) ? true : false;
            res.vouchersCounterBig = (res.vouchersSelectedCounter >= 10) ? true : false;
        }
    },

    formatRedirect: function (resp, res) {
        if (resp && resp.redirect && resp.redirect.length > 0) {
            for (var m = 0, n = resp.redirect.length; m < n; m++) {
                var redirect = resp.redirect[m].values_;
                if (redirect !== undefined) {
                    var redirectImages = AvastWRC.Utils.resolveImageUrl(redirect.primary_image || "", redirect.secondary_image || "", redirect.sub_category);
                    var redDetails = {
                        title: redirect.title || "",
                        url: redirect.url || "",
                        image: redirect.image || AvastWRC.bs.getLocalImageURL("general.png"),
                        formattedPrice: redirect.formatted_price || "",
                        saving: redirect.saving || "",
                        availability: redirect.availability || "",
                        buttonText: redirect.button_text || "",
                        infoText: redirect.info_text || "",
                        primaryImage: redirectImages.primaryImage || "",
                        secondaryImage: redirectImages.secondaryImage || "",
                        barImage: redirectImages.barImage || "",
                        imageTimeout: parseInt(redirect.image_timeout) || 2240,
                        category: redirect.category || 0,
                        subCategory: redirect.sub_category || 0,
                        providerId: redirect.provider_id || "",
                        providerRedirectId: redirect.provider_redirect_id || "",
                        rated: AvastWRC.UtilsCache.get("rated_redirect", redirect.url) ? true : false,
                    };
                    res.redirects.push(redDetails);
                }
            }
            res.redirectLength = res.redirects.length;
        }
    },

    hasPrice: function (price) {
        return price !== "" && price !== "0" && price !== "0.0" && price !== "0,0";
    },

    isLongPrice: function (price) {
        return price && price.length > 10;
    },

    formatProducts: function (resp, res, isSearch = 0) {
        if (resp && resp.product && resp.product.length > 0) {
            for (var m = 0, n = resp.product.length; m < n; m++) {
                var product = resp.product[m].values_;
                if (product !== undefined) {
                    var prodDetails = {
                        title: product.offer.values_.title || "",
                        price: product.offer.values_.price || 0,
                        formattedPrice: product.offer.values_.formatted_price || "",
                        url: product.offer.values_.url || "",
                        affiliate: product.offer.values_.affiliate || "",
                        affiliateDomain: product.offer.values_.affiliate_domain || "",
                        recommended: product.offer.values_.recommended || 0,
                        image: product.offer.values_.image || AvastWRC.bs.getLocalImageURL("search-offers.png"),
                        availability: product.availability || "",
                        availabilityCode: product.availability_code || "",
                        saving: product.saving || "",
                        shipping: product.shipping || "",
                        showPrice: this.hasPrice(product.offer.values_.formatted_price),
                        isLongPrice: this.isLongPrice(product.offer.values_.formatted_price) && product.saving,
                        providerId: product.offer.values_.provider_id,
                        isSearch: isSearch,
                        rated: AvastWRC.UtilsCache.get("rated_product", product.offer.values_.url) ? true : false,
                        productImage: product.product_image || "",
                        queryFormatedPrice: res.offerQuery && res.offerQuery[product.offer.values_.provider_id] ? res.offerQuery[product.offer.values_.provider_id].formatted_price : ""
                    };

                    res.products.push(prodDetails);
                }

            }
            res.producstLength = res.products.length;
        }
    },

    getFullStarImg: function () {
        return AvastWRC.bs.getLocalImageURL("sp-rating-star.png");
    },

    formatAccommodations: function (resp, res, isSearch = 0) {
        if (resp && resp.accommodation && resp.accommodation.length > 0) {
            if (res.notifications.notificationType === "OFFERS") {
                res.notifications.activeNotification = AvastWRC.Query.SafeShopCommon.activeNotificationsDefault.ACCOMMODATIONS;
            }
            else if (res.notifications.notificationType === "OFFERS_AND_COUPONS") {
                res.notifications.activeNotification = AvastWRC.Query.SafeShopCommon.activeNotificationsDefault.ACCOMMODATIONS_AND_COUPONS;
            }
            for (var m = 0, n = resp.accommodation.length; m < n; m++) {
                var accommodation = resp.accommodation[m].values_;
                if (accommodation !== undefined) {
                    var halfStar = ((accommodation.stars_precise % 1).toFixed(4) > 0) ? true : false;
                    var stars = parseInt(accommodation.stars_precise);
                    var starsToShow = (stars < 5 && halfStar) ? stars + 1 : stars;
                    var starsArr = _.range(stars).map(AvastWRC.Query.SafeShopCommon.getFullStarImg);
                    if (halfStar) {
                        starsArr.push(AvastWRC.bs.getLocalImageURL("sp-rating-half-star.png"));
                    }
                    for (starsToShow; starsToShow < 5; starsToShow++) {
                        starsArr.push(AvastWRC.bs.getLocalImageURL("sp-rating-star-grey.png"));
                    }
                    var accomDetails = {
                        title: accommodation.offer.values_.title || "",
                        price: accommodation.offer.values_.price || 0,
                        formattedPrice: accommodation.offer.values_.formatted_price || "",
                        url: accommodation.offer.values_.url || "",
                        affiliate: accommodation.offer.values_.affiliate || "",
                        affiliateDomain: accommodation.offer.values_.affiliate_domain || "",
                        recommended: accommodation.offer.values_.recommended || 0,
                        affiliateImage: accommodation.offer.values_.image || AvastWRC.bs.getLocalImageURL("search-offers.png"),
                        priority: accommodation.priority || 0,
                        address: accommodation.address || "",
                        stars: starsArr || [],
                        starsToShow: starsToShow || 0,
                        originalStars: accommodation.stars || 0,
                        starsPrecise: accommodation.stars_precise || 0,
                        additionalFees: accommodation.additional_fees || 0,
                        priceNetto: accommodation.price_netto || 0,
                        hotel: true,
                        saving: accommodation.saving || "",
                        type: accommodation.type || 0,
                        showPrice: this.hasPrice(accommodation.offer.values_.formatted_price),
                        isLongPrice: this.isLongPrice(accommodation.offer.values_.formatted_price) && accommodation.saving,
                        city: accommodation.city || "",
                        providerId: accommodation.offer.values_.provider_id,
                        isSearch: isSearch,
                        rated: AvastWRC.UtilsCache.get("rated_accommodation", accommodation.offer.values_.url) ? true : false,
                        queryFormatedPrice: res.offerQuery && res.offerQuery[accommodation.offer.values_.provider_id] ? res.offerQuery[accommodation.offer.values_.provider_id].formatted_price : ""
                    };

                    if (res.cityName === "") {
                        res.cityName = accomDetails.city;
                    }
                    if (accomDetails.type === 0 || accomDetails.type === 1) {
                        res.hotelsPriceComp.push(accomDetails);
                    }
                    else if (accomDetails.type === 2) {
                        res.hotelsCity.push(accomDetails);
                    }
                    else if (accomDetails.type === 3) {
                        res.hotelsSimilar.push(accomDetails);
                    }
                    res.accommodations.push(accomDetails);
                }
            }
            res.accommodationsLength = res.accommodations.length;
            res.priceComparisonLength = res.hotelsPriceComp.length;
            res.cityHotelLength = res.hotelsCity.length;
            res.similarHoteLength = res.hotelsSimilar.length;
        }
    },

    buildQueryMessage: function (parserResults) {
        let providerQueries = [];
        parserResults.forEach(result => {
            let providerQuery = new AvastWRC.gpb.All.SafeShopOffer.OfferRequest.ProviderQuery();
            providerQuery.provider_id = result.providerId;
            providerQuery.query = JSON.stringify(result.query);
            providerQueries.push(providerQuery);
        });
        return providerQueries;
    },

    formatResponseQueryMesasge: function (resp, res) {
        if (resp && resp.query && resp.query.length > 0) {
            let queryDetails = {};
            for (var m = 0, n = resp.query.length; m < n; m++) {
                if (resp.query[m].values_ && resp.query[m].values_.provider_id) {
                    res.offerQuery[resp.query[m].values_.provider_id] = {
                        price: resp.query[m].values_.price || 0,
                        formatted_price: resp.query[m].values_.formatted_price || ""
                    };
                }
            }
        }
    },

    buildUrlInfoFlagsMessage: function (urlData) {
        let urlInfoFlag = new AvastWRC.gpb.All.SafeShopOffer.OfferRequest.UrlinfoFlags();
        urlInfoFlag.is_fake_shop = urlData.isfakeShop;
        urlInfoFlag.is_trusted_fake_fhop = urlData.isTrustedFakeShop;
        urlInfoFlag.is_phishing = urlData.isPhishing;
        urlInfoFlag.is_trusted_phishing = urlData.isTrustedPhishing;
        return urlInfoFlag;
    },

    buildNotificationsFlagsMessage: function (notificationsFlag) {
        let notificationFlags = new AvastWRC.gpb.All.SafeShopOffer.OfferRequest.NotificationFlags();
        notificationFlags.minimized = notificationsFlag.minimized;
        notificationFlags.all_disabled = notificationsFlag.allDisabled;
        notificationFlags.disabled_for_redirect = notificationsFlag.disabledForRedirect;
        notificationFlags.disabled_for_offers = notificationsFlag.disabledForOffers;
        notificationFlags.disabled_for_coupons = notificationsFlag.disabledForCoupons;
        notificationFlags.disabled_for_accommodation = notificationsFlag.disabledForAccommodation;
        notificationFlags.disabled_for_offers_coupons = notificationsFlag.disabledForOffersCoupons;
        notificationFlags.disabled_for_accommodation_coupons = notificationsFlag.disabledForAccommodationCoupons;
        notificationFlags.disabled_for_city_hotels = notificationsFlag.disabledForCityHotels;
        notificationFlags.disabled_for_similar_hotels = notificationsFlag.disabledForSimilarHotels;
        return notificationFlags;
    },

    getSearchTitleForOffersTab: function (parserResults) {
        let title = "";
        parserResults.forEach(pRes => {
            if (pRes.query) {
                if (pRes.query.title) {
                    if (typeof pRes.query.title === "string") {
                        title = pRes.query.title;
                    } else if (typeof pRes.query.title === "object" && pRes.query.title[0]) {
                        title = pRes.query.title[0];
                    }
                    return title;
                }
                else if (pRes.query.result && pRes.query.result.t) {
                    if (typeof pRes.query.result.t === "string") {
                        title = pRes.query.result.t;
                    } else if (typeof pRes.query.result.t === "object" && pRes.query.result.t[0]) {
                        title = pRes.query.result.t[0];
                    }
                    return title;
                }
            }
        });
        return title;
    },

    updateFakeShopDataOnError: function (urlData, data) {
        if ((urlData.isfakeShop && !urlData.isTrustedFakeShop) ||
            (urlData.isPhishing && !urlData.isTrustedPhishing)) {
            if (urlData.isfakeShop) {
                data.notificationType = "BAD_SHOP";
            } else {
                data.notificationType = "PHISHING";
            }
            data.notificationName = "fakeShopPanel";
        }
    }
};
/*******************************************************************************
 *
 *  Scrapers
 *
 ******************************************************************************/
AvastWRC.Query.Scrapers = function (options) {
    if (!options.url) return false; // no page data
    let server = AvastWRC.storageCache.get("sp_debug_server") || AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType];
    this.options = _.extend({
        server: server + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[5],
        method: "post",
        timeout: 10000, // 10s
        client_info: {},
        url: null,
        callback: _.noop,
        format: "object", // return response in JSON
        go: true, // true = trigger the request immediately
    }, options);

    this.request = new AvastWRC.gpb.All.SafeShopOffer.ScraperRequest();
    this.response = new AvastWRC.gpb.All.SafeShopOffer.ScraperResponse();

    this.init();
};

AvastWRC.Query.Scrapers.prototype = _.extend({}, AvastWRC.Query.__MASTER__, {
    /**
     * build PROTO message
     */
    message: function () {
        //-- TODO - will be served by proxy server
        this.request.client_info = AvastWRC.Utils.getClientInfoMessage(this.options.clientInfo);
        this.request.url = AvastWRC.Utils.encodeNotAllowedChar(this.options.url);
        this.request.is_affiliate = this.options.urlData.is_affiliate;
        return this;
    },

    /**
     * Create an instance(s) of AvastWRC.Scrapers object
     * @return {Object}
     */
    format: function () {
        var resp = this.response.values_;
        //console.log("response from Backend not parsed: ", resp);

        var res = {
            scrapers: [],
            country: "",
            continue: false
        };

        var cachedData = AvastWRC.TabReqCache.get(this.options.tab.id, "safePriceInTab");
        if (cachedData && cachedData.clientInfo && typeof cachedData.clientInfo === "string") {
            let clientIndo = JSON.parse(cachedData.clientInfo);
            if (clientIndo.transaction_id !== this.options.clientInfo.transaction_id) {
                console.log("Drop this request there is another request with a different transaction ID in progress");
                return res;
            }
        }


        if (this.errorNotifications) {
            res.notifications = this.errorNotifications;
            this.errorNotifications = null;
        }

        if (resp !== undefined && typeof resp === "object" && resp !== null) {
            if (resp.continue) {

                res.continue = resp.continue;

                res.country = resp.country || "";

                if (resp.scraper !== undefined && typeof resp.scraper === "object" && resp.scraper.length > 0) {
                    var scraper = resp.scraper;
                    for (var m = 0, n = scraper.length; m < n; m++) {
                        res.scrapers.push({
                            providerId: scraper[m].provider_id,
                            scraperScript: scraper[m].scraper_script
                        });
                    }
                }
            }
        }
        return res;
    },

    error: function () {
        let data = {
            scrapers: [],
            country: "",
            continue: false
        };
        this.errorNotifications = {
            notificationType: "",
            notificationName: "none", // on case of error this is the default value to at least create the panel
            defaultPanelTab: "OFFERS_TAB_HIGHLIGHTED",
            diRules: [],
            activeNotification: {}
        };
        AvastWRC.Query.SafeShopCommon.updateFakeShopDataOnError(this.options.urlData, this.errorNotifications);
        return data;
    }
});

/*******************************************************************************
 *
 *  SafeShopOffer
 *
 ******************************************************************************/

AvastWRC.Query.SafeShopOffer = function (options) {
    if (!options.url) return false; // no page data
    let server = AvastWRC.storageCache.get("sp_debug_server") || AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType];
    this.options = _.extend({
        server: server + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[6],
        method: "post",
        timeout: 10000, // 10s
        url: null,
        callback: _.noop,
        format: "object", // return response in JSON
        go: true, // true = trigger the request immediately
    }, options);

    this.request = new AvastWRC.gpb.All.SafeShopOffer.OfferRequest();
    this.response = new AvastWRC.gpb.All.SafeShopOffer.OfferResponse();

    this.init();
};

AvastWRC.Query.SafeShopOffer.prototype = _.extend({}, AvastWRC.Query.__MASTER__, {
    /**
     * build PROTO message
     */
    message: function () {
        //-- TODO - will be served by proxy server
        this.request.url = AvastWRC.Utils.encodeNotAllowedChar(this.options.url);

        this.request.client_info = AvastWRC.Utils.getClientInfoMessage(this.options.clientInfo);

        this.request.provider_query = AvastWRC.Query.SafeShopCommon.buildQueryMessage(this.options.parserResults);

        this.request.url_info_flag = AvastWRC.Query.SafeShopCommon.buildUrlInfoFlagsMessage(this.options.urlData);

        this.request.notification_flags = AvastWRC.Query.SafeShopCommon.buildNotificationsFlagsMessage(this.options.notificationsFlag);

        return this;
    },

    /**
     * Create an instance(s) of AvastWRC.SafeShopOffer object
     * @return {Object}
     */
    format: function () {
        var resp = this.response.values_;
        //console.log("response from Backend not parsed: ", JSON.stringify(resp));
        var res = JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));

        var cachedData = AvastWRC.TabReqCache.get(this.options.tab.id, "safePriceInTab");
        if (cachedData && cachedData.clientInfo && typeof cachedData.clientInfo === "string") {
            let clientIndo = JSON.parse(cachedData.clientInfo);
            if (clientIndo.transaction_id !== this.options.clientInfo.transaction_id) {
                console.log("Drop this request there is another request with a different transaction ID in progress");
                return res;
            }
            if(clientIndo.request_id !== this.options.clientInfo.request_id){
                console.log("Drop this request there is another request with a different request_id in progress");
                return res;
            }
        }

        res.showPriceComparisonNotification = (resp.available_price_comparison !== undefined) ? resp.available_price_comparison : true;

        if (resp && resp.notification) {
            res.notifications.notificationType = AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification.NotificationType[resp.notification.type || 0];
            res.notifications.notificationName = resp.notification.name || "none"; // if no template update the panel
            AvastWRC.Query.SafeShopCommon.formatDIRules(resp.notification, res);
        }
        if (this.errorNotifications) {
            res.notifications = this.errorNotifications;
            this.errorNotifications = null;
        }

        // checkout coupons AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification.NotificationType[10]
        res.suppress_x_timeout = (res.notifications.notificationType === AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification.NotificationType[10]) ? true : false; 

        res.notifications.defaultPanelTab = AvastWRC.Query.SafeShopCommon.defaultPanelTabs[res.notifications.notificationType];
        if (res.notifications.defaultPanelTab === "") {
            if (res.redirectLength > 0) {
                res.notifications.defaultPanelTab = AvastWRC.Query.SafeShopCommon.defaultPanelTabs.SPECIAL_DEALS;
            }
            else if (res.couponsLength > 0) {
                res.notifications.defaultPanelTab = AvastWRC.Query.SafeShopCommon.defaultPanelTabs.COUPONS;
            }
            else {
                res.notifications.defaultPanelTab = AvastWRC.Query.SafeShopCommon.defaultPanelTabs.OFFERS;
            }
        }

        res.notifications.activeNotification = AvastWRC.Query.SafeShopCommon.activeNotificationsDefault[res.notifications.notificationType];

        if (resp.query && resp.query.length > 0) {
            AvastWRC.Query.SafeShopCommon.formatResponseQueryMesasge(resp, res);
        }
        if (resp && resp.product && resp.product.length > 0) {
            res.searchTitleForOffersTab = AvastWRC.Query.SafeShopCommon.getSearchTitleForOffersTab(this.options.parserResults);
            AvastWRC.Query.SafeShopCommon.formatProducts(resp, res);
        }
        if (resp && resp.accommodation && resp.accommodation.length > 0) {
            res.searchTitleForOffersTab = AvastWRC.Query.SafeShopCommon.getSearchTitleForOffersTab(this.options.parserResults);
            AvastWRC.Query.SafeShopCommon.formatAccommodations(resp, res);
        }
        if (resp && resp.context_voucher && resp.context_voucher.length > 0) {
            AvastWRC.Query.SafeShopCommon.formatCoupons(resp.context_voucher, res, "CONTEXT_VOUCHER");
        }
        if (resp && resp.voucher && resp.voucher.length > 0) {
            AvastWRC.Query.SafeShopCommon.formatCoupons(resp.voucher, res, "VOUCHER");
        }
        if (resp && resp.redirect && resp.redirect.length > 0) {
            AvastWRC.Query.SafeShopCommon.formatRedirect(resp, res);
        }

        res.offersRequestTotalLength = res.producstLength +
            res.accommodationsLength +
            res.couponsLength +
            res.redirectLength;

        res.offerstTotalLength = res.producstLength + res.accommodationsLength;

        return res;
    },

    error: function () {
        this.errorNotifications = {
            notificationType: "",
            notificationName: "none", // on case of error this is the default value to at least create the panel
            defaultPanelTab: "OFFERS_TAB_HIGHLIGHTED",
            diRules: [],
            activeNotification: {}
        };
        AvastWRC.Query.SafeShopCommon.updateFakeShopDataOnError(this.options.urlData, this.errorNotifications);
        return JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));
    },
    /**
     * url info message type
     * @return {Strinng} call
     */
    getCallerid: function () {
        return AvastWRC.CONFIG.CALLERID;
    },
});

/*******************************************************************************
*
*  SearchOffers
*
******************************************************************************/

AvastWRC.Query.SearchOffers = function (options) {
    if (!options.url && !options.query) return false; // no page data
    let server = AvastWRC.storageCache.get("sp_debug_server") || AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType];
    this.options = _.extend({
        server: server + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[2],
        method: "post",
        timeout: 10000, // 10s
        url: null,
        query: null,
        client_info: {},
        provider_id: null,
        category: [],
        state: null,
        explicit_request: null,
        callback: _.noop,
        format: "object", // return response in JSON
        go: true, // true = trigger the request immediately
    }, options);

    this.request = new AvastWRC.gpb.All.SafeShopOffer.SearchOfferRequest();
    this.response = new AvastWRC.gpb.All.SafeShopOffer.SearchOfferResponse();

    this.init();
};

AvastWRC.Query.SearchOffers.prototype = _.extend({}, AvastWRC.Query.__MASTER__, {
    /**
     * build PROTO message
     */
    message: function () {
        //-- TODO - will be served by proxy server
        this.request.url = AvastWRC.Utils.encodeNotAllowedChar(this.options.url);
        this.request.query = this.options.query;
        if (this.options.provider_id && this.options.provider_id !== "") {
            this.request.provider_id.push(this.options.provider_id);
        }
        this.request.client_info = AvastWRC.Utils.getClientInfoMessage(this.options.clientInfo);
        return this;
    },

    /**
     * Create an instance(s) of AvastWRC.SafeShopOffer object
     * @return {Object}
     */
    format: function () {
        var resp = this.response.values_;
        //console.log("response from Backend not parsed: ", JSON.stringify(resp));
        var res = JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));
        res.isOffersSearch = true;
        res.couponsTabHaveSearch = this.options.couponsTabHaveSearch || false;
        res.offersTabHaveSearch = this.options.offersTabHaveSearch || true;
        res.providerId = "";

        AvastWRC.Query.SafeShopCommon.formatProducts(resp, res, 1/*is search*/);

        AvastWRC.Query.SafeShopCommon.formatAccommodations(resp, res, 1/*is search*/);

        if (res.producstLength > 0) {
            res.providerId = res.products[0].providerId || "";
        }
        else if (res.accommodationsLength > 0) {
            res.providerId = res.accommodations[0].providerId || "";
        }

        res.offerstTotalLength = res.producstLength + res.accommodationsLength;

        return res;
    },
    error: function () {
        var res = JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));
        res.isOffersSearch = true;
        res.couponsTabHaveSearch = this.options.couponsTabHaveSearch || false;
        res.offersTabHaveSearch = this.options.offersTabHaveSearch || true;
        res.providerId = "";
        return res;
    },
});

/*******************************************************************************
 *
 *  SearchCoupons
 *
 ******************************************************************************/
AvastWRC.Query.SearchCoupons = function (options) {
    if (!options.url && !options.query) return false; // no page data
    let server = AvastWRC.storageCache.get("sp_debug_server") || AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType];
    this.options = _.extend({
        server: server + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[3],
        method: "post",
        timeout: 10000, // 10s
        url: null,
        query: null,
        client_info: {},
        provider_id: null,
        category: [],
        state: null,
        explicit_request: null,
        callback: _.noop,
        format: "object", // return response in JSON
        go: true, // true = trigger the request immediately
    }, options);

    this.request = new AvastWRC.gpb.All.SafeShopOffer.SearchCouponRequest();
    this.response = new AvastWRC.gpb.All.SafeShopOffer.SearchCouponResponse();

    this.init();
};

AvastWRC.Query.SearchCoupons.prototype = _.extend({}, AvastWRC.Query.__MASTER__, {
    /**
     * build PROTO message
     */
    message: function () {
        //-- TODO - will be served by proxy server
        this.request.url = AvastWRC.Utils.encodeNotAllowedChar(this.options.url);
        this.request.query = this.options.query;
        if (this.options.provider_id && this.options.provider_id !== "") {
            this.request.provider_id.push(this.options.provider_id);
        }
        this.request.client_info = AvastWRC.Utils.getClientInfoMessage(this.options.clientInfo);
        return this;
    },

    /**
     * Create an instance(s) of AvastWRC.Scrapers object
     * @return {Object}
     */
    format: function () {
        var resp = this.response.values_;
        //console.log("response from Backend not parsed: ", JSON.stringify(resp));
        var res = JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));
        res.isCouponsSearch = true;
        res.couponsTabHaveSearch = this.options.couponsTabHaveSearch || false;
        res.offersTabHaveSearch = this.options.offersTabHaveSearch || true;
        res.providerId = "";

        AvastWRC.Query.SafeShopCommon.formatCoupons(resp.voucher, res, "SEARCH");

        if (res.couponsLength > 0) {
            res.providerId = res.coupons[0].providerId || "";
        }
        return res;
    },
    error: function () {
        var res = JSON.parse(JSON.stringify(AvastWRC.Query.SafeShopCommon.defaultData));
        res.isCouponsSearch = true;
        res.couponsTabHaveSearch = this.options.couponsTabHaveSearch || false;
        res.offersTabHaveSearch = this.options.offersTabHaveSearch || true;
        res.providerId = "";
        return res;
    }
});

/*******************************************************************************
 *
 *  DomainWhiteList
 *
 ******************************************************************************/
AvastWRC.Query.DomainWhiteList = function (options) {
    let server = AvastWRC.storageCache.get("sp_debug_server") || AvastWRC.Query.CONST.SAFESHOP_SERVERS[AvastWRC.CONFIG.serverType];
    this.options = _.extend({
        server: server + AvastWRC.Query.CONST.SAFESHOP_ENDPOINTS[7],
        method: "get",
        timeout: 10000, // 10s
        url: null,
        query: null,
        client_info: {},
        provider_id: null,
        category: [],
        state: null,
        explicit_request: null,
        callback: _.noop,
        format: "object", // return response in JSON
        go: true, // true = trigger the request immediately
        headers: {
            "Content-Type": "text/html",
          },
    }, options);

    this.request = {};
    this.response = {};

    this.init();
};

AvastWRC.Query.DomainWhiteList.prototype = _.extend({}, AvastWRC.Query.__MASTER__, {
    /**
     * build PROTO message
     */
    message: function () {
        return this;
    },

    /**
     * Create an instance(s) of AvastWRC.Scrapers object
     * @return {Object}
     */
    format: function () {
        let resp = [];
        if(!this.wlResponseError)
            resp = this.response.split("\n");
        return resp;
    },
    error: function () {
        this.wlResponseError = true;
        return [];
    }
});
}).call(this, _, AvastWRC, AvastWRC.PROTO);