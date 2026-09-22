/* Service worker do Planejamento de Safra — SEM CACHE.
   Nada do app fica guardado no aparelho: todo arquivo é buscado SEMPRE da rede
   (cache:'no-store' também fura o cache HTTP do navegador/GitHub Pages).
   Ao ativar, apaga qualquer cache de versões antigas. O worker só existe para o
   app continuar "instalável" (PWA) e para dar uma mensagem clara quando não há internet. */
const VERSAO = 'nocache-v67';   // mudar este texto força os aparelhos a trocarem o worker

self.addEventListener('install', () => { self.skipWaiting(); });   // assume na hora, sem esperar fechar as abas

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch (err) {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // só os arquivos do próprio app
  e.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => {
      // sem internet: não há cópia guardada de propósito — avisa em vez de mostrar erro do navegador
      if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Sem internet</title><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#16404d">' +
          '<h2>📴 Sem internet</h2><p>O app não guarda cópia no aparelho para estar sempre na versão mais nova.<br>' +
          'Conecte-se e toque em recarregar.</p><p><button onclick="location.reload()" style="font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#16404d;color:#fff">↻ Recarregar</button></p></body>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      return new Response('', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    })
  );
});
