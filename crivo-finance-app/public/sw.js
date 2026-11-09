/* Crivo Finance: private financial responses are NEVER cached by this worker. */
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data={title:'Crivo Finance',body:'Você tem um aviso financeiro.',url:'/'};
  try { data={...data,...event.data.json()}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:'crivo-finance-alert',data:{url:data.url}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url=new URL('/',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const open=windows.find(w=>w.url.startsWith(self.location.origin));
    if(open) {await open.focus(); await open.navigate(url);} else await clients.openWindow(url);
  })());
});
