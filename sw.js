var C="focus-v3";var A=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(A)}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(e){var r=e.request;if(r.method!=="GET")return;var u=new URL(r.url);if(u.origin!==location.origin||u.pathname.indexOf(new URL(self.registration.scope).pathname)!==0)return;
 var page=r.mode==="navigate"||/\/(index\.html)?$/.test(u.pathname);
 if(page){e.respondWith(fetch(r).then(function(x){var cp=x.clone();caches.open(C).then(function(c){c.put("index.html",cp)});return x}).catch(function(){return caches.match("index.html").then(function(m){return m||caches.match("./")})}))}
 else e.respondWith(caches.match(r).then(function(m){return m||fetch(r).then(function(x){var cp=x.clone();caches.open(C).then(function(c){c.put(r,cp)});return x})}))});
