/**
 * PWA (Progressive Web Apps) & Service Worker ライフサイクル管理
 */

export async function syncPWAStatus(enabled: boolean) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (enabled) {
        try {
            await navigator.serviceWorker.register('/serviceWorker.js', { scope: '/' });
            console.log('[PWA] Service Worker registered successfully');
        } catch (err) {
            console.error('[PWA] Service Worker registration failed:', err);
        }
    } else {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
            console.log('[PWA] Service Worker unregistered successfully');
        } catch (err) {
            console.error('[PWA] Service Worker unregistration failed:', err);
        }
    }
}

export function initPWA() {
    if (typeof window === 'undefined') return;
    try {
        const saved = localStorage.getItem('epgdeck_settings');
        let enabled = true;
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.isPWA === 'boolean') {
                enabled = parsed.isPWA;
            }
        }
        syncPWAStatus(enabled);
    } catch {
        syncPWAStatus(true);
    }
}
