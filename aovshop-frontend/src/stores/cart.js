import { defineStore } from 'pinia'
import { storage } from '../utils/storage'

export const useCartStore = defineStore('cart', {
    state: () => ({
        items: storage.get('cart', []),
    }),

    getters: {
        itemCount: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),

        subtotal: (state) => state.items.reduce((sum, item) => {
            const price = item.sale_price || item.price
            return sum + (price * item.quantity)
        }, 0),

        isEmpty: (state) => state.items.length === 0,
    },

    actions: {
        addItem(product, quantity = 1) {
            const existingItem = this.items.find(item => item.id === product.id)
            const isPreorder = product.is_preorder || false
            const checkpassHours = Number(product.checkpass_hours ?? product.checkpassHours ?? 0)
            const isCheckpass = checkpassHours > 0
            const isUnlimited = isPreorder || isCheckpass
            const availableStock = product.stock || 0
            const minimumQuantity = Math.max(1, Number(product.minimum_order_quantity) || 1)

            if (existingItem) {
                const newQuantity = existingItem.quantity + quantity
                // Pre-order: no stock limit; instant: limit by available stock
                const safeStock = availableStock > 0 ? availableStock : (existingItem.stock || existingItem.quantity || 1)
                existingItem.quantity = isUnlimited
                    ? Math.max(minimumQuantity, newQuantity)
                    : Math.min(Math.max(minimumQuantity, newQuantity), safeStock)
                if (!isUnlimited) {
                    existingItem.stock = safeStock
                }
                existingItem.is_preorder = isPreorder
                existingItem.is_checkpass = isCheckpass
                existingItem.checkpass_hours = checkpassHours
                existingItem.daily_buy_limit = product.daily_buy_limit || null
                existingItem.minimum_order_quantity = product.minimum_order_quantity || null
            } else {
                const safeInitialQuantity = isUnlimited
                    ? Math.max(minimumQuantity, quantity)
                    : Math.min(Math.max(minimumQuantity, quantity), availableStock || 1)
                this.items.push({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    sale_price: product.sale_price,
                    image: product.image,
                    quantity: safeInitialQuantity,
                    stock: isUnlimited ? 0 : (availableStock || 1),
                    is_preorder: isPreorder,
                    is_checkpass: isCheckpass,
                    checkpass_hours: checkpassHours,
                    preorder_placeholder: product.preorder_placeholder,
                    daily_buy_limit: product.daily_buy_limit || null,
                    minimum_order_quantity: product.minimum_order_quantity || null,
                })
            }

            this.saveToStorage()
        },

        updateQuantity(productId, quantity, stock) {
            const item = this.items.find(item => item.id === productId)
            if (item) {
                const minimumQuantity = Math.max(1, Number(item.minimum_order_quantity) || 1)
                if (item.is_preorder || item.is_checkpass) {
                    item.quantity = Math.max(minimumQuantity, quantity)
                    this.saveToStorage()
                    return
                }
                const requestedStock = stock !== undefined ? Number(stock) : Number(item.stock)
                const safeStock = Number.isFinite(requestedStock) && requestedStock > 0
                    ? requestedStock
                    : Math.max(1, Number(item.quantity) || 1)
                item.quantity = Math.min(Math.max(minimumQuantity, quantity), safeStock)
                item.stock = safeStock
                this.saveToStorage()
            }
        },

        removeItem(productId) {
            this.items = this.items.filter(item => item.id !== productId)
            this.saveToStorage()
        },

        clearCart() {
            this.items = []
            this.saveToStorage()
        },

        saveToStorage() {
            storage.set('cart', this.items)
        },

        getCheckoutItems() {
            return this.items.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
            }))
        },
    },
})
