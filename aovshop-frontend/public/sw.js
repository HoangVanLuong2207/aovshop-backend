self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body,
                icon: data.icon || '/logo.png',
                badge: '/badge.png',
                vibrate: [100, 50, 100],
                data: data.data || {}
            };
            event.waitUntil(
                self.registration.showNotification(data.title, options)
            );
        } catch (e) {
            console.error('Error parsing push data:', e);
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    let url = '/';
    if (event.notification.data && event.notification.data.url) {
        url = event.notification.data.url;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            // Check if there is already a window open with this URL
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
