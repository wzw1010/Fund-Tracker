/* ================================================================
   Fund-Tracker · 完整 JavaScript（最终修复版）
   修复：净值全部出来时，nav 优先用 actualNav
   ================================================================ */

(function() {
    'use strict';

    // ================================================================
    //  一、工具函数
    // ================================================================
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            return m;
        });
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function formatDateKey(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function formatMoney(v) {
        if (v === null || v === undefined || isNaN(v)) return '--';
        return (v >= 0 ? '+' : '') + v.toFixed(2);
    }

    function getToday() {
        return formatDateKey(new Date());
    }

    function getDateOffset(dateStr, days) {
        var d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return formatDateKey(d);
    }

    function getMinutesSinceMidnight() {
        var now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    }

    function isWeekend(dateStr) {
        var d = new Date(dateStr);
        var day = d.getDay();
        return day === 0 || day === 6;
    }

    // ================================================================
    //  二、交易日历模块（Timor Tech API）
    // ================================================================
    var TradeCalendar = {
        CACHE_KEY: 'trade_calendar_cache',
        CACHE_DATE_KEY: 'trade_calendar_date',
        API_BASE: 'http://timor.tech/api/holiday',

        fetchYear: function(year) {
            var self = this;
            return new Promise(function(resolve, reject) {
                var script = document.createElement('script');
                var callbackName = 'timor_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                var timer = setTimeout(function() {
                    if (script.parentNode) script.remove();
                    delete window[callbackName];
                    reject(new Error('交易日历请求超时'));
                }, 10000);

                window[callbackName] = function(data) {
                    clearTimeout(timer);
                    delete window[callbackName];
                    if (script.parentNode) script.remove();
                    if (data && data.code === 0) {
                        resolve(data);
                    } else {
                        reject(new Error(data ? data.msg : '未知错误'));
                    }
                };

                script.src = self.API_BASE + '/year/' + year + '?cb=' + callbackName;
                script.onerror = function() {
                    clearTimeout(timer);
                    delete window[callbackName];
                    if (script.parentNode) script.remove();
                    reject(new Error('网络请求失败'));
                };
                document.head.appendChild(script);
            });
        },

        getCalendar: function(forceRefresh) {
            var self = this;
            return new Promise(function(resolve, reject) {
                var currentYear = new Date().getFullYear();
                var cached = localStorage.getItem(self.CACHE_KEY);
                var cacheDate = localStorage.getItem(self.CACHE_DATE_KEY);

                if (!forceRefresh && cached && cacheDate === String(currentYear)) {
                    try {
                        var data = JSON.parse(cached);
                        if (data && data.holiday) {
                            resolve(data);
                            return;
                        }
                    } catch (e) {}
                }

                self.fetchYear(currentYear).then(function(data) {
                    try {
                        localStorage.setItem(self.CACHE_KEY, JSON.stringify(data));
                        localStorage.setItem(self.CACHE_DATE_KEY, String(currentYear));
                    } catch (e) {}
                    resolve(data);
                }).catch(function(err) {
                    if (cached) {
                        try {
                            var oldData = JSON.parse(cached);
                            if (oldData && oldData.holiday) {
                                resolve(oldData);
                                return;
                            }
                        } catch (e) {}
                    }
                    reject(err);
                });
            });
        },

        isTradingDay: function(dateStr) {
            if (typeof dateStr !== 'string') {
                var d = dateStr || new Date();
                dateStr = formatDateKey(d);
            }

            if (isWeekend(dateStr)) return false;

            var cached = localStorage.getItem(this.CACHE_KEY);
            var currentYear = new Date().getFullYear();
            var cacheDate = localStorage.getItem(this.CACHE_DATE_KEY);

            if (cached && cacheDate === String(currentYear)) {
                try {
                    var data = JSON.parse(cached);
                    var isHoliday = data.holiday && data.holiday[dateStr] !== undefined;
                    if (isHoliday) {
                        return data.holiday[dateStr].holiday === false;
                    }
                    return true;
                } catch (e) {}
            }

            return true;
        },

        getLatestTradeDate: function() {
            var d = new Date();
            var dateStr = formatDateKey(d);
            var minutes = getMinutesSinceMidnight();
            if (minutes < 540) {
                d.setDate(d.getDate() - 1);
            }
            while (!this.isTradingDay(formatDateKey(d))) {
                d.setDate(d.getDate() - 1);
            }
            return formatDateKey(d);
        },

        getPreviousTradeDate: function(dateStr) {
            if (!dateStr) dateStr = getToday();
            var d = new Date(dateStr);
            d.setDate(d.getDate() - 1);
            while (!this.isTradingDay(formatDateKey(d))) {
                d.setDate(d.getDate() - 1);
            }
            return formatDateKey(d);
        }
    };

    // ================================================================
    //  三、交易状态判断
    // ================================================================
    function isTradingDay() {
        var now = new Date();
        var dateStr = formatDateKey(now);
        return TradeCalendar.isTradingDay(dateStr);
    }

    function isTradingTime() {
        if (!isTradingDay()) return false;
        var m = getMinutesSinceMidnight();
        return (m >= 570 && m < 690) || (m >= 780 && m < 900);
    }

    function isLunchTime() {
        if (!isTradingDay()) return false;
        var m = getMinutesSinceMidnight();
        return m >= 690 && m < 780;
    }

    function getTradingStatus() {
        if (!isTradingDay()) return { cls: 'closed' };
        if (isTradingTime()) return { cls: 'live' };
        if (isLunchTime()) return { cls: 'paused' };
        return { cls: 'closed' };
    }

    function getLatestTradeDate() {
        return TradeCalendar.getLatestTradeDate();
    }

    function getPreviousTradeDate(dateStr) {
        return TradeCalendar.getPreviousTradeDate(dateStr);
    }

    // ================================================================
    //  四、存储常量
    // ================================================================
    var STORAGE_W = 'fund_watchlist_v2';
    var STORAGE_H = 'fund_holdings';
    var STORAGE_C = 'fund_data_cache';
    var STORAGE_A = 'account_profit_history';
    var STORAGE_T = 'custom_tags';
    var STORAGE_SORT = 'fundholder_sort_mode';
    var STORAGE_HSORT = 'fundholder_hold_sort_mode';
    var STORAGE_SNAPSHOT = 'daily_nav_snapshot';

    // ================================================================
    //  五、状态管理
    // ================================================================
    var State = {
        watchlist: [],
        holdings: {},
        fundDataCache: {},
        accountProfitHistory: [],
        customTags: {},
        sortMode: 'default',
        holdSortMode: 'market-desc',
        isBulkEditing: false,
        summaryVisible: true,
        trendCharts: {},
        accountTrendChart: null,
        jsonpRequests: {},
        refreshTimer: null,
        wakeUpTimer: null,
        indexTimer: null,
        openedSwipe: null,
        saveCachePending: false,
        aShareCache: null,
        globalIndexCache: null,
        swipeStartX: 0,
        swipeStartY: 0,
        swipeCurrentX: 0,
        isSwiping: false,
        isWatchlistMenuOpen: false,
        isHoldingsMenuOpen: false
    };

    function loadAllData() {
        try { State.watchlist = JSON.parse(localStorage.getItem(STORAGE_W)) || []; } catch (e) { State.watchlist = []; }
        try { State.holdings = JSON.parse(localStorage.getItem(STORAGE_H)) || {}; } catch (e) { State.holdings = {}; }
        try { State.accountProfitHistory = JSON.parse(localStorage.getItem(STORAGE_A)) || []; } catch (e) { State.accountProfitHistory = []; }
        try { State.fundDataCache = JSON.parse(localStorage.getItem(STORAGE_C)) || {}; } catch (e) { State.fundDataCache = {}; }
        try { State.customTags = JSON.parse(localStorage.getItem(STORAGE_T)) || {}; } catch (e) { State.customTags = {}; }
        try { State.sortMode = localStorage.getItem(STORAGE_SORT) || 'default'; } catch (e) { State.sortMode = 'default'; }
        try { State.holdSortMode = localStorage.getItem(STORAGE_HSORT) || 'market-desc'; } catch (e) { State.holdSortMode = 'market-desc'; }
    }

    function saveAll() {
        localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist));
        localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings));
        localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
        localStorage.setItem(STORAGE_T, JSON.stringify(State.customTags));
        localStorage.setItem(STORAGE_SORT, State.sortMode);
        localStorage.setItem(STORAGE_HSORT, State.holdSortMode);
    }

    function saveCacheThrottled() {
        if (State.saveCachePending) return;
        State.saveCachePending = true;
        setTimeout(function() {
            localStorage.setItem(STORAGE_C, JSON.stringify(State.fundDataCache));
            State.saveCachePending = false;
        }, 5000);
    }

    function getSnapshot(date) {
        try {
            var data = JSON.parse(localStorage.getItem(STORAGE_SNAPSHOT)) || {};
            return data[date] || null;
        } catch (e) { return null; }
    }

    function saveSnapshot(date, snapshot) {
        try {
            var data = JSON.parse(localStorage.getItem(STORAGE_SNAPSHOT)) || {};
            data[date] = snapshot;
            var keys = Object.keys(data).sort();
            if (keys.length > 30) {
                var remove = keys.slice(0, keys.length - 30);
                remove.forEach(function(k) { delete data[k]; });
            }
            localStorage.setItem(STORAGE_SNAPSHOT, JSON.stringify(data));
        } catch (e) {}
    }

    // ================================================================
    //  六、API 服务
    // ================================================================
    var API = {
        fetchSingle: function(code, retries) {
            retries = retries || 2;
            return new Promise(function(resolve, reject) {
                var reqId = 'r-' + code + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
                var attempt = function(rem) {
                    var sid = 'jp-' + reqId;
                    var s = document.getElementById(sid);
                    if (s) s.remove();
                    var s2 = document.createElement('script');
                    s2.id = sid;
                    s2.src = 'https://fundgz.1234567.com.cn/js/' + code + '.js?rt=' + Date.now();
                    var tid = setTimeout(function() {
                        cleanup();
                        if (rem > 0) attempt(rem - 1);
                        else reject(new Error('超时'));
                    }, 8000);
                    if (!window._jsonpCB) window._jsonpCB = {};
                    window._jsonpCB[reqId] = function(data) { cleanup(); resolve(data); };

                    function cleanup() {
                        clearTimeout(tid);
                        if (s2.parentNode) s2.remove();
                        delete window._jsonpCB[reqId];
                        delete State.jsonpRequests[reqId];
                    }
                    s2.onerror = function() {
                        cleanup();
                        if (rem > 0) attempt(rem - 1);
                        else reject(new Error('网络错误'));
                    };
                    State.jsonpRequests[reqId] = { cleanup: cleanup };
                    document.head.appendChild(s2);
                };
                attempt(retries);
            });
        },

        fetchTxFund: function(code) {
            var ac = new AbortController();
            var timer = setTimeout(function() { ac.abort(); }, 10000);
            return fetch('https://qt.gtimg.cn/q=jj' + code, { signal: ac.signal })
                .then(function(resp) { clearTimeout(timer); return resp.text(); })
                .then(function(text) {
                    var m = text.match(/"([^"]+)"/);
                    if (m) {
                        var f = m[1].split('~');
                        return { nav: parseFloat(f[5]), rate: parseFloat(f[7]), date: f[8] ? f[8].replace(/\//g, '-') : '' };
                    }
                    return null;
                })
                .catch(function(e) { clearTimeout(timer); return null; });
        },

        fetchTxIndex: function(codes) {
            return new Promise(function(resolve, reject) {
                var script = document.createElement('script');
                var timer = setTimeout(function() {
                    if (script.parentNode) script.remove();
                    reject(new Error('timeout'));
                }, 8000);
                script.onload = function() {
                    clearTimeout(timer);
                    var data = {};
                    var A_INDICES = [
                        { code: 's_sh000001', name: '上证指数' },
                        { code: 's_sz399001', name: '深证成指' },
                        { code: 's_sz399006', name: '创业板指' },
                        { code: 's_sh000688', name: '科创50' },
                        { code: 's_sh000300', name: '沪深300' },
                        { code: 's_sh000905', name: '中证500' },
                        { code: 's_sh000852', name: '中证1000' },
                        { code: 's_sh000016', name: '上证50' }
                    ];
                    A_INDICES.forEach(function(item) {
                        var varName = 'v_' + item.code;
                        if (window[varName] !== undefined) {
                            data[item.code] = window[varName];
                            delete window[varName];
                        }
                    });
                    if (Object.keys(data).length > 0) resolve(data);
                    else reject(new Error('no data'));
                    if (script.parentNode) script.remove();
                };
                script.onerror = function() {
                    clearTimeout(timer);
                    if (script.parentNode) script.remove();
                    reject(new Error('network'));
                };
                script.src = 'https://qt.gtimg.cn/q=' + codes;
                document.head.appendChild(script);
            });
        },

        fetchGlobalEM: function(secid) {
            return new Promise(function(resolve, reject) {
                var cb = 'em_' + secid.replace(/\./g, '_') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                var script = document.createElement('script');
                var timer = setTimeout(function() { cleanup(); reject(new Error('timeout')); }, 8000);

                function cleanup() {
                    clearTimeout(timer);
                    delete window[cb];
                    if (script.parentNode) script.remove();
                }
                window[cb] = function(data) { cleanup(); resolve(data); };
                script.src = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + secid + '&fields=f43,f169,f170&cb=' + cb;
                script.onerror = function() { cleanup(); reject(new Error('network')); };
                document.head.appendChild(script);
            });
        }
    };

    window.jsonpgz = function(d) {
        if (d && d.fundcode && window._jsonpCB) {
            for (var k in window._jsonpCB) {
                if (k.startsWith('r-' + d.fundcode + '-')) { window._jsonpCB[k](d); break; }
            }
        }
    };

    // ================================================================
    //  七、核心业务逻辑
    // ================================================================
    var Core = {
        INDUSTRY_KEYWORDS: [
            { keys: ['白酒', '酒'], tag: '白酒' },
            { keys: ['医疗', '医药', '健康', '生物'], tag: '医药' },
            { keys: ['新能源', '光伏', '锂电', '电池', '碳中和'], tag: '新能源' },
            { keys: ['科技', '芯片', '半导体', '电子', '5G', '通信', '物联网'], tag: '科技' },
            { keys: ['消费', '食品', '饮料', '农业', '粮食'], tag: '消费' },
            { keys: ['军工', '国防', '航天', '军事'], tag: '军工' },
            { keys: ['证券', '券商', '银行', '金融', '保险'], tag: '金融' },
            { keys: ['地产', '房地产', '基建', '建材'], tag: '地产' },
            { keys: ['传媒', '影视', '娱乐', '文化'], tag: '传媒' },
            { keys: ['汽车', '整车', '新能源车', '智能汽车'], tag: '汽车' },
            { keys: ['有色', '钢铁', '煤炭', '化工', '材料', '稀土', '石油'], tag: '周期' },
            { keys: ['计算机', '软件', '人工智能', '大数据', '云'], tag: '计算机' },
            { keys: ['环保', '环境', '低碳'], tag: '环保' },
            { keys: ['教育', '培训'], tag: '教育' },
            { keys: ['旅游', '酒店', '航空', '运输', '物流'], tag: '交通' },
            { keys: ['电力', '公用事业', '能源'], tag: '能源' },
            { keys: ['指数', '300', '500', '创业板', '科创', '深证', '上证', '中证', '沪深'], tag: '指数' },
            { keys: ['债', '债券', '纯债', '中短债'], tag: '债券' },
            { keys: ['混合', '灵活'], tag: '混合' },
            { keys: ['量化', '对冲'], tag: '量化' },
            { keys: ['红利', '高股息'], tag: '红利' },
            { keys: ['QDII', '海外', '纳斯达克', '标普', '道琼斯', '全球', '德国', '日本', '亚太', '恒生'], tag: 'QDII' }
        ],

        getIndustryForCode: function(name) {
            var sorted = this.INDUSTRY_KEYWORDS.slice().sort(function(a, b) {
                return b.keys.join().length - a.keys.join().length;
            });
            for (var i = 0; i < sorted.length; i++) {
                var item = sorted[i];
                for (var j = 0; j < item.keys.length; j++) {
                    if (name.indexOf(item.keys[j]) !== -1) return item.tag;
                }
            }
            return '';
        },

        getTagForCode: function(code, name) {
            return State.customTags[code] || this.getIndustryForCode(name) || '';
        },

        getDisplayName: function(code) {
            var d = State.fundDataCache[code] || {};
            if (d.name && d.name !== '未知') return d.name;
            if (State.holdings[code] && State.holdings[code].name) return State.holdings[code].name;
            return code;
        },

        fetchAndUpdate: function(code) {
            var self = this;
            return new Promise(function(resolve) {
                var old = State.fundDataCache[code] || {};
                var isTrading = isTradingTime();
                var today = getToday();
                var changed = false;
                var ttName = old.name;

                if (!ttName || ttName === '未知') {
                    if (State.holdings[code] && State.holdings[code].name) ttName = State.holdings[code].name;
                    else {
                        API.fetchSingle(code).then(function(ttData) {
                            if (ttData && ttData.name) ttName = ttData.name;
                            continueFetch();
                        }).catch(function() { continueFetch(); });
                        return;
                    }
                }
                continueFetch();

                function continueFetch() {
                    var needEstimate = isTrading || !old.jzrq || old.jzrq.trim() !== today;
                    var gszVal = old.gsz,
                        gszzlVal = old.gszzl,
                        gztimeVal = old.gztime,
                        jzrqVal = old.jzrq;

                    if (needEstimate) {
                        API.fetchSingle(code).then(function(estData) {
                            if (estData) {
                                gszVal = estData.gsz;
                                gszzlVal = estData.gszzl;
                                gztimeVal = estData.gztime || '';
                                jzrqVal = estData.jzrq || old.jzrq || today;
                                if (estData.name && (!ttName || ttName === '未知')) ttName = estData.name;
                            }
                            fetchNav();
                        }).catch(function() { fetchNav(); });
                    } else {
                        fetchNav();
                    }

                    function fetchNav() {
                        var tn = null,
                            td = null,
                            tr = null;
                        var needNav = !isTrading && !self.isUpdated(code);
                        if (needNav) {
                            API.fetchTxFund(code).then(function(txData) {
                                if (txData) {
                                    tn = txData.nav;
                                    tr = txData.rate;
                                    td = txData.date;
                                }
                                saveData();
                            }).catch(function() { saveData(); });
                        } else {
                            saveData();
                        }

                        function saveData() {
                            var nd = {
                                fundcode: old.fundcode || code,
                                name: ttName || code,
                                gsz: gszVal,
                                gszzl: gszzlVal,
                                gztime: gztimeVal,
                                jzrq: jzrqVal || today,
                                actualNav: (tn && !isNaN(tn)) ? String(tn) : old.actualNav,
                                actualRate: (tr != null && !isNaN(tr)) ? tr : old.actualRate,
                                actualDate: td || old.actualDate
                            };
                            changed = old.gsz !== nd.gsz || old.gszzl !== nd.gszzl || old.actualNav !== nd.actualNav || old.actualRate !== nd.actualRate || old.actualDate !== nd.actualDate || old.name !== nd.name;
                            State.fundDataCache[code] = nd;
                            resolve(changed);
                        }
                    }
                }
            });
        },

        isUpdated: function(code) {
            var d = State.fundDataCache[code];
            if (!d || !d.actualDate) return false;
            var latestTradeDate = getLatestTradeDate();
            return d.actualDate === latestTradeDate && d.actualRate !== null && !isNaN(parseFloat(d.actualRate));
        },

        getDisplayData: function(code) {
            var d = State.fundDataCache[code] || {};
            var actualNav = parseFloat(d.actualNav);
            var actualRate = d.actualRate != null ? parseFloat(d.actualRate) : null;
            var estNav = parseFloat(d.gsz);
            var estRate = d.gszzl != null ? parseFloat(d.gszzl) : null;
            var actualDate = d.actualDate || null;

            var latestTradeDate = getLatestTradeDate();
            if (actualDate === latestTradeDate && actualRate !== null && !isNaN(actualNav) && actualNav > 0) {
                return { nav: actualNav, rate: actualRate, source: 'netValue' };
            }

            if (estRate !== null && !isNaN(estNav) && estNav > 0) {
                return { nav: estNav, rate: estRate, source: 'estimate' };
            }

            if (actualRate !== null && !isNaN(actualNav) && actualNav > 0) {
                return { nav: actualNav, rate: actualRate, source: 'netValue' };
            }

            return { nav: null, rate: null, source: 'none' };
        },

        getCardData: function(code) {
            var h = State.holdings[code],
                d = State.fundDataCache[code] || {};
            var cost = parseFloat(h.cost) || 0,
                shares = parseFloat(h.shares) || 0;
            var updated = this.isUpdated(code);
            var display = this.getDisplayData(code);
            var currentNav = display.nav;
            var dayRate = display.rate;

            if (currentNav === null || currentNav <= 0) {
                return { name: h.name || (d.name || code), code: code, marketValue: null, dayRate: null,
                    dayProfit: null, totalP: null, totalYieldRate: null, cls: 'zero',
                    dotClass: updated ? 'updated' : 'pending' };
            }

            var mv = currentNav * shares;
            var rate = (dayRate != null && !isNaN(dayRate)) ? (dayRate / 100) : 0;
            var prev = rate !== 0 ? currentNav / (1 + rate) : currentNav;
            var dayProfit = shares * prev * rate;
            var totalP = (currentNav - cost) * shares;
            var totalYR = cost > 0 ? ((currentNav - cost) / cost * 100) : 0;
            var cls = dayRate > 0 ? 'up' : (dayRate < 0 ? 'down' : 'zero');
            var dotClass = updated ? 'updated' : 'pending';
            return { name: h.name || (d.name || code), code: code, marketValue: mv, dayRate: dayRate,
                dayProfit: dayProfit, totalP: totalP, totalYieldRate: totalYR, cls: cls,
                dotClass: dotClass, cost: cost, shares: shares };
        },

        // ★★★ 核心修复：净值全部出来时，nav 优先用 actualNav ★★★
        computeSummary: function() {
            var codes = Object.keys(State.holdings);
            if (!codes.length) {
                return { totalAsset: 0, todayProfit: 0, totalProfit: 0, totalCost: 0, totalYieldRate: 0 };
            }

            var today = getToday();
            var latestTradeDate = getLatestTradeDate();
            var todaySnapshot = getSnapshot(today);
            var snapshotDate = todaySnapshot ? today : latestTradeDate;
            var snapshot = todaySnapshot || getSnapshot(latestTradeDate);

            var totalCost = 0,
                totalMarketValue = 0,
                totalPrevValue = 0;
            var prevDate = getPreviousTradeDate(snapshotDate);
            var prevSnapshot = prevDate ? getSnapshot(prevDate) : null;

            // ★★★ 判断净值是否全部更新 ★★★
            var allNavUpdated = Core.isAllNavUpdated();

            codes.forEach(function(code) {
                var h = State.holdings[code];
                var cost = parseFloat(h.cost) || 0;
                var shares = parseFloat(h.shares) || 0;
                totalCost += cost * shares;

                var d = State.fundDataCache[code] || {};

                // ★★★ 当前净值（nav）★★★
                var nav;
                if (allNavUpdated) {
                    // 净值全部出来 → 优先用实际净值
                    nav = parseFloat(d.actualNav) || parseFloat(d.gsz) || cost;
                } else {
                    // 净值未全出 → 优先用估值
                    nav = parseFloat(d.gsz) || parseFloat(d.actualNav) || cost;
                }
                if (nav <= 0) nav = cost;

                // ★★★ 前一日净值（prevNav）★★★
                var prevNav = null;
                // 1. 从昨日快照获取
                if (prevSnapshot && prevSnapshot[code]) {
                    prevNav = prevSnapshot[code].nav;
                }
                // 2. 从缓存 actualNav 获取（核对日期）
                if (!prevNav) {
                    if (d.actualDate === prevDate && d.actualNav) {
                        prevNav = parseFloat(d.actualNav);
                    }
                }
                // 3. 用估值推算
                if (!prevNav || prevNav <= 0) {
                    var estNav = parseFloat(d.gsz);
                    var estRate = parseFloat(d.gszzl);
                    if (estNav > 0 && estRate !== 0 && !isNaN(estRate)) {
                        prevNav = estNav / (1 + estRate / 100);
                        if (prevNav <= 0 || !isFinite(prevNav)) {
                            prevNav = nav;
                        }
                    } else {
                        prevNav = nav;
                    }
                }

                totalMarketValue += nav * shares;
                totalPrevValue += prevNav * shares;
            });

            var totalProfit = totalMarketValue - totalCost;
            var todayProfit = totalMarketValue - totalPrevValue;
            var totalYieldRate = totalCost > 0 ? (totalProfit / totalCost * 100) : 0;

            return {
                totalAsset: totalMarketValue,
                todayProfit: todayProfit,
                totalProfit: totalProfit,
                totalCost: totalCost,
                totalYieldRate: totalYieldRate,
                snapshotDate: snapshotDate
            };
        },

        calcTodayProfit: function() {
            var s = this.computeSummary();
            return s.todayProfit !== null ? s.todayProfit : 0;
        },

        hasEstimate: function() {
            var codes = Object.keys(State.holdings);
            for (var i = 0; i < codes.length; i++) {
                var d = State.fundDataCache[codes[i]] || {};
                if (d.gsz !== undefined && d.gsz !== null && parseFloat(d.gsz) > 0) {
                    return true;
                }
            }
            return false;
        },

        isAllNavUpdated: function() {
            var codes = Object.keys(State.holdings);
            if (codes.length === 0) return false;
            var today = getToday();
            for (var i = 0; i < codes.length; i++) {
                var d = State.fundDataCache[codes[i]] || {};
                if (d.actualDate !== today || d.actualNav === undefined || d.actualNav === null || parseFloat(d.actualNav) <= 0) {
                    return false;
                }
            }
            return true;
        },

        getLatestProfit: function() {
            var latestDate = getLatestTradeDate();
            var snapshot = getSnapshot(latestDate);
            if (!snapshot) return null;
            var codes = Object.keys(State.holdings);
            var total = 0;
            var prevDate = getPreviousTradeDate(latestDate);
            var prevSnapshot = prevDate ? getSnapshot(prevDate) : null;
            codes.forEach(function(code) {
                var h = State.holdings[code];
                var shares = parseFloat(h.shares) || 0;
                var nav = snapshot[code] ? snapshot[code].nav : 0;
                var prevNav = (prevSnapshot && prevSnapshot[code]) ? prevSnapshot[code].nav : nav;
                total += (nav - prevNav) * shares;
            });
            return total;
        }
    };

    // ================================================================
    //  八、UI 渲染
    // ================================================================
    var UI = {
        renderWatchlist: function() {
            var fl = document.getElementById('fundList'),
                es = document.getElementById('emptyState');
            if (!State.watchlist.length) { fl.innerHTML = '';
                es.style.display = 'block'; return; }
            es.style.display = 'none';
            var displayOrder = State.watchlist.slice();
            if (State.sortMode === 'change-desc' || State.sortMode === 'change-asc') {
                displayOrder.sort(function(a, b) {
                    var za = parseFloat(State.fundDataCache[a] ? State.fundDataCache[a].gszzl : 0) || 0;
                    var zb = parseFloat(State.fundDataCache[b] ? State.fundDataCache[b].gszzl : 0) || 0;
                    return State.sortMode === 'change-desc' ? zb - za : za - zb;
                });
            }
            var html = '';
            var today = getToday();
            var latestTradeDate = getLatestTradeDate();

            displayOrder.forEach(function(code) {
                var d = State.fundDataCache[code] || {};
                var name = Core.getDisplayName(code);
                var tag = Core.getTagForCode(code, name);

                var gszzl = d.gszzl !== undefined && d.gszzl !== null && !isNaN(parseFloat(d.gszzl)) ?
                    parseFloat(d.gszzl) : null;
                var actualRate = d.actualRate !== undefined && d.actualRate !== null && !isNaN(parseFloat(d.actualRate)) ?
                    parseFloat(d.actualRate) : null;
                var actualDate = d.actualDate || null;

                var estimateStr = gszzl !== null ? (gszzl >= 0 ? '+' : '') + gszzl.toFixed(2) + '%' : '--';
                var estimateCls = gszzl === null ? 'zero' : (gszzl > 0 ? 'up' : (gszzl < 0 ? 'down' : 'zero'));

                var netStr = '--',
                    netCls = 'zero',
                    shouldShowNet = false;

                if (actualRate !== null && actualDate === latestTradeDate) {
                    shouldShowNet = true;
                }

                if (shouldShowNet) {
                    netStr = (actualRate >= 0 ? '+' : '') + actualRate.toFixed(2) + '%';
                    netCls = actualRate > 0 ? 'up' : (actualRate < 0 ? 'down' : 'zero');
                }

                var tagHtml = tag ?
                    '<span class="industry-tag" data-code="' + escapeHTML(code) +
                    '" onclick="event.stopPropagation();editTag(\'' + escapeHTML(code) +
                    '\')">' + escapeHTML(tag) + '</span>' :
                    '<span class="industry-tag tag-placeholder" data-code="' + escapeHTML(code) +
                    '" onclick="event.stopPropagation();editTag(\'' + escapeHTML(code) +
                    '\')">+标签</span>';

                html += '<div class="swipe-wrapper" data-code="' + escapeHTML(code) + '">';
                html += '<div class="swipe-content">';
                html += '<div class="fund-card-left">';
                html += tagHtml;
                html += '<div class="fund-info">';
                html += '<div class="fund-name">' + escapeHTML(name) + '</div>';
                html += '<div class="fund-code">' + escapeHTML(code) + '</div>';
                html += '</div></div>';

                html += '<div class="change-area">';
                html += '<span class="change-primary ' + estimateCls + '">' + estimateStr + '</span>';
                html += '<span class="change-separator">|</span>';
                html += '<span class="change-secondary-value ' + netCls + '">' + netStr + '</span>';
                html += '</div></div>';
                html += '<div class="swipe-delete"><span>删除</span></div>';
                html += '</div>';
            });

            fl.innerHTML = html;
            this.bindSwipeEvents();
            this.updateHomeCounts();
            this.updateTradeBadges();
        },

        renderHoldings: function() {
            var codes = this.getSortedHoldingsCodes(),
                hl = document.getElementById('holdingsList');
            if (!codes.length) {
                hl.innerHTML =
                    '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><div>暂无持仓，点击右上角 + 添加</div></div>';
                return;
            }
            var html = '';
            var self = this;
            codes.forEach(function(c) {
                var data = Core.getCardData(c);
                html += self.buildCardHTML(data);
            });
            hl.innerHTML = html;
            setTimeout(function() {
                self.bindHoldingCardEvents();
            }, 100);
            if (State.isBulkEditing) this.enterBulkEditMode();
            this.updateHomeCounts();
            this.updateTradeBadges();
        },

        getSortedHoldingsCodes: function() {
            var codes = Object.keys(State.holdings);
            var arr = codes.map(function(code) {
                var card = Core.getCardData(code);
                return { code: code, marketValue: card.marketValue !== null ? card.marketValue : 0 };
            });
            arr.sort(function(a, b) {
                return State.holdSortMode === 'market-asc' ? a.marketValue - b.marketValue : b.marketValue - a.marketValue;
            });
            return arr.map(function(i) { return i.code; });
        },

        buildCardHTML: function(data) {
            function pc(v) { return v > 0 ? 'profit-positive' : (v < 0 ? 'profit-negative' : 'neutral'); }
            var mvStr = data.marketValue !== null ? data.marketValue.toFixed(2) : '--';
            var dayRateStr = data.dayRate !== null ? (data.dayRate >= 0 ? '+' : '') + data.dayRate.toFixed(2) + '%' : '--';
            var dayProfitStr = data.dayProfit !== null ? formatMoney(data.dayProfit) : '--';
            var totalPStr = data.totalP !== null ? formatMoney(data.totalP) : '--';
            var totalYRStr = data.totalYieldRate !== null ? (data.totalYieldRate >= 0 ? '+' : '') + data.totalYieldRate.toFixed(2) + '%' : '--';
            return '<div class="holding-card" data-code="' + escapeHTML(data.code) +
                '"><div class="holding-header"><div class="holding-header-left"><span class="update-dot ' +
                data.dotClass + '"></span><span class="holding-name">' + escapeHTML(data.name) +
                '</span><span class="holding-code">' + escapeHTML(data.code) +
                '</span></div><span class="holding-amount">' + mvStr +
                '</span></div><div class="metrics-row"><div class="metric-card"><span class="metric-label">今日涨幅</span><span class="metric-value ' +
                (data.dayRate !== null ? pc(data.dayRate) : 'neutral') + '">' + dayRateStr +
                '</span></div><div class="metric-card"><span class="metric-label">日收益</span><span class="metric-value ' +
                (data.dayProfit !== null ? pc(data.dayProfit) : 'neutral') + '">' + dayProfitStr +
                '</span></div><div class="metric-card"><span class="metric-label">持有收益</span><span class="metric-value ' +
                (data.totalP !== null ? pc(data.totalP) : 'neutral') + '">' + totalPStr +
                '</span></div><div class="metric-card"><span class="metric-label">持有收益率</span><span class="metric-value ' +
                (data.totalYieldRate !== null ? pc(data.totalYieldRate) : 'neutral') + '">' + totalYRStr +
                '</span></div></div><div class="trend-chart-wrapper" id="trend-' + escapeHTML(data.code) +
                '"><canvas id="trendCanvas-' + escapeHTML(data.code) + '"></canvas></div></div>';
        },

        bindSwipeEvents: function() {
            var fl = document.getElementById('fundList');
            fl.removeEventListener('touchstart', this._touchStart);
            fl.removeEventListener('touchmove', this._touchMove);
            fl.removeEventListener('touchend', this._touchEnd);
            var self = this;
            this._touchStart = function(e) { self.handleTouchStart(e); };
            this._touchMove = function(e) { self.handleTouchMove(e); };
            this._touchEnd = function(e) { self.handleTouchEnd(e); };
            fl.addEventListener('touchstart', this._touchStart, { passive: false });
            fl.addEventListener('touchmove', this._touchMove, { passive: false });
            fl.addEventListener('touchend', this._touchEnd, { passive: false });
            fl.onclick = function(e) {
                var del = e.target.closest('.swipe-delete');
                if (del && del.classList.contains('active')) {
                    var w = del.closest('.swipe-wrapper');
                    if (w) {
                        var code = w.dataset.code;
                        self.showDeleteConfirm(code);
                    }
                }
            };
        },

        handleTouchStart: function(e) {
            var w = e.target.closest('.swipe-wrapper');
            if (!w) return;
            if (State.openedSwipe && State.openedSwipe !== w) { this.closeSwipe(State.openedSwipe);
                State.openedSwipe = null; }
            State.swipeStartX = e.touches[0].clientX;
            State.swipeStartY = e.touches[0].clientY;
            State.swipeCurrentX = 0;
            State.isSwiping = false;
        },

        handleTouchMove: function(e) {
            var w = e.target.closest('.swipe-wrapper');
            if (!w) return;
            var dx = e.touches[0].clientX - State.swipeStartX,
                dy = e.touches[0].clientY - State.swipeStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
                e.preventDefault();
                State.isSwiping = true;
                State.swipeCurrentX = Math.min(0, Math.max(-70, dx));
                var c = w.querySelector('.swipe-content');
                if (c) c.style.transform = 'translateX(' + State.swipeCurrentX + 'px)';
                var d = w.querySelector('.swipe-delete');
                if (d) d.classList.toggle('active', State.swipeCurrentX < -40);
            }
        },

        handleTouchEnd: function(e) {
            var w = e.target.closest('.swipe-wrapper');
            if (!w || !State.isSwiping) return;
            State.isSwiping = false;
            var c = w.querySelector('.swipe-content');
            if (State.swipeCurrentX < -40) {
                if (c) c.style.transform = 'translateX(-70px)';
                var d = w.querySelector('.swipe-delete');
                if (d) d.classList.add('active');
                if (State.openedSwipe && State.openedSwipe !== w) this.closeSwipe(State.openedSwipe);
                State.openedSwipe = w;
            } else {
                if (c) c.style.transform = 'translateX(0)';
                var d2 = w.querySelector('.swipe-delete');
                if (d2) d2.classList.remove('active');
                State.openedSwipe = null;
            }
        },

        closeSwipe: function(w) {
            if (!w) return;
            var c = w.querySelector('.swipe-content');
            if (c) c.style.transform = 'translateX(0)';
            var d = w.querySelector('.swipe-delete');
            if (d) d.classList.remove('active');
        },

        showDeleteConfirm: function(code) {
            var name = Core.getDisplayName(code);
            showModalOld('确认删除', '确定要移出「' + escapeHTML(name) + '」吗？', '', [
                { text: '取消', cls: 'secondary' },
                { text: '删除', cls: 'danger', action: function() {
                        var i = State.watchlist.indexOf(code);
                        if (i >= 0) {
                            State.watchlist.splice(i, 1);
                            localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist));
                            delete State.fundDataCache[code];
                            saveCacheThrottled();
                            if (State.openedSwipe) { UI.closeSwipe(State.openedSwipe);
                                State.openedSwipe = null; }
                            UI.renderWatchlist();
                            showModalOld('已移除', '「' + escapeHTML(name) + '」已从自选中移除', '', [{ text: '知道了',
                                    cls: 'primary' }]);
                        }
                    } }
            ]);
        },

        bindHoldingCardEvents: function() {
            var self = this;
            document.querySelectorAll('#holdingsList .holding-card').forEach(function(card) {
                card.addEventListener('click', function(e) {
                    if (State.isBulkEditing) return;
                    if (e.target.closest('.edit-controls') || e.target.closest('input')) return;
                    var code = card.dataset.code,
                        w = card.querySelector('#trend-' + code);
                    if (w) {
                        if (w.classList.contains('expanded')) {
                            w.classList.remove('expanded');
                            if (State.trendCharts[code]) {
                                State.trendCharts[code].destroy();
                                delete State.trendCharts[code];
                            }
                        } else {
                            Object.keys(State.trendCharts).forEach(function(c) {
                                if (c !== code && State.trendCharts[c]) {
                                    State.trendCharts[c].destroy();
                                    delete State.trendCharts[c];
                                    var el = document.getElementById('trend-' + c);
                                    if (el) el.classList.remove('expanded');
                                }
                            });
                            w.classList.add('expanded');
                            var canvas = document.getElementById('trendCanvas-' + code);
                            if (canvas) {
                                canvas.style.display = 'block';
                                canvas.style.width = '100%';
                                canvas.style.height = '150px';
                            }
                            requestAnimationFrame(function() {
                                setTimeout(function() {
                                    self.loadTrendChart(code);
                                }, 200);
                            });
                        }
                    }
                });
            });
        },

        loadTrendChart: function(code) {
            var canvas = document.getElementById('trendCanvas-' + code);
            if (!canvas) {
                console.warn('趋势图 canvas 未找到:', code);
                return;
            }
            if (State.trendCharts[code]) {
                State.trendCharts[code].destroy();
                delete State.trendCharts[code];
            }

            var ck = 'trend_' + code;
            var td = null;
            try {
                var cached = sessionStorage.getItem(ck);
                if (cached) td = JSON.parse(cached);
            } catch (e) {}

            if (td) {
                this._renderTrendChart(canvas, code, td);
                return;
            }

            var self = this;
            var parent = canvas.parentElement;
            var loadDiv = document.createElement('div');
            loadDiv.className = 'trend-loading';
            loadDiv.textContent = '加载中…';
            loadDiv.style.cssText = 'text-align:center;padding:20px;color:var(--text-tertiary);font-size:0.8rem;';
            parent.appendChild(loadDiv);

            this.fetchTrendDataFromScript(code).then(function(data) {
                var loadingEl = parent.querySelector('.trend-loading');
                if (loadingEl) loadingEl.remove();
                if (data) {
                    try {
                        sessionStorage.setItem(ck, JSON.stringify(data));
                    } catch (e) {}
                    var newCanvas = document.getElementById('trendCanvas-' + code);
                    if (!newCanvas) {
                        newCanvas = document.createElement('canvas');
                        newCanvas.id = 'trendCanvas-' + code;
                        newCanvas.style.width = '100%';
                        newCanvas.style.height = '150px';
                        parent.appendChild(newCanvas);
                    }
                    self._renderTrendChart(newCanvas, code, data);
                } else {
                    parent.innerHTML = '<div class="trend-error">暂无历史数据</div>';
                }
            }).catch(function() {
                var loadingEl = parent.querySelector('.trend-loading');
                if (loadingEl) loadingEl.remove();
                parent.innerHTML =
                    '<div class="trend-error">加载失败，点击重试</div>';
                var retryBtn = document.createElement('button');
                retryBtn.textContent = '重试';
                retryBtn.style.cssText = 'display:block;margin:10px auto;padding:6px 20px;border:none;border-radius:10px;background:var(--accent);color:#000;cursor:pointer;';
                retryBtn.onclick = function(e) {
                    e.stopPropagation();
                    parent.innerHTML = '<canvas id="trendCanvas-' + code +
                        '" style="width:100%;height:150px;"></canvas>';
                    self.loadTrendChart(code);
                };
                parent.appendChild(retryBtn);
            });
        },

        _renderTrendChart: function(canvas, code, td) {
            try {
                var ctx = canvas.getContext('2d');
                var g = ctx.createLinearGradient(0, 0, 0, 200);
                g.addColorStop(0, 'rgba(0,206,202,0.3)');
                g.addColorStop(1, 'rgba(0,206,202,0)');
                var ac = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#888';
                var gc = getComputedStyle(document.documentElement).getPropertyValue('--border-subtle').trim() || '#333';
                State.trendCharts[code] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: td.dates,
                        datasets: [{ data: td.navs, borderColor: '#00CECA', backgroundColor: g,
                            fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 0,
                            borderWidth: 2 }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { color: ac, font: { size: 9 }, maxTicksLimit: 5 },
                                grid: { color: gc } },
                            y: { ticks: { color: ac, font: { size: 9 }, callback: function(v) {
                                        return v.toFixed(3); } }, grid: { color: gc } }
                        }
                    }
                });
            } catch (e) {
                console.warn('渲染趋势图失败:', code, e);
                var w = document.getElementById('trend-' + code);
                if (w) w.innerHTML = '<div class="trend-error">图表加载失败</div>';
            }
        },

        fetchTrendDataFromScript: function(code) {
            return new Promise(function(resolve) {
                var s = document.createElement('script');
                s.src = 'https://fund.eastmoney.com/pingzhongdata/' + code + '.js';
                var timer = setTimeout(function() {
                    if (s.parentNode) s.remove();
                    resolve(null);
                }, 10000);
                s.onload = function() {
                    clearTimeout(timer);
                    var raw = window.Data_netWorthTrend;
                    if (raw && raw.length > 0) {
                        var recent = raw.slice(-20);
                        resolve({
                            dates: recent.map(function(i) { var d = new Date(i.x); return (d.getMonth() + 1) + '/' + d.getDate(); }),
                            navs: recent.map(function(i) { return i.y; })
                        });
                    } else resolve(null);
                    if (s.parentNode) s.remove();
                };
                s.onerror = function() { clearTimeout(timer);
                    if (s.parentNode) s.remove();
                    resolve(null); };
                document.head.appendChild(s);
            });
        },

        renderOverview: function() {
            try {
                var s = Core.computeSummary();
                var today = getToday();
                var isTrading = isTradingTime();
                if (!isTrading && getSnapshot(today)) {
                    var snapshot = getSnapshot(today);
                    var prevDate = getPreviousTradeDate(today);
                    var prevSnapshot = prevDate ? getSnapshot(prevDate) : null;
                    if (snapshot) {
                        var totalMV = 0,
                            totalPrev = 0;
                        Object.keys(State.holdings).forEach(function(code) {
                            var h = State.holdings[code];
                            var shares = parseFloat(h.shares) || 0;
                            var nav = snapshot[code] ? snapshot[code].nav : 0;
                            var prevNav = (prevSnapshot && prevSnapshot[code]) ? prevSnapshot[code].nav : nav;
                            totalMV += nav * shares;
                            totalPrev += prevNav * shares;
                        });
                        s.todayProfit = totalMV - totalPrev;
                    }
                }
                this.updateSummary(s);
                this.appendAccountHistory();
                this.renderAccountTrendChart();
                this.renderSettingsWarnings();
                this.updateTradeBadges();
            } catch (e) { console.error('renderOverview 出错:', e); }
        },

        // ★★★ 完整显示逻辑 ★★★
        updateSummary: function(s) {
            if (!State.summaryVisible) {
                document.getElementById('totalAsset').textContent = '***';
                document.getElementById('todayProfit').textContent = '***';
                document.getElementById('totalProfit').textContent = '***';
                var tr = document.getElementById('totalYieldRate');
                if (tr) tr.textContent = '***';
                return;
            }

            var today = getToday();
            var minutes = getMinutesSinceMidnight();

            var T_900 = 540;
            var T_915 = 555;
            var T_930 = 570;
            var T_1500 = 900;

            var isWeekendDay = !isTradingDay();
            var isTrading = isTradingTime();
            var isLunch = isLunchTime();
            var isBefore9 = minutes < T_900;
            var isBefore915 = minutes < T_915;
            var isAfter1500 = minutes >= T_1500;

            document.getElementById('totalAsset').textContent = s.totalAsset !== null ? s.totalAsset.toFixed(2) : '--';
            var tr = document.getElementById('totalYieldRate');
            if (tr) {
                tr.textContent = s.totalYieldRate !== null ? (s.totalYieldRate >= 0 ? '+' : '') + s.totalYieldRate.toFixed(2) + '%' : '--';
                tr.className = 's-value ' + (s.totalYieldRate > 0 ? 'profit-positive' : (s.totalYieldRate < 0 ? 'profit-negative' : 'neutral'));
            }

            var todayProfitEl = document.getElementById('todayProfit');
            var todayProfitLabel = document.getElementById('todayProfitLabel');

            var todayRecord = State.accountProfitHistory.find(function(item) { return item.date === today; });
            var todayProfit = todayRecord ? todayRecord.profit : s.todayProfit;
            if (todayProfit === undefined || todayProfit === null || isNaN(todayProfit)) {
                todayProfit = s.todayProfit;
            }

            var allNavUpdated = Core.isAllNavUpdated();

            var label = '今日收益';
            var valueText = '--';
            var cls = 'pending';

            // ★★★ 完整循环逻辑 ★★★

            // 1. 周末/节假日 → "最近收益"
            if (isWeekendDay) {
                label = '最近收益';
                var latestProfit = Core.getLatestProfit();
                if (latestProfit !== null && !isNaN(latestProfit)) {
                    valueText = formatMoney(latestProfit);
                    cls = latestProfit > 0 ? 'profit-positive' : (latestProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 2. 盘中交易时段 → "预估收益"
            else if (isTrading) {
                label = '预估收益';
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 3. 午休 → "预估收益"
            else if (isLunch) {
                label = '预估收益';
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 4. 9:00-9:15 → "待开盘"
            else if (!isTrading && !isLunch && isBefore915 && !isBefore9) {
                label = '待开盘';
                valueText = '--';
                cls = 'pending';
            }
            // 5. 9:15-9:30 → "预估收益"
            else if (!isTrading && !isLunch && !isBefore915 && minutes < T_930) {
                label = '预估收益';
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 6. 0:00-9:00 → "昨日收益"
            else if (isBefore9) {
                label = '昨日收益';
                var latestRecord = null;
                var sortedHistory = State.accountProfitHistory.slice().sort(function(a, b) { return b.date.localeCompare(a.date); });
                for (var i = 0; i < sortedHistory.length; i++) {
                    if (sortedHistory[i].date !== today) {
                        latestRecord = sortedHistory[i];
                        break;
                    }
                }
                if (latestRecord && latestRecord.profit !== null && !isNaN(latestRecord.profit)) {
                    valueText = formatMoney(latestRecord.profit);
                    cls = latestRecord.profit > 0 ? 'profit-positive' : (latestRecord.profit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    var latestProfit2 = Core.getLatestProfit();
                    if (latestProfit2 !== null && !isNaN(latestProfit2)) {
                        valueText = formatMoney(latestProfit2);
                        cls = latestProfit2 > 0 ? 'profit-positive' : (latestProfit2 < 0 ? 'profit-negative' : 'neutral');
                    } else {
                        valueText = '--';
                        cls = 'pending';
                    }
                }
            }
            // 7. 盘后 净值全部出来 → "今日收益"
            else if (isAfter1500 && allNavUpdated) {
                label = '今日收益';
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 8. 盘后 净值未全出 → "预估收益"
            else if (isAfter1500 && !allNavUpdated) {
                label = '预估收益';
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }
            // 9. 兜底
            else {
                if (todayProfit !== null && !isNaN(todayProfit)) {
                    valueText = formatMoney(todayProfit);
                    cls = todayProfit > 0 ? 'profit-positive' : (todayProfit < 0 ? 'profit-negative' : 'neutral');
                } else {
                    valueText = '--';
                    cls = 'pending';
                }
            }

            if (todayProfitLabel) todayProfitLabel.textContent = label;
            todayProfitEl.textContent = valueText;
            todayProfitEl.className = 's-value ' + cls;
            todayProfitEl.title = label === '预估收益' ? '基于盘中估值，可能与最终净值有差异' :
                                  label === '昨日收益' ? '来自昨日快照' :
                                  label === '最近收益' ? '来自最近交易日快照' : '';

            var totalProfitEl = document.getElementById('totalProfit');
            var totalProfit = s.totalProfit;
            totalProfitEl.textContent = totalProfit !== null ? formatMoney(totalProfit) : '--';
            totalProfitEl.className = 's-value ' + (totalProfit > 0 ? 'profit-positive' : (totalProfit < 0 ? 'profit-negative' : 'neutral'));

            var isAfter = !isTrading && !isLunch;
            todayProfitEl.onclick = function() {
                if (isAfter && allNavUpdated) {
                    editTodayProfit();
                } else if (label === '预估收益') {
                    showModalOld('提示', '当前为预估收益，待净值全部更新后可手动修正', '', [{ text: '知道了', cls: 'primary' }]);
                } else {
                    showModalOld('提示', '当前时段不可手动修正', '', [{ text: '知道了', cls: 'primary' }]);
                }
            };
        },

        appendAccountHistory: function() {
            var today = getToday();
            var minutes = getMinutesSinceMidnight();

            if (minutes < 540) {
                var existing = State.accountProfitHistory.some(function(item) { return item.date === today; });
                if (!existing) {
                    return;
                }
                State.accountProfitHistory = State.accountProfitHistory.filter(function(item) { return item.date !== today; });
                localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
                return;
            }

            var profit = Core.calcTodayProfit();
            var allNavUpdated = Core.isAllNavUpdated();

            if (profit === 0 && !allNavUpdated) {
                var existingRecord = State.accountProfitHistory.some(function(item) { return item.date === today; });
                if (existingRecord) {
                    return;
                }
                return;
            }

            var idx = State.accountProfitHistory.findIndex(function(item) { return item.date === today; });
            if (idx >= 0) {
                State.accountProfitHistory[idx].profit = profit;
                State.accountProfitHistory[idx].type = 'actual';
            } else {
                State.accountProfitHistory.push({ date: today, profit: profit, type: 'actual' });
            }

            var seen = new Set();
            State.accountProfitHistory = State.accountProfitHistory.filter(function(item) {
                if (seen.has(item.date)) return false;
                seen.add(item.date);
                return true;
            });

            if (State.accountProfitHistory.length > 30) State.accountProfitHistory.shift();
            localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
        },

        renderAccountTrendChart: function() {
            try {
                var container = document.getElementById('accountTrendContainer'),
                    canvas = document.getElementById('accountTrendCanvas');
                if (!container || !canvas) return;
                var filtered = State.accountProfitHistory.filter(function(item) { return item.profit !== 0; });
                if (filtered.length === 0) { container.style.display = 'none'; return; }
                container.style.display = 'block';
                if (State.accountTrendChart) State.accountTrendChart.destroy();
                var ctx = canvas.getContext('2d');
                var uc = getComputedStyle(document.documentElement).getPropertyValue('--up-color').trim() || '#FF6B6B';
                var dc = getComputedStyle(document.documentElement).getPropertyValue('--down-color').trim() || '#4ECDC4';
                var ac = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#888';
                var gc = getComputedStyle(document.documentElement).getPropertyValue('--border-subtle').trim() || '#333';
                var profits = filtered.map(function(i) { return i.profit; });
                var bg = profits.map(function(v) { return v >= 0 ? uc : dc; });
                var labels = filtered.map(function(i) { return i.date; });

                State.accountTrendChart = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: labels, datasets: [{ data: profits, backgroundColor: bg,
                            borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.8 }] },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return (context.parsed.y >= 0 ? '+' : '') + context.parsed.y.toFixed(2) + ' 元';
                                    }
                                }
                            }
                        },
                        onClick: function(e, elements) {
                            if (elements && elements.length > 0) {
                                var idx = elements[0].index;
                                var date = labels[idx];
                                var amount = profits[idx];
                                showModalOld('💶收益详情', date,
                                    '<div style="text-align:center;font-size:1.4rem;font-weight:700;margin-bottom:20px;' +
                                    (amount >= 0 ? 'color:var(--up-color)' : 'color:var(--down-color)') + ';">' +
                                    (amount >= 0 ? '+' : '') + amount.toFixed(2) + ' 元</div>', [
                                        { text: '知道了', cls: 'primary' }
                                    ]);
                            }
                        },
                        scales: {
                            x: { ticks: { color: ac, font: { size: 9 }, maxTicksLimit: 10 },
                                grid: { color: gc } },
                            y: { ticks: { color: ac, font: { size: 9 }, callback: function(v) {
                                        return (v >= 0 ? '+' : '') + v.toFixed(0); } },
                                grid: { color: gc } }
                        }
                    }
                });
            } catch (e) { console.error('renderAccountTrendChart 出错:', e); }
        },

        renderSettingsWarnings: function() {
            var container = document.getElementById('settingsWarningsContainer');
            if (!container) return;
            var codes = Object.keys(State.holdings);
            if (!codes.length) {
                container.innerHTML =
                    '<div style="text-align:left;font-size:0.7rem;color:var(--text-tertiary);">暂无持仓数据</div>';
                return;
            }
            var indMap = {},
                astMap = {};
            var total = 0;
            codes.forEach(function(code) {
                var h = State.holdings[code],
                    d = State.fundDataCache[code] || {};
                var shares = parseFloat(h.shares) || 0;
                var nav = parseFloat(d.actualNav) || parseFloat(d.gsz) || 0;
                var mv = nav * shares;
                if (mv <= 0) return;
                var name = h.name || d.name || code;
                var ind = Core.getTagForCode(code, name) || '其他';
                var ast = getAssetType(name);
                indMap[ind] = (indMap[ind] || 0) + mv;
                astMap[ast] = (astMap[ast] || 0) + mv;
                total += mv;
            });
            if (total <= 0) {
                container.innerHTML =
                    '<div style="text-align:left;font-size:0.7rem;color:var(--text-tertiary);">暂无有效持仓</div>';
                return;
            }
            var indList = Object.keys(indMap).map(function(k) {
                return { name: k, value: indMap[k], pct: indMap[k] / total * 100 };
            }).sort(function(a, b) { return b.value - a.value; });
            var warnings = [];
            indList.forEach(function(x) {
                if (x.pct > 40) warnings.push(x.name + ' 行业占比 ' + x.pct.toFixed(1) + '%，过于集中');
            });
            var eqPct = ((astMap['股票型'] || 0) + (astMap['混合型'] || 0)) / total * 100;
            if (eqPct > 80) warnings.push('权益类资产 ' + eqPct.toFixed(1) + '%，风险偏好较高');
            if (!warnings.length && indList.every(function(i) { return i.name === '其他'; })) {
                container.innerHTML =
                    '<div style="text-align:left;font-size:0.7rem;color:var(--text-tertiary);">💡 为基金设置行业标签可查看详细分析</div>';
                return;
            }
            if (!warnings.length) {
                container.innerHTML =
                    '<div style="text-align:left;font-size:0.7rem;color:var(--text-tertiary);">✅ 暂未发现集中度风险</div>';
                return;
            }
            var maxPct = Math.max.apply(null, indList.map(function(i) { return i.pct; }));
            var html = '<div class="progress-list">';
            indList.slice(0, 6).forEach(function(ind) {
                var isWarn = ind.pct > 40;
                var wp = maxPct > 0 ? (ind.pct / maxPct * 100) : 0;
                html += '<div class="progress-row"><span class="progress-label">' + escapeHTML(ind.name) +
                    '</span><div class="progress-track"><div class="progress-fill ' + (isWarn ? 'warn' : 'safe') +
                    '" style="width:' + wp +
                    '%;"></div></div><span class="progress-pct">' + ind.pct.toFixed(1) +
                    '%</span></div>';
            });
            html += '</div><div class="warnings-area">';
            warnings.forEach(function(w) {
                html += '<div class="warning-card"><span class="warn-icon">⚠️</span><span>' +
                    escapeHTML(w) + '</span></div>';
            });
            html += '</div>';
            container.innerHTML = html;
        },

        updateHomeCounts: function() {
            var wc = document.getElementById('homeWatchlistCount'),
                hc = document.getElementById('homeHoldingsCount');
            if (wc) wc.textContent = State.watchlist.length + ' 只';
            if (hc) hc.textContent = Object.keys(State.holdings).length + ' 只';
        },

        updateTradeBadges: function() {
            var status = getTradingStatus();
            document.querySelectorAll('.trade-badge').forEach(function(badge) {
                badge.classList.remove('live', 'paused', 'closed');
                badge.classList.add(status.cls);
                badge.classList.add('active');
            });
        },

        enterBulkEditMode: function() {
            State.isBulkEditing = true;
            var btnH = document.getElementById('btnMoreHoldings');
            if (btnH) btnH.textContent = '完成';
            var self = this;
            document.querySelectorAll('#holdingsList .holding-card').forEach(function(card) {
                var code = card.dataset.code,
                    h = State.holdings[code];
                var metrics = card.querySelector('.metrics-row');
                if (metrics) metrics.style.display = 'none';
                var ed = card.querySelector('.edit-controls');
                if (!ed) {
                    ed = document.createElement('div');
                    ed.className = 'edit-controls';
                    card.appendChild(ed);
                }
                var cost = parseFloat(h.cost) || 0;
                var shares = parseFloat(h.shares) || 0;
                ed.innerHTML =
                    `
                    <div class="edit-row">
                        <input type="number" class="edit-input" value="${cost}" step="any" inputmode="decimal" placeholder="成本">
                        <input type="number" class="edit-input" value="${shares}" step="any" inputmode="decimal" placeholder="份额">
                        <button class="edit-delete">删除</button>
                    </div>
                    <div class="cost-hint">
                        <span>当前成本: ${cost.toFixed(4)}</span>
                        <span class="hint-tip">💡 修改后持有收益将重新计算</span>
                    </div>
                `;
                ed.querySelector('.edit-delete').onclick = function(e) {
                    e.stopPropagation();
                    var name = Core.getDisplayName(code);
                    showModalOld('确认删除', '确定要删除「' + escapeHTML(name) + '」吗？', '', [
                        { text: '取消', cls: 'secondary' },
                        { text: '删除', cls: 'danger', action: function() {
                                delete State.holdings[code];
                                localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings));
                                self.renderHoldings();
                                showModalOld('已删除', '「' + escapeHTML(name) + '」已从持仓中移除', '',
                                [{ text: '知道了', cls: 'primary' }]);
                            } }
                    ]);
                };
            });
        },

        exitBulkEditMode: function() {
            var changed = false;
            var self = this;
            document.querySelectorAll('#holdingsList .holding-card').forEach(function(card) {
                var code = card.dataset.code,
                    ci = card.querySelector('.edit-input'),
                    si = card.querySelectorAll('.edit-input')[1];
                if (ci && si) {
                    var cost = parseFloat(ci.value),
                        shares = parseFloat(si.value);
                    if (!isNaN(cost) && cost > 0 && !isNaN(shares) && shares > 0) {
                        if (State.holdings[code].cost !== cost || State.holdings[code].shares !== shares) changed = true;
                        State.holdings[code] = { cost: cost, shares: shares, name: State.holdings[code] ? State.holdings[code].name || '' : '' };
                    }
                }
                var ed = card.querySelector('.edit-controls');
                if (ed) ed.remove();
                var metrics = card.querySelector('.metrics-row');
                if (metrics) metrics.style.display = '';
            });
            localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings));
            State.isBulkEditing = false;
            var btnH = document.getElementById('btnMoreHoldings');
            if (btnH && !State.isHoldingsMenuOpen) btnH.textContent = '编辑';
            this.renderHoldings();

            var today = getToday();
            State.accountProfitHistory = State.accountProfitHistory.filter(function(item) { return item.date !== today; });
            localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
            this.renderOverview();

            if (changed) {
                showModalOld('已保存', '批量编辑已保存，今日收益已重新计算', '', [{ text: '知道了', cls: 'primary' }]);
            } else {
                showModalOld('已保存', '批量编辑已保存', '', [{ text: '知道了', cls: 'primary' }]);
            }
        },

        autoBackfillSnapshots: function() {
            var today = getToday();
            for (var i = 0; i < 7; i++) {
                var date = getDateOffset(today, -i);
                if (!isTradingDay()) continue;
                if (getSnapshot(date)) continue;
                var snapshot = {};
                var codes = Object.keys(State.holdings);
                var hasData = false;
                codes.forEach(function(code) {
                    var d = State.fundDataCache[code] || {};
                    if (d.actualDate === date && d.actualNav) {
                        snapshot[code] = { nav: parseFloat(d.actualNav), name: Core.getDisplayName(code) };
                        hasData = true;
                    }
                });
                if (hasData && Object.keys(snapshot).length > 0) {
                    saveSnapshot(date, snapshot);
                    console.log('[Backfill] 补录快照: ' + date);
                }
            }
        }
    };

    // 辅助函数
    function getAssetType(name) {
        var ASSET_TYPE_MAP = {
            '股票型': ['股票', '权益', '指数', 'LOF', 'ETF'],
            '债券型': ['债券', '债', '纯债', '中短债'],
            '混合型': ['混合', '灵活', '平衡'],
            'QDII': ['QDII', '海外', '纳斯达克', '标普', '全球', '恒生']
        };
        for (var t in ASSET_TYPE_MAP) {
            var ks = ASSET_TYPE_MAP[t];
            for (var i = 0; i < ks.length; i++) {
                if (name.indexOf(ks[i]) !== -1) return t;
            }
        }
        return '其他';
    }

    // ================================================================
    //  九、全局函数
    // ================================================================
    window.navigateTo = function(page) {
        closeAllMenus();
        document.querySelectorAll('.page').forEach(function(p) {
            p.classList.remove('active');
            p.style.opacity = '0';
        });
        var target = document.getElementById(page + 'Page');
        if (target) { target.classList.add('active');
            target.style.opacity = '1'; }
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (page === 'index') fetchIndexData();
        if (page === 'holdings') UI.renderHoldings();
        if (page === 'overview') UI.renderOverview();
        if (page === 'watchlist') UI.renderWatchlist();
        UI.updateHomeCounts();
        UI.updateTradeBadges();
    };

    window.editTag = function(code) {
        var name = Core.getDisplayName(code);
        var current = State.customTags[code] || Core.getIndustryForCode(name) || '';
        showModalOld('编辑标签', '', '<input type="text" id="tagInput" class="modal-input" placeholder="输入标签名（留空清除）" value="' +
            current + '" maxlength="10">', [
            { text: '取消', cls: 'secondary' },
            { text: '保存', cls: 'primary', action: function() {
                    var val = document.getElementById('tagInput').value.trim();
                    if (val) State.customTags[code] = val;
                    else delete State.customTags[code];
                    localStorage.setItem(STORAGE_T, JSON.stringify(State.customTags));
                    UI.renderWatchlist();
                    if (document.getElementById('holdingsPage').classList.contains('active')) UI.renderHoldings();
                    if (document.getElementById('overviewPage').classList.contains('active')) UI.renderOverview();
                    showModalOld('标签已更新', val ? '已设置为「' + escapeHTML(val) + '」' : '已清除', '', [{ text: '知道了',
                            cls: 'primary' }]);
                } }
        ]);
    };

    window.editTodayProfit = function() {
        if (Object.keys(State.holdings).length === 0) {
            showModalOld('暂无持仓', '请先添加持仓基金', '', [{ text: '知道了', cls: 'primary' }]);
            return;
        }
        var currentProfit = Core.calcTodayProfit();
        window._saveProfit = function(date, profitVal) {
            try {
                var idx = State.accountProfitHistory.findIndex(function(item) { return item.date === date; });
                if (idx >= 0) {
                    State.accountProfitHistory[idx].profit = profitVal;
                    State.accountProfitHistory[idx].type = 'manual';
                } else {
                    State.accountProfitHistory.push({ date: date, profit: profitVal, type: 'manual' });
                }
                var seenDates = new Set();
                State.accountProfitHistory = State.accountProfitHistory.filter(function(item) {
                    if (seenDates.has(item.date)) return false;
                    seenDates.add(item.date);
                    return true;
                });
                State.accountProfitHistory.sort(function(a, b) { return a.date.localeCompare(b.date); });
                if (State.accountProfitHistory.length > 60) State.accountProfitHistory = State.accountProfitHistory.slice(-60);
                localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
                UI.renderOverview();
                showModalOld('已修正', date + ' 收益已更新为 ' + formatMoney(profitVal), '', [{ text: '知道了',
                        cls: 'primary' }]);
            } catch (e) {
                console.error('保存收益历史时出错:', e);
                alert('保存失败，请重试');
            }
        };
        window.openProfitModal(currentProfit);
    };

    // ================================================================
    //  十、菜单功能
    // ================================================================
    var iconAdd = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    var iconSync = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>';
    var iconSort = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><polyline points="8 12 4 6 8 0"/><line x1="4" y1="18" x2="20" y2="18"/><polyline points="16 12 20 18 16 24"/></svg>';
    var iconEdit = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    function showMenuPopup(menuId, items, anchorEl) {
        var popup = document.getElementById(menuId);
        if (popup.classList.contains('active')) {
            popup.classList.remove('active');
            if (popup._closeHandler) { document.removeEventListener('click', popup._closeHandler);
                popup._closeHandler = null; }
            return;
        }
        if (popup._closeHandler) { document.removeEventListener('click', popup._closeHandler);
            popup._closeHandler = null; }
        popup.innerHTML = items.map(function(item, i) {
            return '<div class="menu-item" data-idx="' + i +
                '" tabindex="0" role="menuitem"><span class="menu-icon">' + (item.icon || '') +
                '</span>' + escapeHTML(item.text) + '</div>';
        }).join('');
        var rect = anchorEl.getBoundingClientRect();
        popup.style.top = (rect.bottom + 8) + 'px';
        popup.style.right = (window.innerWidth - rect.right) + 'px';
        popup.classList.add('active');
        popup.onclick = function(e) {
            var idx = e.target.closest('.menu-item') ? e.target.closest('.menu-item').dataset.idx : undefined;
            if (idx !== undefined) {
                popup.classList.remove('active');
                var btn = anchorEl;
                if (btn && btn.id === 'btnMoreWatchlist') {
                    State.isWatchlistMenuOpen = false;
                    if (!State.isBulkEditing) btn.textContent = '编辑';
                } else if (btn && btn.id === 'btnMoreHoldings') {
                    State.isHoldingsMenuOpen = false;
                    if (!State.isBulkEditing) btn.textContent = '编辑';
                }
                items[parseInt(idx)].action();
            }
        };
        var closeHandler = function(e) {
            if (!popup.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
                popup.classList.remove('active');
                var btn = anchorEl;
                if (btn && btn.id === 'btnMoreWatchlist') {
                    State.isWatchlistMenuOpen = false;
                    if (!State.isBulkEditing) btn.textContent = '编辑';
                } else if (btn && btn.id === 'btnMoreHoldings') {
                    State.isHoldingsMenuOpen = false;
                    if (!State.isBulkEditing) btn.textContent = '编辑';
                }
                document.removeEventListener('click', closeHandler);
                popup._closeHandler = null;
            }
        };
        popup._closeHandler = closeHandler;
        setTimeout(function() { document.addEventListener('click', closeHandler); }, 10);
    }

    window.showWatchlistMenu = function(btn) {
        var popup = document.getElementById('menuWatchlistPopup');
        if (popup.classList.contains('active')) {
            popup.classList.remove('active');
            State.isWatchlistMenuOpen = false;
            if (!State.isBulkEditing) btn.textContent = '编辑';
            return;
        }
        var sortText = { 'change-desc': '跌幅降序', 'change-asc': '涨幅升序', 'default': '默认' } [State.sortMode];
        var items = [{
            text: '添加自选',
            icon: iconAdd,
            action: function() {
                showModalOld('添加自选基金', '', '<input type="text" id="modalAddCode" class="modal-input" placeholder="000001" maxlength="6" inputmode="numeric" pattern="[0-9]*">', [
                    { text: '取消', cls: 'secondary' },
                    { text: '添加', cls: 'primary', action: function() {
                            var code = document.getElementById('modalAddCode').value.trim();
                            if (!/^\d{6}$/.test(code)) {
                                showModalOld('提示', '请输入6位代码', '', [{ text: '知道了',
                                        cls: 'primary' }]);
                                return;
                            }
                            if (State.watchlist.indexOf(code) !== -1) {
                                showModalOld('提示', '该基金已在自选中', '', [{ text: '知道了',
                                        cls: 'primary' }]);
                                return;
                            }
                            API.fetchSingle(code).then(function(data) {
                                if (data && data.name) {
                                    State.watchlist.push(code);
                                    localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist));
                                    State.fundDataCache[code] = Object.assign({}, State.fundDataCache[code], { name: data.name });
                                    saveCacheThrottled();
                                    UI.renderWatchlist();
                                    showModalOld('已添加', '「' + escapeHTML(data.name) + '」已加入自选', '',
                                    [{ text: '知道了', cls: 'primary' }]);
                                } else {
                                    showModalOld('添加失败', '无效的基金代码', '', [{ text: '知道了',
                                            cls: 'primary' }]);
                                }
                            }).catch(function() {
                                showModalOld('添加失败', '网络错误或无效代码', '', [{ text: '知道了',
                                        cls: 'primary' }]);
                            });
                        } }
                ]);
            }
        }, {
            text: '同步持仓',
            icon: iconSync,
            action: function() {
                var codes = Object.keys(State.holdings);
                if (!codes.length) { showModalOld('提示', '没有持仓可同步', '', [{ text: '知道了',
                        cls: 'primary' }]); return; }
                var added = 0;
                codes.forEach(function(c) { if (State.watchlist.indexOf(c) === -1) { State.watchlist.push(c);
                        added++; } });
                if (!added) { showModalOld('提示', '持仓已在自选中', '', [{ text: '知道了', cls: 'primary' }]); return; }
                localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist));
                UI.renderWatchlist();
                showModalOld('已同步', '已同步 ' + added + ' 只基金到自选', '', [{ text: '知道了', cls: 'primary' }]);
            }
        }, {
            text: '排序: ' + sortText,
            icon: iconSort,
            action: function() {
                var modes = ['change-desc', 'change-asc', 'default'];
                State.sortMode = modes[(modes.indexOf(State.sortMode) + 1) % 3];
                localStorage.setItem(STORAGE_SORT, State.sortMode);
                UI.renderWatchlist();
            }
        }];
        showMenuPopup('menuWatchlistPopup', items, btn);
        State.isWatchlistMenuOpen = true;
        if (!State.isBulkEditing) btn.textContent = '完成';
    };

    window.showHoldingsMenu = function(btn) {
        var popup = document.getElementById('menuHoldingsPopup');
        if (popup.classList.contains('active')) {
            popup.classList.remove('active');
            State.isHoldingsMenuOpen = false;
            if (!State.isBulkEditing) btn.textContent = '编辑';
            return;
        }
        var items = [{
            text: '添加持仓',
            icon: iconAdd,
            action: function() {
                showModalOld('添加持仓基金', '',
                    '<input type="text" id="mCode" class="modal-input" placeholder="基金代码" inputmode="numeric" pattern="[0-9]*"><input type="number" id="mCost" class="modal-input" placeholder="成本净值" step="any" inputmode="decimal"><input type="number" id="mShares" class="modal-input" placeholder="持有份额" step="any" inputmode="decimal">', [
                        { text: '取消', cls: 'secondary' },
                        { text: '添加', cls: 'primary', action: function() {
                                var code = document.getElementById('mCode').value.trim();
                                var cost = parseFloat(document.getElementById('mCost').value);
                                var shares = parseFloat(document.getElementById('mShares').value);
                                if (!/^\d{6}$/.test(code)) {
                                    showModalOld('提示', '请输入6位代码', '', [{ text: '知道了',
                                            cls: 'primary' }]);
                                    return;
                                }
                                if (isNaN(cost) || isNaN(shares) || cost <= 0 || shares <= 0) {
                                    showModalOld('提示', '请填写有效数值', '', [{ text: '知道了',
                                            cls: 'primary' }]);
                                    return;
                                }
                                var name = Core.getDisplayName(code);
                                if (name === code) {
                                    API.fetchSingle(code).then(function(data) {
                                        if (data && data.name) {
                                            name = data.name;
                                            State.fundDataCache[code] = Object.assign({}, State.fundDataCache[code], { name: data.name });
                                        } else {
                                            showModalOld('添加失败', '无效的基金代码', '',
                                            [{ text: '知道了', cls: 'primary' }]);
                                            return;
                                        }
                                        State.holdings[code] = { name: name, cost: cost, shares: shares };
                                        localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings));
                                        UI.renderHoldings();
                                        showModalOld('已添加', '「' + escapeHTML(name) + '」已加入持仓', '',
                                        [{ text: '知道了', cls: 'primary' }]);
                                    }).catch(function() {
                                        showModalOld('添加失败', '网络错误或无效代码', '',
                                        [{ text: '知道了', cls: 'primary' }]);
                                    });
                                    return;
                                }
                                State.holdings[code] = { name: name, cost: cost, shares: shares };
                                localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings));
                                UI.renderHoldings();
                                showModalOld('已添加', '「' + escapeHTML(name) + '」已加入持仓', '',
                                [{ text: '知道了', cls: 'primary' }]);
                            } }
                    ]);
            }
        }, {
            text: '排序: ' + ({ 'market-desc': '市值降序', 'market-asc': '市值升序' } [State.holdSortMode]),
            icon: iconSort,
            action: function() {
                State.holdSortMode = State.holdSortMode === 'market-desc' ? 'market-asc' : 'market-desc';
                localStorage.setItem(STORAGE_HSORT, State.holdSortMode);
                UI.renderHoldings();
            }
        }, {
            text: State.isBulkEditing ? '完成编辑' : '批量编辑',
            icon: iconEdit,
            action: function() { if (State.isBulkEditing) UI.exitBulkEditMode();
                else UI.enterBulkEditMode(); }
        }];
        showMenuPopup('menuHoldingsPopup', items, btn);
        State.isHoldingsMenuOpen = true;
        if (!State.isBulkEditing) btn.textContent = '完成';
    };

    function closeAllMenus() {
        var wp = document.getElementById('menuWatchlistPopup'),
            hp = document.getElementById('menuHoldingsPopup');
        if (wp && wp.classList.contains('active')) {
            wp.classList.remove('active');
            State.isWatchlistMenuOpen = false;
            var btnW = document.getElementById('btnMoreWatchlist');
            if (btnW && !State.isBulkEditing) btnW.textContent = '编辑';
        }
        if (hp && hp.classList.contains('active')) {
            hp.classList.remove('active');
            State.isHoldingsMenuOpen = false;
            var btnH = document.getElementById('btnMoreHoldings');
            if (btnH && !State.isBulkEditing) btnH.textContent = '编辑';
        }
    }

    // ================================================================
    //  十一、Modal
    // ================================================================
    function showModalOld(title, desc, contentHTML, buttons) {
        var overlay = document.getElementById('modalOverlayOld');
        document.getElementById('modalTitleOld').textContent = title || '';
        document.getElementById('modalDescOld').textContent = desc || '';
        document.getElementById('modalContentOld').innerHTML = contentHTML || '';
        var btnContainer = document.getElementById('modalButtonsOld');
        btnContainer.innerHTML = '';
        if (buttons && buttons.length) {
            buttons.forEach(function(b) {
                var btn = document.createElement('button');
                btn.className = 'modal-btn ' + (b.cls || '');
                btn.textContent = b.text || '确定';
                btn.onclick = function() {
                    overlay.classList.remove('active');
                    if (b.action) b.action();
                };
                btnContainer.appendChild(btn);
            });
        } else {
            var btn = document.createElement('button');
            btn.className = 'modal-btn primary';
            btn.textContent = '确定';
            btn.onclick = function() { overlay.classList.remove('active'); };
            btnContainer.appendChild(btn);
        }
        overlay.classList.add('active');
        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.classList.remove('active');
        };
    }
    window.showModalOld = showModalOld;

    // ================================================================
    //  十二、数据管理
    // ================================================================
    window.exportConfig = function() {
        var data = JSON.stringify({ watchlist: State.watchlist, holdings: State.holdings,
            accountProfitHistory: State.accountProfitHistory, fundDataCache: State.fundDataCache,
            customTags: State.customTags }, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fundtracker_config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showModalOld('导出成功', '配置已导出到本地文件', '', [{ text: '知道了', cls: 'primary' }]);
    };

    window.copyConfig = function() {
        var data = JSON.stringify({ watchlist: State.watchlist, holdings: State.holdings,
            accountProfitHistory: State.accountProfitHistory, fundDataCache: State.fundDataCache,
            customTags: State.customTags }, null, 2);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(data).then(function() {
                showModalOld('复制成功', '配置已复制到剪贴板', '', [{ text: '知道了', cls: 'primary' }]);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = data;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showModalOld('复制成功', '配置已复制到剪贴板', '', [{ text: '知道了', cls: 'primary' }]);
        }
    };

    window.importConfig = function() { document.getElementById('importFile').click(); };

    window.pasteConfig = function() {
        if (!navigator.clipboard) {
            showModalOld('提示', '不支持剪贴板访问', '', [{ text: '知道了', cls: 'primary' }]);
            return;
        }
        navigator.clipboard.readText().then(function(text) {
            try {
                var data = JSON.parse(text);
                if (Array.isArray(data.watchlist)) { State.watchlist = data.watchlist;
                    localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist)); }
                if (data.holdings && typeof data.holdings === 'object') { State.holdings = data.holdings;
                    localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings)); }
                if (Array.isArray(data.accountProfitHistory)) { State.accountProfitHistory = data.accountProfitHistory;
                    localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory)); }
                if (data.fundDataCache && typeof data.fundDataCache === 'object') { State.fundDataCache = data.fundDataCache;
                    saveCacheThrottled(); }
                if (data.customTags && typeof data.customTags === 'object') { State.customTags = data.customTags;
                    localStorage.setItem(STORAGE_T, JSON.stringify(State.customTags)); }
                UI.renderWatchlist();
                UI.renderHoldings();
                UI.updateHomeCounts();
                showModalOld('粘贴成功', '配置已从剪贴板导入', '', [{ text: '知道了', cls: 'primary' }]);
            } catch (e) {
                showModalOld('粘贴失败', '数据格式无效', '', [{ text: '知道了', cls: 'primary' }]);
            }
        }).catch(function() {
            showModalOld('提示', '无法读取剪贴板', '', [{ text: '知道了', cls: 'primary' }]);
        });
    };

    document.getElementById('importFile').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function() {
            try {
                var data = JSON.parse(reader.result);
                if (Array.isArray(data.watchlist)) { State.watchlist = data.watchlist;
                    localStorage.setItem(STORAGE_W, JSON.stringify(State.watchlist)); }
                if (data.holdings && typeof data.holdings === 'object') { State.holdings = data.holdings;
                    localStorage.setItem(STORAGE_H, JSON.stringify(State.holdings)); }
                if (Array.isArray(data.accountProfitHistory)) { State.accountProfitHistory = data.accountProfitHistory;
                    localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory)); }
                if (data.fundDataCache && typeof data.fundDataCache === 'object') { State.fundDataCache = data.fundDataCache;
                    saveCacheThrottled(); }
                if (data.customTags && typeof data.customTags === 'object') { State.customTags = data.customTags;
                    localStorage.setItem(STORAGE_T, JSON.stringify(State.customTags)); }
                UI.renderWatchlist();
                UI.renderHoldings();
                UI.updateHomeCounts();
                showModalOld('导入成功', '配置已从文件导入', '', [{ text: '知道了', cls: 'primary' }]);
            } catch (e) {
                showModalOld('导入失败', '文件格式无效', '', [{ text: '知道了', cls: 'primary' }]);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    window.clearCache = function() {
        showModalOld('确认清除', '确定要清除所有基金数据缓存吗？', '', [
            { text: '取消', cls: 'secondary' },
            { text: '清除', cls: 'danger', action: function() {
                    localStorage.removeItem(STORAGE_C);
                    State.fundDataCache = {};
                    refreshAllData();
                    showModalOld('已清除', '缓存已清除，数据将重新加载', '', [{ text: '知道了', cls: 'primary' }]);
                } }
        ]);
    };

    window.resetProfitHistory = function() {
        showModalOld('确认重置', '将清空所有收益历史，但保留持仓数据，累计盈亏将基于当前市值重新计算。确定吗？', '', [
            { text: '取消', cls: 'secondary' },
            { text: '重置', cls: 'danger', action: function() {
                    State.accountProfitHistory = [];
                    localStorage.setItem(STORAGE_A, JSON.stringify(State.accountProfitHistory));
                    if (State.accountTrendChart) { State.accountTrendChart.destroy();
                        State.accountTrendChart = null; }
                    UI.renderOverview();
                    showModalOld('已重置', '收益历史已清空，当前累计盈亏已基于持仓重新计算', '', [{ text: '知道了',
                            cls: 'primary' }]);
                } }
        ]);
    };

    // ================================================================
    //  十三、指数数据
    // ================================================================
    var A_INDICES = [
        { code: 's_sh000001', name: '上证指数' },
        { code: 's_sz399001', name: '深证成指' },
        { code: 's_sz399006', name: '创业板指' },
        { code: 's_sh000688', name: '科创50' },
        { code: 's_sh000300', name: '沪深300' },
        { code: 's_sh000905', name: '中证500' },
        { code: 's_sh000852', name: '中证1000' },
        { code: 's_sh000016', name: '上证50' }
    ];
    var G_INDICES = [
        { code: 'r_hkHSI', name: '恒生指数', market: 'hk', type: 'tx' },
        { code: 'r_hkHSCEI', name: '国企指数', market: 'hk', type: 'tx' },
        { code: 'r_hkHSTECH', name: '恒生科技', market: 'hk', type: 'tx' },
        { code: 'usDJI', name: '道琼斯', market: 'us', type: 'tx' },
        { code: 'usIXIC', name: '纳斯达克', market: 'us', type: 'tx' },
        { code: 'usINX', name: '标普500', market: 'us', type: 'tx' },
        { code: '100.N225', name: '日经225', market: 'asia', type: 'em' },
        { code: '100.KS11', name: '韩国综合', market: 'asia', type: 'em' }
    ];

    async function fetchIndexData(forceRefresh) {
        if (forceRefresh === undefined) forceRefresh = false;
        var aShareGrid = document.getElementById('aShareGrid'),
            globalGrid = document.getElementById('globalGrid');
        var now = Date.now(),
            CACHE_DURATION = 5 * 60 * 1000;

        if (!forceRefresh && State.aShareCache && State.aShareCache.html && (now - State.aShareCache.timestamp < CACHE_DURATION)) {
            aShareGrid.innerHTML = State.aShareCache.html;
        } else {
            aShareGrid.innerHTML = A_INDICES.map(function(i) {
                return '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(i.name) +
                    '</div><div class="idx-card-price neutral">-</div><div class="idx-card-change neutral">加载中</div></div>';
            }).join('');
            try {
                var codes = A_INDICES.map(function(i) { return i.code; }).join(',');
                var text = await API.fetchTxIndex(codes);
                var map = {};
                for (var code in text) {
                    var raw = text[code];
                    var p = raw.split('~');
                    if (p.length >= 5) map[code] = { price: parseFloat(p[3]), change: parseFloat(p[4]),
                        changePct: parseFloat(p[5]) };
                }
                var html = '';
                A_INDICES.forEach(function(item) {
                    var d = map[item.code];
                    if (d && !isNaN(d.price)) {
                        var cls = d.change > 0 ? 'up' : (d.change < 0 ? 'down' : 'neutral'),
                            arrow = d.change > 0 ? '▲' : (d.change < 0 ? '▼' : '');
                        html += '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(item.name) +
                            '</div><div class="idx-card-price ' + cls + '">' + d.price.toFixed(2) +
                            '</div><div class="idx-card-change ' + cls + '">' + arrow + ' ' + Math.abs(d.changePct)
                            .toFixed(2) + '%</div></div>';
                    } else html += '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(item.name) +
                        '</div><div class="idx-card-price neutral">--</div><div class="idx-card-change neutral">--</div></div>';
                });
                aShareGrid.innerHTML = html;
                State.aShareCache = { data: true, html: html, timestamp: Date.now() };
            } catch (e) {
                if (State.aShareCache && State.aShareCache.html) aShareGrid.innerHTML = State.aShareCache.html;
                else aShareGrid.innerHTML = A_INDICES.map(function(i) {
                    return '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(i.name) +
                        '</div><div class="idx-card-price neutral">--</div><div class="idx-card-change neutral">加载失败</div></div>';
                }).join('');
            }
        }

        if (!forceRefresh && State.globalIndexCache && State.globalIndexCache.html && (now - State.globalIndexCache
                .timestamp < CACHE_DURATION)) {
            globalGrid.innerHTML = State.globalIndexCache.html;
            return;
        }
        globalGrid.innerHTML = G_INDICES.map(function(i) {
            return '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(i.name) +
                '</div><div class="idx-card-price neutral">-</div><div class="idx-card-change neutral">加载中</div></div>';
        }).join('');
        var globalResults = await Promise.allSettled(G_INDICES.map(async function(item) {
            if (item.type === 'em') {
                try {
                    var raw = await API.fetchGlobalEM(item.code);
                    var d = raw ? raw.data : null;
                    var price = d && d.f43 ? d.f43 / 100 : NaN,
                        change = d && d.f169 ? d.f169 / 100 : NaN,
                        pct = d && d.f170 ? d.f170 / 100 : NaN;
                    if (!isNaN(price)) return { name: item.name, code: item.code, price: price,
                        change: change, pct: pct, status: 'ok' };
                } catch (e) {}
            } else {
                try {
                    var resp = await fetch('https://qt.gtimg.cn/q=' + item.code);
                    var text = await resp.text();
                    var m = text.match(/"(.+)"/);
                    if (m) {
                        var f = m[1].split('~');
                        if (f.length >= 33) {
                            var price = parseFloat(f[3]),
                                change = parseFloat(f[31]),
                                pct = parseFloat(f[32]);
                            if (!isNaN(price)) return { name: item.name, code: item.code, price: price,
                                change: change, pct: pct, status: 'ok' };
                        }
                    }
                } catch (e) {}
            }
            return { name: item.name, code: item.code, status: 'error' };
        }));
        var ghtml = '';
        globalResults.forEach(function(result) {
            if (result.status === 'fulfilled' && result.value.status === 'ok') {
                var v = result.value,
                    cls = v.change > 0 ? 'up' : (v.change < 0 ? 'down' : 'neutral'),
                    arrow = v.change > 0 ? '▲' : (v.change < 0 ? '▼' : '');
                ghtml += '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(v.name) +
                    '</div><div class="idx-card-price ' + cls + '">' + v.price.toFixed(2) +
                    '</div><div class="idx-card-change ' + cls + '">' + arrow + ' ' + Math.abs(v.pct)
                    .toFixed(2) + '%</div></div>';
            } else {
                var name = result.status === 'fulfilled' ? result.value.name : '--';
                ghtml += '<div class="idx-card"><div class="idx-card-name">' + escapeHTML(name) +
                    '</div><div class="idx-card-price neutral">--</div><div class="idx-card-change neutral">获取失败</div></div>';
            }
        });
        globalGrid.innerHTML = ghtml;
        State.globalIndexCache = { data: true, html: ghtml, timestamp: Date.now() };
        UI.updateTradeBadges();
    }

    // ================================================================
    //  十四、数据刷新与定时器
    // ================================================================
    async function refreshAllData() {
        var all = Array.from(new Set(State.watchlist.concat(Object.keys(State.holdings))));
        if (!all.length) { UI.renderWatchlist();
            UI.renderHoldings(); return; }
        var q = all.slice();
        while (q.length) {
            var b = q.splice(0, 3);
            await Promise.allSettled(b.map(function(c) { return Core.fetchAndUpdate(c); }));
        }
        saveCacheThrottled();
        UI.renderWatchlist();
        UI.renderHoldings();
        UI.updateHomeCounts();
        UI.updateTradeBadges();
    }

    function getRefreshTarget() {
        var now = new Date(),
            totalMin = now.getHours() * 60 + now.getMinutes();
        if (!isTradingDay()) return { type: 'idle', interval: 120 * 60 * 1000 };
        if (totalMin < 570) return { type: 'pre-market', interval: 120 * 60 * 1000 };
        if (totalMin >= 570 && totalMin < 900) return { type: 'trading', interval: 5 * 60 * 1000 };
        if (totalMin >= 900 && totalMin < 930) return { type: 'post-close-buffer', interval: 30 * 60 * 1000 };
        if (totalMin >= 930 && totalMin < 1320) return { type: 'post-market', interval: 30 * 60 * 1000 };
        return { type: 'night', interval: 120 * 60 * 1000 };
    }

    function scheduleRefresh() {
        clearTimeout(State.refreshTimer);
        clearTimeout(State.wakeUpTimer);
        var target = getRefreshTarget();
        State.refreshTimer = setTimeout(function() { refreshAllData(); }, target.interval);
    }

    function scheduleIndexRefresh() {
        clearTimeout(State.indexTimer);
        var now = new Date(),
            totalMin = now.getHours() * 60 + now.getMinutes();
        if (isTradingDay() && totalMin >= 570 && totalMin < 900) {
            State.indexTimer = setTimeout(function() {
                if (document.getElementById('indexPage').classList.contains('active')) fetchIndexData(true);
                scheduleIndexRefresh();
            }, 30 * 60 * 1000);
        } else if (totalMin >= 900 && totalMin < 930) {
            State.indexTimer = setTimeout(function() { scheduleIndexRefresh(); }, 30 * 60 * 1000);
        } else if (totalMin === 930) {
            State.indexTimer = setTimeout(function() { fetchIndexData(true);
                scheduleIndexRefresh(); }, 1000);
        } else {
            State.indexTimer = null;
        }
    }

    function scheduleDailySnapshot() {
        var now = new Date();
        var target = new Date(now);
        target.setHours(23, 59, 0, 0);
        if (now.getTime() > target.getTime()) {
            target.setDate(target.getDate() + 1);
        }
        var delay = target.getTime() - now.getTime();
        console.log('[Snapshot] 下次快照时间: ' + target.toLocaleString());
        State.wakeUpTimer = setTimeout(function() {
            takeDailySnapshot();
            scheduleDailySnapshot();
        }, delay);
    }

    async function takeDailySnapshot() {
        var today = getToday();
        if (getSnapshot(today)) {
            console.log('[Snapshot] 今日快照已存在，跳过');
            return;
        }
        console.log('[Snapshot] 开始记录今日净值快照...');
        var codes = Object.keys(State.holdings);
        if (!codes.length) return;
        var result = {};
        var batchSize = 5;
        for (var i = 0; i < codes.length; i += batchSize) {
            var batch = codes.slice(i, i + batchSize);
            await Promise.all(batch.map(async function(code) {
                try {
                    var txData = await API.fetchTxFund(code);
                    if (txData && txData.nav && txData.nav > 0) {
                        result[code] = { nav: txData.nav, name: Core.getDisplayName(code) };
                    }
                } catch (e) {}
            }));
        }
        if (Object.keys(result).length > 0) {
            saveSnapshot(today, result);
            console.log('[Snapshot] ✅ 已保存 ' + Object.keys(result).length + ' 只基金的净值');
            if (document.getElementById('overviewPage').classList.contains('active')) {
                UI.renderOverview();
            }
        } else {
            console.log('[Snapshot] ⚠️ 未获取到任何净值数据');
        }
    }

    // ================================================================
    //  十五、下拉刷新
    // ================================================================
    function initPullToRefresh() {
        var wrapper = document.getElementById('appWrapper');
        var startY = 0,
            startX = 0,
            pullDistance = 0,
            isPulling = false,
            isHorizontal = false;
        var threshold = 60,
            maxPull = 90;
        var allowedPages = ['indexPage', 'watchlistPage', 'holdingsPage', 'overviewPage'];

        document.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                var activePage = document.querySelector('.page.active');
                if (!activePage || !allowedPages.includes(activePage.id)) return;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                isPulling = false;
                isHorizontal = false;
                pullDistance = 0;
                wrapper.style.transition = 'none';
                hidePullIndicator();
            }
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            var activePage = document.querySelector('.page.active');
            if (!activePage || !allowedPages.includes(activePage.id)) return;
            if (isPulling || (!isHorizontal && e.touches.length === 1)) {
                var dx = e.touches[0].clientX - startX,
                    dy = e.touches[0].clientY - startY;
                if (!isPulling && (dy <= 8 || window.scrollY > 0)) return;
                if (!isPulling && Math.abs(dx) > Math.abs(dy)) { isHorizontal = true; return; }
                if (isHorizontal) return;
                pullDistance = dy;
                if (pullDistance > 8 && window.scrollY <= 0) {
                    isPulling = true;
                    e.preventDefault();
                    var damped = Math.min(pullDistance * 0.4, maxPull);
                    wrapper.style.transform = 'translateY(' + damped + 'px)';
                    showPullIndicator();
                    if (pullDistance > threshold) {
                        setPullState('release');
                    } else {
                        setPullState('ready');
                    }
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', async function() {
            var activePage = document.querySelector('.page.active');
            if (!activePage || !allowedPages.includes(activePage.id)) return;
            if (!isPulling) {
                wrapper.style.transition = 'transform 0.35s cubic-bezier(0.25,0.8,0.25,1.2)';
                wrapper.style.transform = '';
                setTimeout(function() {
                    wrapper.style.transition = 'none';
                    wrapper.style.transform = '';
                    hidePullIndicator();
                }, 400);
                pullDistance = 0;
                return;
            }
            isPulling = false;
            wrapper.style.transition = 'transform 0.35s cubic-bezier(0.25,0.8,0.25,1.2)';
            if (pullDistance >= threshold) {
                setPullState('refreshing');
                wrapper.style.transform = 'translateY(' + (maxPull * 0.3) + 'px)';
                await new Promise(function(r) { setTimeout(r, 100); });
                wrapper.style.transform = '';
                await window.refreshCurrentPage();
                showCheckAnimation();
                hidePullIndicator();
            } else {
                wrapper.style.transform = '';
                hidePullIndicator();
            }
            setTimeout(function() {
                wrapper.style.transition = 'none';
                wrapper.style.transform = '';
                hidePullIndicator();
            }, 400);
            pullDistance = 0;
        });
    }

    var pullIndicator = document.getElementById('pullIndicator');
    var pullArrow = document.getElementById('pullArrow');
    var pullStatus = document.getElementById('pullStatus');

    function showPullIndicator() {
        pullIndicator.classList.add('show');
    }

    function hidePullIndicator() {
        pullIndicator.classList.remove('show');
        pullArrow.classList.remove('flip');
        pullStatus.textContent = '下拉刷新';
    }

    function setPullState(state) {
        switch (state) {
            case 'ready':
                pullStatus.textContent = '下拉刷新';
                pullArrow.classList.remove('flip');
                break;
            case 'release':
                pullStatus.textContent = '释放刷新';
                pullArrow.classList.add('flip');
                break;
            case 'refreshing':
                pullStatus.textContent = '刷新中…';
                pullArrow.classList.add('flip');
                break;
            default:
                pullStatus.textContent = '下拉刷新';
                pullArrow.classList.remove('flip');
        }
    }

    var checkPop = document.getElementById('checkPop');
    if (!checkPop) {
        checkPop = document.createElement('div');
        checkPop.className = 'check-pop';
        checkPop.id = 'checkPop';
        checkPop.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
        document.body.appendChild(checkPop);
    }

    function showCheckAnimation() {
        var el = document.getElementById('checkPop');
        if (!el) return;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        setTimeout(function() {
            el.classList.remove('show');
        }, 600);
    }

    window.refreshCurrentPage = async function() {
        if (State.isBulkEditing) return;
        await refreshAllData();
        if (document.getElementById('indexPage').classList.contains('active')) fetchIndexData(true);
    };

    window.forceRefreshAll = async function() {
        await refreshAllData();
        if (document.getElementById('indexPage').classList.contains('active')) fetchIndexData(true);
        if (document.getElementById('overviewPage').classList.contains('active')) UI.renderOverview();
        showModalOld('刷新完成', '所有数据已更新', '', [{ text: '知道了', cls: 'primary' }]);
    };

    // ================================================================
    //  十六、主题切换
    // ================================================================
    function setTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('app_theme', t);
        var td = document.getElementById('themeDark'),
            tl = document.getElementById('themeLight');
        if (td) td.classList.toggle('selected', t === 'dark');
        if (tl) tl.classList.toggle('selected', t === 'light');
        document.getElementById('themeColorMeta').setAttribute('content', t === 'dark' ? '#000000' : '#ffffff');
        toggleThemeRefresh();
    }
    window.setTheme = setTheme;

    function toggleThemeRefresh() {
        var ac = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#888';
        var gc = getComputedStyle(document.documentElement).getPropertyValue('--border-subtle').trim() || '#333';
        Object.keys(State.trendCharts).forEach(function(c) {
            var ch = State.trendCharts[c];
            if (ch && ch.canvas && document.body.contains(ch.canvas)) {
                ch.options.scales.x.ticks.color = ac;
                ch.options.scales.x.grid.color = gc;
                ch.options.scales.y.ticks.color = ac;
                ch.options.scales.y.grid.color = gc;
                ch.update();
            }
        });
        if (State.accountTrendChart && State.accountTrendChart.canvas && document.body.contains(State.accountTrendChart.canvas)) {
            State.accountTrendChart.options.scales.y.ticks.color = ac;
            State.accountTrendChart.options.scales.y.grid.color = gc;
            State.accountTrendChart.update();
        }
        UI.updateTradeBadges();
    }

    // ================================================================
    //  十七、诊断功能
    // ================================================================
    function setDiagUI(id, status, text) {
        var dot = document.getElementById('dot' + id),
            txt = document.getElementById('txt' + id);
        if (dot) dot.className = 'status-dot ' + status;
        if (txt) txt.textContent = text;
    }

    window.copyDiagnosisLink = function(url) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function() {
                showModalOld('已复制', '链接已复制到剪贴板', '', [{ text: '知道了', cls: 'primary' }]);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showModalOld('已复制', '链接已复制到剪贴板', '', [{ text: '知道了', cls: 'primary' }]);
        }
    };

    window.runDiag = async function() {
        var btn = document.getElementById('btnRunDiag');
        if (btn) { btn.querySelector('.child-card-label').textContent = '诊断中…';
            btn.style.pointerEvents = 'none'; }
        setDiagUI('Fund', 'yellow', '检测中');
        setDiagUI('Tx', 'yellow', '检测中');
        setDiagUI('Index', 'yellow', '检测中');
        setDiagUI('EastMoney', 'yellow', '检测中');
        setDiagUI('Calendar', 'yellow', '检测中');

        try {
            var d = await API.fetchSingle('000001');
            if (d.gsz) setDiagUI('Fund', 'green', '正常');
            else setDiagUI('Fund', 'red', '失败');
        } catch (e) { setDiagUI('Fund', 'red', '失败'); }

        try {
            var txData = await API.fetchTxFund('000001');
            if (txData && txData.nav && txData.nav > 0) setDiagUI('Tx', 'green', '正常');
            else setDiagUI('Tx', 'yellow', '延迟');
        } catch (e) { setDiagUI('Tx', 'red', '失败'); }

        try {
            var ac2 = new AbortController();
            var to2 = setTimeout(function() { ac2.abort(); }, 10000);
            var resp2 = await fetch('https://qt.gtimg.cn/q=s_sh000001', { signal: ac2.signal });
            clearTimeout(to2);
            var text2 = await resp2.text();
            var m2 = text2.match(/v_s_(\w+)="(.+)"/);
            if (m2) {
                var price = parseFloat(m2[2].split('~')[3]);
                if (!isNaN(price) && price > 0) setDiagUI('Index', 'green', '正常');
                else setDiagUI('Index', 'red', '失败');
            } else setDiagUI('Index', 'red', '失败');
        } catch (e) { setDiagUI('Index', 'red', '失败'); }

        try {
            var testData = await API.fetchGlobalEM('124.HSTECH');
            var d2 = testData ? testData.data : null;
            var price2 = d2 && d2.f43 ? d2.f43 / 100 : NaN;
            if (!isNaN(price2) && price2 > 0) setDiagUI('EastMoney', 'green', '正常');
            else setDiagUI('EastMoney', 'red', '失败');
        } catch (e) { setDiagUI('EastMoney', 'red', '失败'); }

        try {
            var calData = await TradeCalendar.getCalendar(true);
            if (calData && calData.code === 0) {
                setDiagUI('Calendar', 'green', '正常');
            } else {
                setDiagUI('Calendar', 'red', '失败');
            }
        } catch (e) {
            setDiagUI('Calendar', 'red', '失败');
        }

        if (btn) { btn.querySelector('.child-card-label').textContent = '诊断全部数据源';
            btn.style.pointerEvents = 'auto'; }
    };

    // ================================================================
    //  十八、收益弹窗
    // ================================================================
    (function() {
        var overlay = document.getElementById('profitModalOverlay');
        var cardStack = document.getElementById('profitCardStack');
        var dateDisplay = document.getElementById('profitDateDisplay');
        var calendarCard = document.getElementById('profitCalendarCard');
        var monthYear = document.getElementById('profitMonthYear');
        var calendarDays = document.getElementById('profitCalendarDays');
        var signToggle = document.getElementById('profitSignToggle');
        var prevBtn = document.getElementById('profitPrevBtn');
        var nextBtn = document.getElementById('profitNextBtn');
        var cancelBtn = document.getElementById('profitCancelBtn');
        var confirmBtn = document.getElementById('profitConfirmBtn');
        var profitInput = document.getElementById('profitInput');

        var year = new Date().getFullYear(),
            month = new Date().getMonth() + 1;
        var selectedDate = '';
        var isCalendarOpen = false;

        function pad2(n) { return String(n).padStart(2, '0'); }

        function formatKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

        function renderCalendar(y, m) {
            try {
                if (!calendarDays) return;
                var first = new Date(y, m - 1, 1);
                var last = new Date(y, m, 0);
                var daysInMonth = last.getDate();
                var startWeekday = first.getDay();
                var offset = startWeekday === 0 ? 6 : startWeekday - 1;
                var prevLast = new Date(y, m - 1, 0).getDate();
                var html = '';

                var prevY = y,
                    prevM = m - 1;
                if (prevM < 1) { prevM = 12;
                    prevY--; }
                for (var i = offset - 1; i >= 0; i--) {
                    var day = prevLast - i;
                    html += '<button class="calendar-day other-month" data-y="' + prevY + '" data-m="' + prevM +
                        '" data-d="' + day + '">' + day + '</button>';
                }
                for (var d = 1; d <= daysInMonth; d++) {
                    var key = formatKey(y, m, d);
                    var cls = 'calendar-day';
                    if (key === selectedDate) cls += ' selected';
                    html += '<button class="' + cls + '" data-y="' + y + '" data-m="' + m + '" data-d="' + d +
                        '">' + d + '</button>';
                }
                var total = offset + daysInMonth;
                var rows = Math.ceil(total / 7);
                var needed = rows * 7;
                var remain = needed - total;
                var nextY = y,
                    nextM = m + 1;
                if (nextM > 12) { nextM = 1;
                    nextY++; }
                for (var d2 = 1; d2 <= remain; d2++) {
                    html += '<button class="calendar-day other-month" data-y="' + nextY + '" data-m="' + nextM +
                        '" data-d="' + d2 + '">' + d2 + '</button>';
                }
                calendarDays.innerHTML = html;
                monthYear.textContent = y + '年' + m + '月';

                calendarDays.querySelectorAll('.calendar-day').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        try {
                            var y = parseInt(this.dataset.y);
                            var m = parseInt(this.dataset.m);
                            var d = parseInt(this.dataset.d);
                            var key = formatKey(y, m, d);
                            selectedDate = key;
                            dateDisplay.value = key;
                            renderCalendar(year, month);
                            closeCalendar();
                        } catch (e) {
                            console.error('选择日期时出错:', e);
                        }
                    });
                });
            } catch (e) {
                console.error('渲染日历时出错:', e);
            }
        }

        function prevMonth() {
            var y = year,
                m = month - 1;
            if (m < 1) { m = 12;
                y--; }
            year = y;
            month = m;
            renderCalendar(year, month);
        }

        function nextMonth() {
            var y = year,
                m = month + 1;
            if (m > 12) { m = 1;
                y++; }
            year = y;
            month = m;
            renderCalendar(year, month);
        }

        function openCalendar() {
            if (isCalendarOpen) return;
            isCalendarOpen = true;
            if (cardStack) cardStack.classList.add('push-up');
            if (calendarCard) calendarCard.classList.add('open');
        }

        function closeCalendar() {
            if (!isCalendarOpen) return;
            isCalendarOpen = false;
            if (cardStack) cardStack.classList.remove('push-up');
            if (calendarCard) calendarCard.classList.remove('open');
        }

        function toggleCalendar() {
            if (isCalendarOpen) closeCalendar();
            else openCalendar();
        }

        window.openProfitModal = function(currentProfit) {
            try {
                if (!overlay || !dateDisplay || !profitInput || !signToggle || !calendarDays) {
                    console.error('收益弹窗元素未找到');
                    return;
                }
                var now = new Date();
                year = now.getFullYear();
                month = now.getMonth() + 1;
                var today = formatKey(year, month, now.getDate());
                selectedDate = today;
                dateDisplay.value = today;
                if (currentProfit !== undefined && currentProfit !== null && !isNaN(currentProfit)) {
                    var absVal = Math.abs(currentProfit);
                    profitInput.value = absVal.toFixed(2);
                    signToggle.textContent = currentProfit >= 0 ? '+' : '−';
                } else {
                    profitInput.value = '0.00';
                    signToggle.textContent = '+';
                }
                renderCalendar(year, month);
                overlay.classList.add('active');
                closeCalendar();
                setTimeout(function() {
                    if (profitInput) {
                        profitInput.focus();
                        profitInput.select();
                    }
                }, 300);
            } catch (e) {
                console.error('打开收益弹窗时出错:', e);
            }
        };

        cancelBtn.addEventListener('click', function() {
            try {
                overlay.classList.remove('active');
                closeCalendar();
            } catch (e) {
                console.error('取消时出错:', e);
            }
        });

        confirmBtn.addEventListener('click', function() {
            try {
                var date = dateDisplay.value;
                var rawVal = parseFloat(profitInput.value);
                var sign = signToggle.textContent.trim() === '−' ? -1 : 1;
                var profitVal = rawVal * sign;
                if (!date || isNaN(rawVal) || rawVal < 0) {
                    alert('请选择日期并输入有效的正数金额');
                    return;
                }
                if (window._saveProfit) {
                    window._saveProfit(date, profitVal);
                }
                overlay.classList.remove('active');
                closeCalendar();
            } catch (e) {
                console.error('确认收益修正时出错:', e);
                alert('操作失败，请重试');
            }
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                closeCalendar();
            }
        });
        dateDisplay.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleCalendar();
        });
        calendarCard.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        signToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            this.textContent = this.textContent.trim() === '+' ? '−' : '+';
        });
        prevBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            prevMonth();
        });
        nextBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            nextMonth();
        });
        profitInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') confirmBtn.click();
        });

        var now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
        selectedDate = formatKey(year, month, now.getDate());
        dateDisplay.value = selectedDate;
        renderCalendar(year, month);
    })();

    // ================================================================
    //  十九、左滑返回
    // ================================================================
    function bindSwipeBack() {
    var startX = 0,
        startY = 0,
        swiping = false,
        isAnimating = false;
    var threshold = 80;
    document.addEventListener('touchstart', function(e) {
        if (isAnimating) return;
        if (e.touches.length === 1 && e.touches[0].clientX <= 30) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            swiping = true;
        } else { swiping = false; }
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
        if (!swiping || isAnimating) return;
        var dx = e.touches[0].clientX - startX,
            dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && dx > 20) { e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('touchend', function(e) {
        if (!swiping || isAnimating) return;
        swiping = false;
        var dx = e.changedTouches[0].clientX - startX;
        if (dx > threshold) {
            closeAllMenus();
            isAnimating = true;
            var currentPage = document.querySelector('.page.active');
            var homePage = document.getElementById('homePage');
            if (!currentPage || currentPage === homePage) { isAnimating = false; return; }
            currentPage.style.transition = 'opacity 0.25s ease';
            currentPage.style.opacity = '0';
            homePage.style.opacity = '0';
            homePage.classList.add('active');
            setTimeout(function() {
                homePage.style.transition = 'opacity 0.25s ease';
                homePage.style.opacity = '1';
            }, 50);
            setTimeout(function() {
                currentPage.classList.remove('active');
                currentPage.style.opacity = '1';
                currentPage.style.transition = '';
                homePage.style.transition = '';
                isAnimating = false;
                document.querySelectorAll('.page').forEach(function(p) {
                    if (p !== homePage && p !== currentPage) p.classList.remove('active');
                });
                UI.updateHomeCounts();  // ← 改这里
            }, 300);
        }
    });
}

    // ================================================================
    //  二十、清理与初始化
    // ================================================================
    function cleanup() {
        clearTimeout(State.refreshTimer);
        clearTimeout(State.wakeUpTimer);
        clearTimeout(State.indexTimer);
        for (var reqId in State.jsonpRequests) {
            if (State.jsonpRequests[reqId] && State.jsonpRequests[reqId].cleanup) {
                State.jsonpRequests[reqId].cleanup();
            }
            delete State.jsonpRequests[reqId];
        }
        Object.keys(State.trendCharts).forEach(function(c) {
            if (State.trendCharts[c]) {
                State.trendCharts[c].destroy();
                delete State.trendCharts[c];
            }
        });
        if (State.accountTrendChart) {
            State.accountTrendChart.destroy();
            State.accountTrendChart = null;
        }
        console.log('[Cleanup] 所有定时器与请求已清理');
    }
    window.addEventListener('beforeunload', cleanup);

    function init() {
        loadAllData();
        var theme = localStorage.getItem('app_theme') || 'dark';
        setTheme(theme);

        var btnW = document.getElementById('btnMoreWatchlist');
        var btnH = document.getElementById('btnMoreHoldings');
        if (btnW) {
            btnW.addEventListener('click', function(e) {
                e.stopPropagation();
                if (this.textContent === '完成' && State.isWatchlistMenuOpen) {
                    closeAllMenus();
                    return;
                }
                window.showWatchlistMenu(this);
            });
        }
        if (btnH) {
            btnH.addEventListener('click', function(e) {
                e.stopPropagation();
                if (State.isBulkEditing) {
                    UI.exitBulkEditMode();
                    return;
                }
                if (this.textContent === '完成' && State.isHoldingsMenuOpen) {
                    closeAllMenus();
                    return;
                }
                window.showHoldingsMenu(this);
            });
        }

        var heroTitle = document.querySelector('.home-hero-title');
        var heroSubtitle = document.querySelector('.home-hero-subtitle');
        if (heroTitle) heroTitle.textContent = '基金跟踪';
        if (heroSubtitle) heroSubtitle.textContent = 'Fund-Tracker';
        document.title = 'Fund-Tracker';

        UI.updateHomeCounts();
        UI.renderWatchlist();
        if (Object.keys(State.holdings).length > 0) UI.renderHoldings();

        TradeCalendar.getCalendar(false).catch(function(err) {
            console.warn('交易日历预加载失败，将降级为周末判断:', err);
        });

        UI.autoBackfillSnapshots();

        refreshAllData();
        scheduleRefresh();
        scheduleIndexRefresh();
        scheduleDailySnapshot();

        bindSwipeBack();
        initPullToRefresh();

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                refreshAllData();
                if (document.getElementById('indexPage').classList.contains('active')) fetchIndexData(true);
                scheduleIndexRefresh();
                UI.updateTradeBadges();
                UI.autoBackfillSnapshots();
            } else {
                clearTimeout(State.refreshTimer);
                clearTimeout(State.wakeUpTimer);
                clearTimeout(State.indexTimer);
            }
        });

        var oht = document.getElementById('overviewHeaderTitle');
        var ec = 0,
            et = null;
        if (oht) {
            oht.addEventListener('click', function() {
                ec++;
                if (ec >= 5) {
                    ec = 0;
                    State.summaryVisible = !State.summaryVisible;
                    UI.renderOverview();
                    if (et) clearTimeout(et);
                    return;
                }
                if (et) clearTimeout(et);
                et = setTimeout(function() { ec = 0; }, 2000);
            });
        }

        UI.updateTradeBadges();
        setInterval(function() { UI.updateTradeBadges(); }, 30000);

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js', { scope: './' })
                    .then(function(reg) {
                        console.log('✅ Service Worker 注册成功，作用域:', reg.scope);
                    })
                    .catch(function(err) {
                        console.warn('⚠️ Service Worker 注册失败:', err);
                    });
            });
        }

        console.log('✅ Fund-Tracker 已启动 (最终修复版)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();