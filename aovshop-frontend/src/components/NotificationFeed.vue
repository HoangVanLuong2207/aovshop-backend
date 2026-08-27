<template>
  <Transition name="slide">
    <div v-if="visible" class="notification-feed" @click="visible = false">
      <div class="notification-icon">🛒</div>
      <div class="notification-content">
        <span class="notification-user">{{ currentNotification.user }}</span>
        <span class="notification-action">vừa mua</span>
        <span class="notification-product">{{ currentNotification.product }}</span>
      </div>
      <div class="notification-time">{{ currentNotification.time }}</div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../api'

const visible = ref(false)
const currentIndex = ref(0)
let interval = null
let showTimeout = null

// Will be populated from API
const notifications = ref([])

const currentNotification = ref({ user: '', product: '', time: '' })

const fetchRecentOrders = async () => {
  try {
    const response = await api.get('/shop/recent-orders')
    if (response.data && response.data.length > 0) {
      notifications.value = response.data
      currentNotification.value = notifications.value[0]
    }
  } catch (error) {
    console.error('Failed to fetch recent orders:', error)
    // Fallback to empty - no notifications will show
  }
}

const showNotification = () => {
  if (notifications.value.length === 0) return
  
  currentNotification.value = notifications.value[currentIndex.value]
  visible.value = true
  
  // Hide after 4 seconds
  showTimeout = setTimeout(() => {
    visible.value = false
  }, 4000)
  
  // Move to next
  currentIndex.value = (currentIndex.value + 1) % notifications.value.length
}

onMounted(async () => {
  await fetchRecentOrders()
  
  if (notifications.value.length > 0) {
    // Show first notification after 3 seconds
    setTimeout(() => {
      showNotification()
      // Then show every 8 seconds
      interval = setInterval(showNotification, 8000)
    }, 3000)
    
    // Refresh data every 2 minutes
    setInterval(fetchRecentOrders, 120000)
  }
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
  if (showTimeout) clearTimeout(showTimeout)
})
</script>

<style scoped>
.notification-feed {
  position: fixed;
  bottom: 100px;
  left: 20px;
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(45, 45, 80, 0.95));
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 320px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.notification-feed:hover {
  border-color: rgba(99, 102, 241, 0.5);
}

.notification-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.notification-content {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
  line-height: 1.4;
}

.notification-user {
  color: #10b981;
  font-weight: 600;
}

.notification-action {
  color: #94a3b8;
}

.notification-product {
  color: #f8fafc;
  font-weight: 500;
}

.notification-time {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Slide animation */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.4s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(-100%);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}

/* Ẩn floating notification, dùng inline section thay thế */
.notification-feed {
  display: none !important;
}
</style>
