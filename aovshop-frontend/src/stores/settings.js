import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useSettingsStore = defineStore('settings', () => {
    const shopName = ref('AOV Shop')
    const shopLogo = ref(null)
    const shopBanner = ref(null)
    const contactZalo = ref('')
    const contactMessenger = ref('')
    const contactHotline = ref('')
    const loaded = ref(false)

    // Cập nhật favicon và document title
    const updateBrowserMeta = () => {
        // Update document title
        document.title = shopName.value

        // Update favicon nếu có logo
        if (shopLogo.value) {
            let favicon = document.querySelector("link[rel~='icon']")
            if (!favicon) {
                favicon = document.createElement('link')
                favicon.rel = 'icon'
                document.head.appendChild(favicon)
            }
            favicon.href = shopLogo.value
        }
    }

    const fetchShopInfo = async () => {
        if (loaded.value) return

        try {
            const response = await api.get('/shop/info')
            shopName.value = response.data.shop_name || 'AOV Shop'
            shopLogo.value = response.data.shop_logo
            shopBanner.value = response.data.shop_banner
            contactZalo.value = response.data.contact_zalo || ''
            contactMessenger.value = response.data.contact_messenger || ''
            contactHotline.value = response.data.contact_hotline || ''
            loaded.value = true
            updateBrowserMeta()
        } catch (error) {
            console.error('Failed to fetch shop info:', error)
        }
    }

    // Force refresh - bỏ qua cache
    const refreshShopInfo = async () => {
        try {
            const response = await api.get('/shop/info')
            shopName.value = response.data.shop_name || 'AOV Shop'
            shopLogo.value = response.data.shop_logo
            shopBanner.value = response.data.shop_banner
            contactZalo.value = response.data.contact_zalo || ''
            contactMessenger.value = response.data.contact_messenger || ''
            contactHotline.value = response.data.contact_hotline || ''
            loaded.value = true
            updateBrowserMeta()
        } catch (error) {
            console.error('Failed to refresh shop info:', error)
        }
    }

    return {
        shopName,
        shopLogo,
        shopBanner,
        contactZalo,
        contactMessenger,
        contactHotline,
        loaded,
        fetchShopInfo,
        refreshShopInfo,
    }
})
