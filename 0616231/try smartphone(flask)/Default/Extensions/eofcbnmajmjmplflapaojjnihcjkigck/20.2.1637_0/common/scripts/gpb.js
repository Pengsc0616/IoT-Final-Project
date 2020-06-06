(function(AvastWRC, PROTO) {
    'use strict';


    function gpbType(id, multilicity, typeFunc) {
        return {
            options: {},
            multiplicity: multilicity || PROTO.optional,
            type: typeFunc,
            id: id
        };
    }

    /* GPB Definition helper */
    var GPBD = {
        bytes: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.bytes; });
        },
        string: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.string; });
        },
        bool: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.bool; });
        },
        sint32: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.sint32; });
        },
        sint64: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.sint64; });
        },
        int32: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.int32; });
        },
        int64: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.int64; });
        },
        Double: function (id, repeated) {
            return gpbType(id, repeated, function () { return PROTO.Double; });
        },
        cType: gpbType
    };


    AvastWRC.gpb = {};

    AvastWRC.gpb.All = PROTO.Message("AvastWRC.gpb.All", {

        LocalServerRequest: PROTO.Message("AvastWRC.gpb.All.LocalServerRequest", {

            BrowserType: PROTO.Enum("AvastWRC.gpb.All.LocalServerRequest.BrowserType", {
                INVALID: 0,
                IE: 1,
                FIREFOX: 2,
                CHROME: 3,
                OPERA: 4,
                SAFARI: 5
            }),

            CommandType: PROTO.Enum("AvastWRC.gpb.All.LocalServerRequest.CommandType", {
                ACKNOWLEDGEMENT: 1,
                SET_PROPERTY: 3,
                SITECORRECT: 4,
                SITECORRECT_STATISTICS: 5,
                IS_SAFEZONE_AVAILABLE: 6,
                SWITCH_TO_SAFEZONE: 7,
                LOG_MESSAGE: 9,
                GET_GUIDS: 10,
                GET_PROPERTIES: 11,
                IS_BANKING_SITE: 12,
                IS_SAFEZONE_CUSTOM_SITE: 13,
                GET_BCU_DISTRIBUTION_ID: 16
            }),

            type: GPBD.cType(1, PROTO.optional, function () { return AvastWRC.gpb.All.LocalServerRequest.CommandType; }),
            params: GPBD.bytes(2, PROTO.repeated),
            browser: GPBD.cType(3, PROTO.optional, function () { return AvastWRC.gpb.All.LocalServerRequest.BrowserType; })
        }),

        LocalServerResponse: PROTO.Message("AvastWRC.gpb.All.LocalServerResponse", {
            result: GPBD.bytes(1, PROTO.repeated),
            error: GPBD.bytes(2),
        })
    });

(function(PROTO) {

/*******************************************************************************
 * > SafeShopOffer (also used by burger events if we do a change here we need 
 *                  to update also burger lib and burger project)
 ******************************************************************************/
    AvastWRC.gpb.All.SafeShopOffer = PROTO.Message("AvastWRC.gpb.All.SafeShopOffer",{
        /**********************************************************************/
        /* message ClientInfo                                                 */
        /**********************************************************************/
        ClientInfo: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo",{

            Browser: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Browser",{

                BrowserType: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Browser.BrowserType",{
                    CHROME: 0,
                    FIREFOX: 1,
                    IE: 2,
                    OPERA: 3,
                    SAFARI: 4,
                    MS_EDGE: 5,
                    AVAST: 6
                }),

                type: GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Browser.BrowserType;}), // same values as on UrlInfo-> BrowserType
                version: GPBD.string(2, PROTO.optional),
                language: GPBD.string(3, PROTO.optional)                
            }),

            Extension: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Extension",{
                
                ExtensionType: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Extension.ExtensionType",{
                    SP: 0, // SafePrice multiprovider extension
                    SPAP: 1 // SafePrice multiprovider together with AvastPay
                }),

                type: GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Extension.ExtensionType;}), // same values as on UrlInfo ExtensionType
                version: GPBD.string(2, PROTO.optional)                
            }),	

            Client: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Client",{
                AVAST : 0,
                AVG : 1,
            }),

            UserSettings: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings",{
                
                Advanced: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced",{

                    OffersConfigs: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.OffersConfigs",{

                        OffersVisibility: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.OffersConfigs.OffersVisibility",{
                            SHOW_ALL_OFFERS: 0,
                            SHOW_BETTER_THAN_ORIGINAL_PRICE: 1,
                            USE_OFFER_LIMIT: 2,
                            DO_NOT_SHOW: 3,
                        }),
    
                        offer_limit: GPBD.int32(1,PROTO.optional),
                        include_flag: GPBD.int32(2,PROTO.optional), //  bit mask:
                                                                    //  eShop = 1
                                                                    //  accommodation = 2
                                                                    //  special = 4
                        offers_visibility: GPBD.cType(3, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.OffersConfigs.OffersVisibility;}),
                        accommodation_limit: GPBD.int32(4,PROTO.optional),                    
                    }),
    
                    CouponsConfigs: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.CouponsConfigs",{
    
                        CouponsVisibility: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.CouponsConfigs.CouponsVisibility",{
                            SHOW_ALWAYS: 0,
                            SHOW_ON_FIRST_VISIT: 1,
                            DO_NOT_NOTIFY: 2
                        }),
                        coupons_visibility: GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.CouponsConfigs.CouponsVisibility;}),
                        include_flag: GPBD.int32(2,PROTO.optional), //  bit mask:
                                                                    //  eShop = 1
                                                                    //  accommodation = 2
                                                                    //  special = 4
                    }),

                    RedirectConfigs: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.RedirectConfigs",{
    
                        RedirectVisibility: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.RedirectConfigs.RedirectVisibility",{
                            SHOW_ALWAYS: 0,
                            DO_NOT_NOTIFY: 1
                        }),
    
                        redirect_visibility: GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.RedirectConfigs.RedirectVisibility;})
                        
                    }),

                    offers_configs: GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.OffersConfigs;}),
                    coupons_configs: GPBD.cType(2, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.CouponsConfigs;}),
                    redirect_configs: GPBD.cType(3, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced.RedirectConfigs;})                   
                }),

                show_automatic: GPBD.bool(1, PROTO.optional), // same values as on UrlInfo ExtensionType
                advanced: GPBD.cType(2, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings.Advanced;}),
                custom_list: GPBD.string(3, PROTO.repeated)
            }),	

            language:               GPBD.string(1, PROTO.optional),
            referer:                GPBD.string(2, PROTO.optional), 
            extension_guid:         GPBD.string(3, PROTO.optional),
            browser:                GPBD.cType(4, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Browser;}),     
            extension:              GPBD.cType(5, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Extension;}),
            client:                 GPBD.cType(6, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.Client;}),
            guid:                   GPBD.string(7, PROTO.optional),
            campaign_id:            GPBD.string(8, PROTO.optional),
            user_settings:          GPBD.cType(9, PROTO.optional, function() {return AvastWRC.gpb.All.SafeShopOffer.ClientInfo.UserSettings;}),
            transaction_id:         GPBD.string(10, PROTO.optional),
            install_time:           GPBD.sint64(11, PROTO.optional),
            source_id:              GPBD.string(12, PROTO.optional),
            request_id:             GPBD.string(13, PROTO.optional)
        }),

        /**********************************************************************/
        /* Endpoint: /v3/scrapers                                             */
        /**********************************************************************/
        ScraperRequest: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ScraperRequest",{

            client_info:            GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo;}),
            url:                    GPBD.string(2, PROTO.optional),
            is_affiliate:           GPBD.bool(3, PROTO.optional)
        }),

        ScraperResponse: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ScraperResponse",{

            ProviderScraper: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.ScraperResponse.ProviderScraper",{
                provider_id:            GPBD.string(1, PROTO.optional),
                scraper_script:         GPBD.string(2, PROTO.optional), 
            }),

            scraper:   GPBD.cType(1, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.ScraperResponse.ProviderScraper;}),
            country:   GPBD.string(2, PROTO.optional),
            continue:  GPBD.bool(3, PROTO.optional)
        }),
        /**********************************************************************/
        /* Endpoint: /v3/offers                                               */
        /**********************************************************************/
        OfferRequest : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferRequest",{

            ProviderQuery: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferRequest.ProviderQuery",{
                provider_id:   GPBD.string(1, PROTO.optional),
                query:         GPBD.string(2, PROTO.optional)
            }),

            UrlinfoFlags: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferRequest.UrlinfoFlags",{
                is_fake_shop:           GPBD.bool(1, PROTO.optional),
                is_trusted_fake_fhop:   GPBD.bool(2, PROTO.optional),
                is_phishing:            GPBD.bool(3, PROTO.optional),
                is_trusted_phishing:    GPBD.bool(4, PROTO.optional)
            }),

            NotificationFlags: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferRequest.NotificationFlags",{
                minimized:                              GPBD.bool(1, PROTO.optional),
                all_disabled:                           GPBD.bool(2, PROTO.optional),
                disabled_for_redirect:                  GPBD.bool(3, PROTO.optional),
                disabled_for_offers:                    GPBD.bool(4, PROTO.optional),
                disabled_for_coupons:                   GPBD.bool(5, PROTO.optional),
                disabled_for_accommodation:             GPBD.bool(6, PROTO.optional),
                disabled_for_offers_coupons:            GPBD.bool(7, PROTO.optional),
                disabled_for_accommodation_coupons:     GPBD.bool(8, PROTO.optional),
                disabled_for_city_hotels:               GPBD.bool(9, PROTO.optional),
                disabled_for_similar_hotels:            GPBD.bool(10, PROTO.optional)
            }),

            client_info:            GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo;}),
            provider_query:         GPBD.cType(2, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferRequest.ProviderQuery;}),
            url:                    GPBD.string(3, PROTO.optional),
            url_info_flag:          GPBD.cType(4, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferRequest.UrlinfoFlags;}),
            notification_flags:     GPBD.cType(5, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferRequest.NotificationFlags;}),
            available_template:     GPBD.string(6, PROTO.repeated)
        }),

        OfferResponse : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse",{

            GeneralOffer: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.GeneralOffer",{
                title:              GPBD.string(1, PROTO.optional),
                price:              GPBD.Double(2, PROTO.optional),
                formatted_price:    GPBD.string(3, PROTO.optional),
                url:                GPBD.string(4, PROTO.optional),
                affiliate:          GPBD.string(5, PROTO.optional),
                //recommended:        GPBD.bool(6, PROTO.optional),
                image:              GPBD.string(7, PROTO.optional),
                ignored :           GPBD.bool(8, PROTO.optional),
                provider_id:        GPBD.string(9, PROTO.optional),
                affiliate_domain:   GPBD.string(10, PROTO.optional)
            }),

            Product: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Product",{
                offer:             GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.GeneralOffer;}),
                availability:      GPBD.string(2,PROTO.optional),
                availability_code: GPBD.string(3,PROTO.optional), 
                saving:            GPBD.string(4,PROTO.optional),  
                shipping:          GPBD.string(5,PROTO.optional),
                product_image:     GPBD.string(6,PROTO.optional)
            }),

            Accommodation: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Accommodation",{
                AccommodationType: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Accommodation.AccommodationType",{
                    UNKNOWN: 0,
                    HOTEL: 1,
                    CITY_HOTEL: 2,
                    SIMILAR_HOTEL: 3 
                }),	
                offer:             GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.GeneralOffer;}),
                priority:          GPBD.int32(2,PROTO.optional),
                address:           GPBD.string(3,PROTO.optional), 
                stars:             GPBD.int32(4, PROTO.optional),  
                additional_fees:   GPBD.bool(5, PROTO.optional),
                price_netto:       GPBD.Double(6, PROTO.optional),
                saving:            GPBD.string(7, PROTO.optional),
                type:              GPBD.cType(8, PROTO.optional, function(){ return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Accommodation.AccommodationType;}),
                stars_precise:     GPBD.Double(9, PROTO.optional),
                city:              GPBD.string(10, PROTO.optional)

            }),

            Voucher : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher",{
                VoucherType: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher.VoucherType",{
                    GENERAL: 0,
                    PRODUCT: 1,
                    ACCOMMODATION: 2,
                    SIMILAR: 3,
                }),
                title:             GPBD.string(1, PROTO.optional),
                category :         GPBD.string(2, PROTO.optional),
                url :              GPBD.string(3, PROTO.optional),
                affiliate :        GPBD.string(4, PROTO.optional),
                value :            GPBD.string(5, PROTO.optional),
                expire_date :      GPBD.string(6, PROTO.optional),
                code :             GPBD.string(7, PROTO.optional),
                text :             GPBD.string(8, PROTO.optional),
                free_shipping :    GPBD.bool(9, PROTO.optional),            
                type:              GPBD.cType(10, PROTO.optional, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher.VoucherType;}),
                ignored :          GPBD.bool(11, PROTO.optional),
                provider_id:       GPBD.string(12, PROTO.optional),
                affiliate_image:   GPBD.string(13, PROTO.optional),
                context_info:      GPBD.string(14, PROTO.contextInfo),
                affiliate_domain:  GPBD.string(15, PROTO.affiliateDomain),
                highlight:         GPBD.bool(16, PROTO.optional)
            }), 
            
            Redirect : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect",{
                RedirectCategory: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect.RedirectCategory",{
                    UNKNOWN_CATEGORY: 0,
                    FINANCE: 1,
                    PRICE_COMPARISON: 2,
                    SECURITY: 3,
                    INSURANCE: 4,
                    DEAL: 5,
                    TRAVEL: 6,
                }),
                RedirectSubCategory: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect.RedirectSubCategory",{
                    UNKNOWN_SUBCATEGORY: 0,
                    PAYDAY_LOANS: 1,
                    PERSONAL_LOANS: 2,
                    BUISNESS_LOANS: 3,
                    MORTGAGE: 4,
                    GAS: 5,
                    ELECTRICITY: 6,
                    HOME_SECURITY: 7,
                    HEALTH_INSURANCE: 8,
                    ELECTRONICS: 9,
                    CAR_RENTAL: 10,
                    FLIGHTS: 11,
                    WEB_HOSTING: 12,
                    INTERNET: 13,
                    HOME: 14
                }),
            
                title:                  GPBD.string(1, PROTO.optional),
                url :                   GPBD.string(2, PROTO.optional),
                image:                  GPBD.string(3, PROTO.optional),
                formatted_price:        GPBD.string(4, PROTO.optional),
                availability:           GPBD.string(5, PROTO.optional),
                button_text:            GPBD.string(6, PROTO.optional),
                info_text:              GPBD.string(7, PROTO.optional),
                ignored:                GPBD.bool(8, PROTO.optional),
                primary_image:          GPBD.string(9, PROTO.optional),
                secondary_image:        GPBD.string(10, PROTO.optional),
                image_timeout:          GPBD.string(11, PROTO.optional),
                category:               GPBD.cType(12, PROTO.optional, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect.RedirectCategory;}),
                sub_category:           GPBD.cType(13, PROTO.optional, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect.RedirectSubCategory;}),
                provider_id:            GPBD.string(14, PROTO.optional),
                provider_redirect_id:   GPBD.string(15, PROTO.optional),
                saving:                 GPBD.string(16, PROTO.optional)
            }),
            
            Query : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Query",{
                price:             GPBD.Double(1, PROTO.optional),
                formatted_price:   GPBD.string(2, PROTO.optional),
                provider_id:       GPBD.string(3, PROTO.optional)
            }), 

            DeepIntegrationRule : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.DeepIntegrationRule",{
                id:                     GPBD.string(1, PROTO.optional),
                search:                 GPBD.string(2, PROTO.repeated),
                matches_requires:       GPBD.string(3, PROTO.optional),
                inject_at:              GPBD.string(4, PROTO.optional),
                inject_method:          GPBD.string(5, PROTO.optional),
                template:               GPBD.string(6, PROTO.optional),
                click_action:           GPBD.string(7, PROTO.optional),
                hover_action:           GPBD.string(8, PROTO.optional),
                leave_action:           GPBD.string(9, PROTO.optional),
                callback_action:        GPBD.string(10, PROTO.optional),
                template_mustache:      GPBD.string(11, PROTO.optional),
            }),

            Notification : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification",{
                NotificationType: PROTO.Enum("AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification.NotificationType",{
                    DEFAULT: 0,
                    BAD_SHOP: 1,
                    PHISHING: 2,
                    MINIMIZED: 3,
                    SPECIAL_DEALS: 4,
                    OFFERS_AND_COUPONS: 5,
                    OFFERS: 6,
                    ALTERNATIVE_HOTELS: 7,
                    POPULAR_HOTELS: 8,
                    COUPONS: 9,
                    CHECKOUT_COUPONS: 10
                }),

                type:               GPBD.cType(1, PROTO.optional, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification.NotificationType;}),
                name:               GPBD.string(2, PROTO.optional),
                deep_integration:   GPBD.cType(3, PROTO.repeated, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.DeepIntegrationRule;}),
            }), 

            query:                      GPBD.cType(1, PROTO.repeated , function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Query;}),
            product:                    GPBD.cType(2, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Product;}),
            accommodation:              GPBD.cType(3, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Accommodation;}),
            voucher:                    GPBD.cType(4, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher;}),
            context_voucher:            GPBD.cType(5, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher;}),
            redirect:                   GPBD.cType(6, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Redirect;}),
            notification:               GPBD.cType(7, PROTO.optional, function() {return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Notification;})
        }),

        /**********************************************************************/
        /* Endpoint: /v3/search/coupons                                       */
        /**********************************************************************/
        SearchCouponRequest: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.SearchCouponRequest",{
            client_info:            GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo;}),
            query:                  GPBD.string(2, PROTO.optional),
            url:                    GPBD.string(3, PROTO.optional),
            provider_id:            GPBD.string(4, PROTO.repeated)
        }),

        SearchCouponResponse: PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.SearchCouponResponse",{            
            voucher:                GPBD.cType(1, PROTO.repeated, function(){return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Voucher;}) 
        }),
        /**********************************************************************/
        /* Endpoint: /v3/search/offers                                        */
        /**********************************************************************/
        SearchOfferRequest : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.SearchOfferRequest",{
            client_info:            GPBD.cType(1, PROTO.optional, function() { return AvastWRC.gpb.All.SafeShopOffer.ClientInfo;}),
            query:                  GPBD.string(2, PROTO.optional),            
            url:                    GPBD.string(3, PROTO.optional),
            provider_id:            GPBD.string(4, PROTO.repeated)
        }),

        SearchOfferResponse : PROTO.Message("AvastWRC.gpb.All.SafeShopOffer.SearchOfferResponse",{
            product:                    GPBD.cType(1, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Product;}),
            accommodation:              GPBD.cType(2, PROTO.repeated, function() { return AvastWRC.gpb.All.SafeShopOffer.OfferResponse.Accommodation;}),
        })
    });

}).call(this, AvastWRC.PROTO);

}).call(this, AvastWRC, AvastWRC.PROTO);