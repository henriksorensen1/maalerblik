const PREFIX='maalerblik-'+self.registration.scope;
const CACHE=PREFIX+'v4-kwh';
const FILES=['./','./index.html','./style.css','./app.mjs?v=2-kwh','./core.mjs?v=2-kwh','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(!url.href.startsWith(self.registration.scope)||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope).href)));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
