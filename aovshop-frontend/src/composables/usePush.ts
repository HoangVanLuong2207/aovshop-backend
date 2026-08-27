import { ref } from 'vue';
import api from '../api';

const isSupported = ref(typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
const permission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default');
const isSubscribed = ref(false);

export function usePush() {
    const registerServiceWorker = async () => {
        if (!isSupported.value) return null;
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            return registration;
        } catch (err) {
            console.error('SW registration failed:', err);
            return null;
        }
    };

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const checkSubscription = async () => {
        if (!isSupported.value) return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        isSubscribed.value = !!subscription;
        permission.value = Notification.permission;
        return subscription;
    };

    const subscribe = async (authenticated = false) => {
        console.log('[Push] Starting subscription process...');
        if (!isSupported.value) {
            console.error('[Push] Push notifications are not supported in this browser.');
            return false;
        }
        
        try {
            console.log('[Push] Requesting permission...');
            const perm = await Notification.requestPermission();
            permission.value = perm;
            console.log('[Push] Permission result:', perm);
            if (perm !== 'granted') {
                console.warn('[Push] Permission not granted.');
                return false;
            }

            console.log('[Push] Waiting for Service Worker to be ready...');
            const registration = await navigator.serviceWorker.ready;
            console.log('[Push] Service Worker ready.');
            
            // Get public key from server
            console.log('[Push] Fetching VAPID public key from server...');
            const { data } = await api.get('/shop/push/public-key');
            console.log('[Push] Public key response:', data);
            if (!data.publicKey) {
                console.error('[Push] VAPID public key not found in server response.');
                throw new Error('VAPID public key not found');
            }

            console.log('[Push] Registering with Push Manager...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(data.publicKey)
            });
            console.log('[Push] Successfully subscribed with Push Manager:', subscription.endpoint);

            const endpoint = authenticated ? '/shop/push/subscribe-auth' : '/shop/push/subscribe';
            console.log(`[Push] Sending subscription to backend (${endpoint})...`);
            await api.post(endpoint, { subscription: subscription.toJSON() });
            console.log('[Push] Backend subscription successful.');
            
            isSubscribed.value = true;
            return true;
        } catch (err) {
            console.error('[Push] Subscription failed with error:', err);
            return false;
        }
    };

    const unsubscribe = async () => {
        if (!isSupported.value) return false;
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                // Optional: notify backend to remove subscription
            }
            isSubscribed.value = false;
            return true;
        } catch (err) {
            console.error('Unsubscribe failed:', err);
            return false;
        }
    };

    return {
        isSupported,
        permission,
        isSubscribed,
        registerServiceWorker,
        checkSubscription,
        subscribe,
        unsubscribe
    };
}
