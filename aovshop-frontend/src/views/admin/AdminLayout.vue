<template>
  <div class="admin-layout">
    <!-- Mobile Header -->
    <header class="mobile-header">
      <button class="hamburger-btn" @click="toggleSidebar">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <router-link to="/" class="logo">{{ settingsStore.shopName }}</router-link>
      <span class="badge badge-primary">Admin</span>
    </header>

    <!-- Overlay -->
    <div 
      class="sidebar-overlay" 
      :class="{ active: isSidebarOpen }" 
      @click="closeSidebar"
    ></div>

    <aside class="admin-sidebar" :class="{ open: isSidebarOpen }">
      <div class="sidebar-header">
        <router-link to="/" class="logo">{{ settingsStore.shopName }}</router-link>
        <span class="badge badge-primary">Admin</span>
        <button class="close-sidebar-btn" @click="closeSidebar">✕</button>
      </div>
      
      <nav class="sidebar-nav">
        <router-link to="/admin" class="nav-item" exact-active-class="router-link-active" @click="closeSidebar">
          📊 Dashboard
        </router-link>
        <router-link to="/admin/categories" class="nav-item" @click="closeSidebar">
          📁 Danh mục
        </router-link>
        <router-link to="/admin/products" class="nav-item" @click="closeSidebar">
          📦 Sản phẩm
        </router-link>
        <router-link to="/admin/orders" class="nav-item" @click="closeSidebar">
          📋 Đơn hàng
        </router-link>
        <router-link to="/admin/promotions" class="nav-item" @click="closeSidebar">
          🎁 Khuyến mãi
        </router-link>
        <router-link to="/admin/transactions" class="nav-item" @click="closeSidebar">
          💳 Giao dịch
        </router-link>
        <router-link to="/admin/deposits" class="nav-item" @click="closeSidebar">
          💰 Nạp tiền
        </router-link>
        <router-link to="/admin/users" class="nav-item" @click="closeSidebar">
          👥 Người dùng
        </router-link>
        <router-link to="/admin/settings" class="nav-item" @click="closeSidebar">
          ⚙️ Cài đặt
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <button 
          v-if="push.isSupported"
          class="btn btn-secondary btn-sm" 
          style="width: 100%; margin-bottom: 8px;" 
          :class="{ 'btn-success': push.isSubscribed }"
          @click="toggleNotifications"
        >
          {{ push.isSubscribed ? '🔔 Đã bật thông báo' : '🔕 Bật thông báo' }}
        </button>
        <button class="btn btn-secondary btn-sm" style="width: 100%; margin-bottom: 8px;" @click="themeStore.toggle">
          {{ themeStore.isDark ? '☀️ Light Mode' : '🌙 Dark Mode' }}
        </button>
        <router-link to="/" class="btn btn-secondary btn-sm" style="width: 100%">
          ← Về trang shop
        </router-link>
      </div>
    </aside>

    <main class="admin-main">
      <router-view v-slot="{ Component, route }">
        <Transition name="admin-page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useThemeStore } from '../../stores/theme'
import { useSettingsStore } from '../../stores/settings'
import { usePush } from '../../composables/usePush'

const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const push = usePush()
const isSidebarOpen = ref(false)

import { onMounted, onUnmounted } from 'vue'

onMounted(async () => {
  document.body.classList.add('admin-mode')
  await push.registerServiceWorker()
  await push.checkSubscription()
})

onUnmounted(() => {
  document.body.classList.remove('admin-mode')
})

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const closeSidebar = () => {
  isSidebarOpen.value = false
}

const toggleNotifications = async () => {
  if (push.isSubscribed.value) {
    await push.unsubscribe()
  } else {
    const success = await push.subscribe(true)
    if (success) {
      alert('Đã bật thông báo thành công!')
    } else {
      if (!push.isSupported.value) {
        alert('Trình duyệt của bạn không hỗ trợ thông báo (hoặc bạn đang không sử dụng HTTPS/Localhost).')
      } else {
        alert('Không thể bật thông báo. Vui lòng kiểm tra quyền trình duyệt hoặc cấu hình server.')
      }
    }
  }
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  overflow-y: auto;
  z-index: 100;
}

:global(body.admin-mode) {
  padding-top: 0 !important;
}

.sidebar-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo {
  font-size: 1.25rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.sidebar-nav {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-item {
  display: block;
  padding: 0.875rem 1rem;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.nav-item:hover {
  background: var(--bg-tertiary);
  color: var(--text);
}

.nav-item.router-link-active {
  background: var(--primary);
  color: white;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid var(--border);
}

.admin-main {
  flex: 1;
  margin-left: 260px;
  padding: 2rem;
  min-height: 100vh;
}

/* Mobile Header */
.mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 0 1rem;
  align-items: center;
  gap: 1rem;
  z-index: 1000;
}

/* Hamburger Button */
.hamburger-btn {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  gap: 5px;
  padding: 8px;
}

.hamburger-btn span {
  display: block;
  width: 24px;
  height: 3px;
  background: var(--text);
  border-radius: 2px;
  transition: all 0.3s;
}

/* Close Sidebar Button */
.close-sidebar-btn {
  display: none;
  margin-left: auto;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 50%;
  font-size: 1rem;
  color: var(--text);
  cursor: pointer;
  width: 32px;
  height: 32px;
  line-height: 1;
  transition: all 0.2s;
}

.close-sidebar-btn:hover {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

/* Overlay */
.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
  opacity: 0;
  transition: opacity 0.3s;
}

.sidebar-overlay.active {
  opacity: 1;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .mobile-header {
    display: flex;
  }

  .admin-sidebar {
    position: fixed;
    left: -100%;
    top: 0;
    width: 280px;
    max-width: 85vw;
    z-index: 1001;
    transition: left 0.3s ease;
  }

  .admin-sidebar.open {
    left: 0;
  }

  .admin-sidebar .sidebar-header {
    padding-top: 1rem;
  }

  .close-sidebar-btn {
    display: block;
  }

  .sidebar-overlay {
    display: block;
    pointer-events: none;
    backdrop-filter: blur(2px);
    z-index: 1000;
  }

  .sidebar-overlay.active {
    pointer-events: auto;
  }

  .admin-main {
    margin-left: 0;
    padding: 1rem;
    padding-top: 80px;
    min-width: 0;
    width: 100%;
    overflow-x: hidden;
  }
}

/* Admin Page Transitions - Only for content, not sidebar */
.admin-page-enter-active,
.admin-page-leave-active {
  transition: opacity 0.2s ease;
}

.admin-page-enter-from,
.admin-page-leave-to {
  opacity: 0;
}
</style>
