import { defineStore } from 'pinia'
import { storage } from '../utils/storage'

export const useThemeStore = defineStore('theme', {
    state: () => ({
        isDark: storage.get('theme') === 'dark',
    }),

    actions: {
        toggle() {
            this.isDark = !this.isDark
            storage.set('theme', this.isDark ? 'dark' : 'light')
            this.applyTheme()
        },

        applyTheme() {
            document.documentElement.setAttribute('data-theme', this.isDark ? 'dark' : 'light')
        },

        init() {
            this.applyTheme()
        },
    },
})
