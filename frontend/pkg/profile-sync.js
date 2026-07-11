/* profile-sync.js — 个人资料云备份（2026-07-11）。
   背景：头像(IndexedDB+localStorage)、昵称签名(ls-edit-*)、皮肤壁纸(ls-*)、
   累计/收藏(ls-store-v1) 原来只存在浏览器里，iOS Safari 对 7 天没打开的网站会把
   localStorage 和 IndexedDB 整包清空——用户的设置真的全丢过一次。
   做法：本地照旧是主数据（读写都快）；这里定期把整包快照 PUT 到
   /api/profile-backup（走 PIN 门禁），检测到本地被清空时自动 GET 拉回并刷新一次。
   全程失败安全：备份失败下轮再试，恢复失败就当没有备份，绝不打扰正常使用。 */
(function () {
  if (window.__DUETTO_PROFILE_SYNC) return; window.__DUETTO_PROFILE_SYNC = 1;
  var API = function () { return (window.__LS_API || '/api'); };
  var IDB_NAME = 'ls-image-slots', IDB_STORE = 'kv';
  var RESTORE_GUARD = 'ls-profile-restored'; // sessionStorage 防止恢复→刷新→再恢复死循环

  function idbGetSlots() {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open(IDB_NAME, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try {
            var tx = rq.result.transaction(IDB_STORE, 'readonly');
            var g = tx.objectStore(IDB_STORE).get('slots');
            g.onsuccess = function () { res(g.result || null); };
            g.onerror = function () { res(null); };
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function idbPutSlots(slots) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open(IDB_NAME, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
        rq.onerror = function () { res(false); };
        rq.onsuccess = function () {
          try {
            var tx = rq.result.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(slots, 'slots');
            tx.oncomplete = function () { res(true); };
            tx.onerror = function () { res(false); };
          } catch (e) { res(false); }
        };
      } catch (e) { res(false); }
    });
  }

  // 快照 = 所有 ls-* / ls.* 键（duetto-token 故意不备份：token 是这台设备换来的凭证）
  function collectLocal() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('ls-') === 0 || k.indexOf('ls.') === 0)) out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  }
  function snapshot() {
    return idbGetSlots().then(function (slots) {
      var data = { keys: collectLocal(), ts: Date.now() };
      if (slots && typeof slots === 'object' && Object.keys(slots).length) data.image_slots = slots;
      return data;
    });
  }

  var lastPushed = '';
  function push(force) {
    if (!window.__duettoToken || !window.__duettoToken()) return; // 还没过 PIN 门，等下轮
    snapshot().then(function (data) {
      if (!data.keys || !Object.keys(data.keys).length) return;   // 空快照不推，别把好备份冲掉
      var body = JSON.stringify({ data: data });
      // 指纹去掉 ts 再比，内容没变就不打扰服务器
      var fp = body.length + ':' + JSON.stringify(data.keys).length + ':' + (data.image_slots ? JSON.stringify(data.image_slots).length : 0);
      if (!force && fp === lastPushed) return;
      fetch(API() + '/profile-backup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body })
        .then(function (r) { if (r && r.ok) lastPushed = fp; })
        .catch(function () {});
    });
  }

  function looksWiped() {
    // 这两个键正常使用中一定会有；都没有 = 全新设备或被 Safari 清空，值得去拉备份
    try { return !localStorage.getItem('ls-store-v1') && !localStorage.getItem('ls-skin'); } catch (e) { return false; }
  }

  function maybeRestore() {
    try { if (sessionStorage.getItem(RESTORE_GUARD)) return; } catch (e) {}
    if (!looksWiped()) return;
    if (!window.__duettoToken || !window.__duettoToken()) { setTimeout(maybeRestore, 3000); return; } // 等她输完 PIN
    fetch(API() + '/profile-backup').then(function (r) { return r.json(); }).then(function (j) {
      var data = j && j.data;
      if (!data || !data.keys || !Object.keys(data.keys).length) return;
      try { for (var k in data.keys) { if (Object.prototype.hasOwnProperty.call(data.keys, k)) localStorage.setItem(k, data.keys[k]); } } catch (e) {}
      var done = function () {
        try { sessionStorage.setItem(RESTORE_GUARD, '1'); } catch (e) {}
        location.reload();
      };
      if (data.image_slots) idbPutSlots(data.image_slots).then(done); else done();
    }).catch(function () {});
  }

  // 启动：先看要不要恢复；之后每 60 秒查一次有没有变化要备份；切后台/关页前抓紧推一把
  setTimeout(maybeRestore, 800);
  setInterval(function () { push(false); }, 60000);
  setTimeout(function () { push(true); }, 8000); // 开页 8 秒后先做一次全量，保证至少有一份备份
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') push(false); });
  window.addEventListener('pagehide', function () { push(false); });
})();
