<template>
  <button 
    v-if="isMobile"
    class="fullscreen-btn" 
    @click="toggleFullscreen"
    :class="{ 'is-full': isFullscreen }"
    :style="{ bottom: dynamicBottom + 'px' }"
  >
    <div class="icon-wrapper">
      <svg v-if="!isFullscreen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
      </svg>
      <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
      </svg>
    </div>
    <span class="btn-text">{{ isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình' }}</span>
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isFullscreen = ref(false)
const isMobile = ref(false)
const scrollY = ref(0)

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

const handleScroll = () => {
  scrollY.value = window.scrollY
}

// Giữ nguyên vị trí trong cụm nút bất kể trạng thái fullscreen
const dynamicBottom = computed(() => {
  return scrollY.value > 300 ? 128 : 77
})

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error: ${err.message}`);
    });
    isFullscreen.value = true
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
      isFullscreen.value = false
    }
  }
}

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('scroll', handleScroll)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('scroll', handleScroll)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<style scoped>
.fullscreen-btn {
  position: fixed;
  right: 15px;
  background: var(--primary);
  backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 30px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15), 0 0 10px rgba(229, 57, 53, 0.2);
  z-index: 1005;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
}

/* Đồng nhất phong cách, không làm mờ khi ở chế độ full */
.fullscreen-btn.is-full {
  background: var(--primary);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-text {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.fullscreen-btn:active {
  transform: scale(0.9);
}
</style>
