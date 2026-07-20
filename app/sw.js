/* Service worker do Planejamento de Safra.
   Estratégia "network-first": quando há internet, SEMPRE busca a versão mais
   nova da rede; o cache é só reserva para funcionar offline. Assim o app se
   atualiza sozinho e acaba a briga com o cache do celular. */
const CACHE = 'planejamento-cache-v2';

self.addEventListener('install', () => {
  // assume o controle imediatamente (não espera fechar as abas antigas)
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // limpa caches antigos de versões anteriores
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // só mexe nos arquivos do próprio app
  e.respondWith(
    // {cache:'no-store'} = ignora o cache HTTP do navegador/GitHub Pages e
    // busca SEMPRE da rede; sem isso o "network-first" ainda servia o arquivo
    // velho enquanto o cache HTTP (10 min) não expirava — por isso a web não atualizava.
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        // guarda uma cópia boa para uso offline
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)) // sem internet: usa o que tiver guardado
  );
});
