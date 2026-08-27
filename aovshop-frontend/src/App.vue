<template>
  <div id="app">
    <!-- Announcement Popup Modal -->
    <div v-if="showNotification && notification.enabled" class="popup-overlay" @click.self="closeNotification">
      <div class="popup-modal">
        <div class="popup-header">
          <h3 class="popup-title">THÔNG BÁO</h3>
          <button class="popup-close" @click="closeNotification">✕</button>
        </div>
        <div class="popup-content" v-html="notification.text">
        </div>
        <div class="popup-footer" style="display: flex; justify-content: space-around;">
          <button class="btn btn-secondary" @click="closeNotification">Đã hiểu</button>
          <button class="btn btn-primary" @click="dismissFor3Hours">Đóng trong 3 giờ</button>
        </div>
      </div>
    </div>

    <Navbar v-if="!isAdminRoute" />
    <router-view v-slot="{ Component, route: viewRoute }">
      <Transition :name="isAdminRoute ? '' : 'page'" mode="out-in">
        <component :is="Component" :key="isAdminRoute ? 'admin' : viewRoute.path" />
      </Transition>
    </router-view>
    <ToastContainer />
    
    <template v-if="!isAdminRoute">
      <Footer />
      <BackToTop />
      <FloatingChat />
      <NotificationFeed />
      <FullscreenButton />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import ToastContainer from './components/ToastContainer.vue'
import BackToTop from './components/BackToTop.vue'
import FloatingChat from './components/FloatingChat.vue'
import NotificationFeed from './components/NotificationFeed.vue'
import FullscreenButton from './components/FullscreenButton.vue'
import Footer from './components/Footer.vue'
import { useAuthStore } from './stores/auth'
import { useSettingsStore } from './stores/settings'
import api from './api'
import { storage } from './utils/storage'

const route = useRoute()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

const notification = ref({ enabled: false, text: '' })
const showNotification = ref(true)

const DISMISS_DURATION = 3 * 60 * 60 * 1000 // 3 hours in ms

const checkDismissed = () => {
  const dismissedAt = storage.get('notification_dismissed_at')
  if (dismissedAt) {
    const elapsed = Date.now() - parseInt(dismissedAt)
    if (elapsed < DISMISS_DURATION) {
      showNotification.value = false
    } else {
      storage.remove('notification_dismissed_at')
    }
  }
}

// Just close popup (will show again on next visit/refresh)
const closeNotification = () => {
  showNotification.value = false
}

// Close and don't show for 3 hours
const dismissFor3Hours = () => {
  showNotification.value = false
  storage.set('notification_dismissed_at', Date.now().toString())
}

const fetchNotification = async () => {
  try {
    const response = await api.get('/shop/notification')
    notification.value = response.data
  } catch (error) {
    console.error('Failed to fetch notification:', error)
  }
}

onMounted(() => {
  checkDismissed()
  fetchNotification()
  settingsStore.fetchShopInfo()
  
  if (authStore.isAuthenticated) {
    authStore.fetchProfile()
  }
})
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* Popup Overlay */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Popup Modal */
.popup-modal {
  background: var(--bg-secondary, #ffffff);
  border: 1px solid var(--border, #dee2e6);
  border-radius: 12px;
  width: 100%;
  max-width: 450px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--primary);
  border-bottom: 1px solid var(--primary-dark);
}

.popup-title {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: 0.5px;
}

.popup-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.popup-content {
  padding: 1.5rem;
  color: var(--text, #212529);
  font-size: 1rem;
  line-height: 1.7;
}

.popup-content p {
  margin: 0;
  white-space: pre-wrap;
}

.popup-footer {
  padding: 1rem 1.5rem 1.5rem;
  display: flex;
  justify-content: center;
}

.popup-footer .btn {
  padding: 0.875rem 2.5rem;
  font-size: 1rem;
}

/* Page Transition Animations */
.page-enter-active,
.page-leave-active {
  transition: all 0.25s ease-out;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>

