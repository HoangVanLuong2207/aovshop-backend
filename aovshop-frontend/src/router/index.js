import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Shop views
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import ForgotPassword from '../views/ForgotPassword.vue'
import ResetPassword from '../views/ResetPassword.vue'
import VerifyEmail from '../views/VerifyEmail.vue'
import Products from '../views/Products.vue'
import ProductDetail from '../views/ProductDetail.vue'
import Categories from '../views/Categories.vue'
import Cart from '../views/Cart.vue'
import Checkout from '../views/Checkout.vue'
import Orders from '../views/Orders.vue'
import Deposit from '../views/Deposit.vue'
import Profile from '../views/Profile.vue'

// Admin views
import AdminLayout from '../views/admin/AdminLayout.vue'
import AdminDashboard from '../views/admin/Dashboard.vue'
import AdminCategories from '../views/admin/Categories.vue'
import AdminProducts from '../views/admin/Products.vue'
import AdminOrders from '../views/admin/Orders.vue'
import AdminPromotions from '../views/admin/Promotions.vue'
import AdminTransactions from '../views/admin/Transactions.vue'
import AdminDeposits from '../views/admin/Deposits.vue'
import AdminSettings from '../views/admin/Settings.vue'

const routes = [
    // Public routes
    { path: '/', name: 'home', component: Home },
    { path: '/login', name: 'login', component: Login, meta: { guest: true } },
    { path: '/register', name: 'register', component: Register, meta: { guest: true } },
    { path: '/forgot-password', name: 'forgot-password', component: ForgotPassword, meta: { guest: true } },
    { path: '/reset-password', name: 'reset-password', component: ResetPassword, meta: { guest: true } },
    { path: '/verify-email/:token', name: 'verify-email', component: VerifyEmail },
    { path: '/categories', name: 'categories', component: Categories },
    { path: '/products', name: 'products', component: Products },
    { path: '/products/:id', name: 'product-detail', component: ProductDetail },

    // Protected user routes
    {
        path: '/cart',
        name: 'cart',
        component: Cart,
        meta: { requiresAuth: true },
    },
    {
        path: '/checkout',
        name: 'checkout',
        component: Checkout,
        meta: { requiresAuth: true },
    },
    {
        path: '/orders',
        name: 'orders',
        component: Orders,
        meta: { requiresAuth: true },
    },
    {
        path: '/deposit',
        name: 'deposit',
        component: Deposit,
        meta: { requiresAuth: true },
    },
    {
        path: '/profile',
        name: 'profile',
        component: Profile,
        meta: { requiresAuth: true },
    },

    // Admin routes
    {
        path: '/admin',
        component: AdminLayout,
        meta: { requiresAuth: true, requiresAdmin: true },
        children: [
            { path: '', name: 'admin-dashboard', component: AdminDashboard },
            { path: 'categories', name: 'admin-categories', component: AdminCategories },
            { path: 'products', name: 'admin-products', component: AdminProducts },
            { path: 'orders', name: 'admin-orders', component: AdminOrders },
            { path: 'promotions', name: 'admin-promotions', component: AdminPromotions },
            { path: 'transactions', name: 'admin-transactions', component: AdminTransactions },
            { path: 'deposits', name: 'admin-deposits', component: AdminDeposits },
            { path: 'users', name: 'admin-users', component: () => import('../views/admin/Users.vue') },
            { path: 'settings', name: 'admin-settings', component: AdminSettings },
        ],
    },

    // 404
    { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior(to, from, savedPosition) {
        // Nếu có vị trí đã lưu (khi bấm Back/Forward), quay lại vị trí đó
        if (savedPosition) {
            return savedPosition
        } else {
            // Còn không thì luôn cuộn lên đầu trang
            return { top: 0, behavior: 'smooth' }
        }
    }
})

// Navigation guards
router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next({ name: 'login', query: { redirect: to.fullPath } })
    } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
        next({ name: 'home' })
    } else if (to.meta.guest && authStore.isAuthenticated) {
        next({ name: 'home' })
    } else {
        next()
    }
})

export default router
