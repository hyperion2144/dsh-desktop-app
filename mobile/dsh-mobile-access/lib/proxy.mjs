// Host/Origin 改写反向代理（HTTP + WebSocket upgrade 透传），自实现。
// 行为对齐设计 §2.3：入站 Host/Origin 统一改写成 upstream（loopback），
// 使 dsh 的 /api 信任栅栏永远看到 loopback；可选注入 polyfill/桌面参数补丁。
import http from 'node:http';

export const POLYFILL = '<script data-dsh-mobile-polyfill="1">!function(){if(self.crypto&&!self.crypto.randomUUID){self.crypto.randomUUID=function(){var b=new Uint8Array(16);self.crypto.getRandomValues(b);b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h="";for(var i=0;i<16;i++){var x=b[i].toString(16);h+=(x.length<2?"0":"")+x;if(i===3||i===5||i===7||i===9)h+="-";}return h;}}}();</script>';

export function desktopEnvPatchScript(platform) {
  const p = ['darwin','win32','linux'].includes(platform) ? platform : 'linux';
  return '<script data-dsh-mobile-desktop-patch="1">!function(){try{var s=new URLSearchParams(location.search);if(!s.has("dsh-desktop-mode")||!s.has("dsh-desktop-platform")){s.set("dsh-desktop-mode","compatibility");s.set("dsh-desktop-platform","' + p + '");var u=new URL(location.href);u.search=s.toString();history.replaceState(null,"",u);}}catch(e){}}();</script>';
}

function rewriteHeaders(headers, upstreamHost, upstreamPort) {
  const out = { ...headers };
  out['host'] = upstreamHost + ':' + upstreamPort;
  if (out['origin']) out['origin'] = 'http://' + upstreamHost + ':' + upstreamPort;
  return out;
}

function isCompressed(headers) {
  return /(^|,)\s*(gzip|br|deflate)\s*(,|$)/i.test(String(headers['content-encoding'] ?? ''));
}

/**
 * 创建改写反代服务。
 * @param opts { upstreamHost, upstreamPort, inject: string[], auth: (req) => {ok, setCookie} | null }
 * @returns {server, listen(port?)}
 */
export function createRewriteProxy(opts) {
  const { upstreamHost = '127.0.0.1', upstreamPort = 3080, inject = [], auth = null, onInjectSkip = null } = opts;
  const upstream = upstreamHost + ':' + upstreamPort;
  const server = http.createServer((req, res) => {
    if (auth) {
      const r = auth(req);
      if (!r.ok) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unpaired' }));
        return;
      }
      if (r.setCookie) res.setHeader('set-cookie', r.setCookie);
    }
    const headers = rewriteHeaders(req.headers, upstreamHost, upstreamPort);
    const p = http.request({ host: upstreamHost, port: upstreamPort, path: req.url, method: req.method, headers }, (r) => {
      const outHeaders = { ...r.headers };
      const htmlDoc = /text\/html/i.test(String(r.headers['content-type'] ?? ''));
      const shouldInject = htmlDoc && !isCompressed(r.headers) && inject.length > 0;
      if (shouldInject) {
        delete outHeaders['content-length'];
        outHeaders['transfer-encoding'] = 'chunked';
      }
      res.writeHead(r.statusCode, outHeaders);
      if (shouldInject) {
        let buf = '';
        r.setEncoding('utf8');
        let injected = false;
        r.on('data', (c) => {
          buf += c;
          if (!injected && buf.includes('</body>')) {
            const ins = inject.join('');
            buf = buf.replace('</body>', ins + '</body>');
            injected = true;
          }
          res.write(buf);
          buf = '';
        });
        r.on('end', () => {
          if (!injected && buf) { buf = buf + inject.join(''); res.write(buf); }
          res.end();
        });
      } else {
        if (htmlDoc && isCompressed(r.headers) && inject.length > 0 && onInjectSkip) {
          onInjectSkip(req.url.split('?')[0]);
        }
        r.pipe(res);
      }
    });
    p.on('error', (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e)); });
    req.pipe(p);
  });

  server.on('upgrade', (req, socket, head) => {
    if (auth) {
      const r = auth(req);
      if (!r.ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.end();
        return;
      }
    }
    const headers = rewriteHeaders(req.headers, upstreamHost, upstreamPort);
    const up = http.request({ host: upstreamHost, port: upstreamPort, path: req.url, headers });
    up.on('upgrade', (res, upSocket, upHead) => {
      if (res.statusCode !== 101) {
        socket.write('HTTP/1.1 ' + res.statusCode + ' Upgrade Failed\r\n\r\n');
        socket.end();
        return;
      }
      let h = 'HTTP/1.1 101 Switching Protocols\r\n';
      if (res.headers['upgrade']) h += 'Upgrade: ' + res.headers['upgrade'] + '\r\n';
      if (res.headers['connection']) h += 'Connection: ' + res.headers['connection'] + '\r\n';
      if (res.headers['sec-websocket-accept']) h += 'Sec-WebSocket-Accept: ' + res.headers['sec-websocket-accept'] + '\r\n';
      socket.write(h + '\r\n');
      if (upHead && upHead.length) upSocket.write(upHead);
      if (head && head.length) socket.write(head);
      upSocket.pipe(socket);
      socket.pipe(upSocket);
    });
    up.on('error', () => socket.destroy());
    up.end();
  });

  return {
    server,
    upstream,
    rewriteHeaders: (h) => rewriteHeaders(h, upstreamHost, upstreamPort),
  };
}