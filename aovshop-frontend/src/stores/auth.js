import { defineStore } from 'pinia'
import { authApi } from '../api'
import { storage } from '../utils/storage'

export const useAuthStore = defineStore('auth', {
    state: () => ({
        user: storage.get('user'),
        token: storage.get('token'),
        loading: false,
        error: null,
    }),

    getters: {
        isAuthenticated: (state) => !!state.token,
        isAdmin: (state) => state.user?.role === 'admin',
        balance: (state) => state.user?.balance || 0,
    },

    actions: {
        async register(data) {
            this.loading = true
            this.error = null
            try {
                const response = await authApi.register(data)
                this.setAuth(response.data)
                return response.data
            } catch (error) {
                this.error = error.response?.data?.message || 'Đăng ký thất bại'
                throw error
            } finally {
                this.loading = false
            }
        },

        async login(data) {
            this.loading = true
            this.error = null
            try {
                const response = await authApi.login(data)
                this.setAuth(response.data)
                return response.data
            } catch (error) {
                this.error = error.response?.data?.message || 'Đăng nhập thất bại'
                throw error
            } finally {
                this.loading = false
            }
        },

        async googleLogin(credential) {
            this.loading = true
            this.error = null
            try {
                const response = await authApi.googleLogin(credential)
                this.setAuth(response.data)
                return response.data
            } catch (error) {
                this.error = error.response?.data?.message || 'Đăng nhập Google thất bại'
                throw error
            } finally {
                this.loading = false
            }
        },

        async logout() {
            try {
                await authApi.logout()
            } catch (error) {
                console.error('Logout error:', error)
            } finally {
                this.clearAuth()
            }
        },

        async fetchProfile() {
            try {
                const response = await authApi.profile()
                this.user = response.data.user
                storage.set('user', this.user)
            } catch (error) {
                this.clearAuth()
            }
        },

        setAuth(data) {
            this.user = data.user
            this.token = data.token
            storage.set('user', data.user)
            storage.set('token', data.token)
        },

        clearAuth() {
            this.user = null
            this.token = null
            storage.remove('user')
            storage.remove('token')
        },

        updateBalance(newBalance) {
            if (this.user) {
                this.user.balance = newBalance
                storage.set('user', this.user)
            }
        },
    },
})
