// Chỉ được chèn vào khung có proxy (xem server.js). Chạy trước mọi script của game: đổi các kết nối game gọi ra máy chủ
// *.volamidle.net (fetch / XMLHttpRequest / WebSocket / sendBeacon) thành gọi về cổng của khung này, để máy chủ chuyển tiếp qua proxy.
(function () {
  if (window.__vlPx) return;
  window.__vlPx = 1;
  var HOST_OK = /(^|\.)volamidle\.net$/i;
  function map(u, ws) {
    try {
      var x = new URL(u, location.href);
      if (x.host === location.host) return u;
      var s = x.protocol.replace(":", "");
      if (!/^(https|wss)$/.test(s) || !HOST_OK.test(x.hostname)) return u;
      return (ws ? "ws:" : location.protocol) + "//" + location.host + "/sb/__px/" + s + "/" + x.host + x.pathname + x.search;
    } catch (e) {
      return u;
    }
  }

  var nf = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string" || input instanceof URL) return nf.call(this, map(String(input)), init);
    if (input && input.url) {
      var m = map(input.url);
      if (m !== input.url) return nf.call(this, new Request(m, input), init);
    }
    return nf.call(this, input, init);
  };

  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var a = Array.prototype.slice.call(arguments);
    a[1] = map(String(url));
    return xo.apply(this, a);
  };

  var NativeWS = window.WebSocket;
  function PxWS(url, protocols) {
    var u = map(String(url), true);
    return protocols === undefined ? new NativeWS(u) : new NativeWS(u, protocols);
  }
  PxWS.prototype = NativeWS.prototype;
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) { PxWS[k] = NativeWS[k]; });
  window.WebSocket = PxWS;

  if (navigator.sendBeacon) {
    var sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { return sb(map(String(url)), data); };
  }
})();
