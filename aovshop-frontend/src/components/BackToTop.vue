<template>
  <Transition name="back-to-top">
    <button 
      v-if="isVisible" 
      class="back-to-top-btn"
      @click="scrollToTop"
      title="Về đầu trang"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </button>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isVisible = ref(false)
const scrollThreshold = 300

const handleScroll = () => {
  isVisible.value = window.scrollY > scrollThreshold
}

const scrollToTop = () => {
  const startPosition = window.scrollY
  const duration = 800
  let startTime = null

  const animation = (currentTime) => {
    if (startTime === null) startTime = currentTime
    const timeElapsed = currentTime - startTime
    const progress = Math.min(timeElapsed / duration, 1)
    
    // Easing function for smooth deceleration
    const easeOutCubic = 1 - Math.pow(1 - progress, 3)
    
    window.scrollTo(0, startPosition * (1 - easeOutCubic))
    
    if (timeElapsed < duration) {
      requestAnimationFrame(animation)
    }
  }
  
  requestAnimationFrame(animation)
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
  handleScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
.back-to-top-btn {
  position: fixed;
  bottom: 100px;
  right: 24px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--primary);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  box-shadow: 0 4px 15px rgba(229, 57, 53, 0.3);
  transition: all 0.3s ease;
}

.back-to-top-btn:hover {
  transform: translateY(-5px) scale(1.1);
  box-shadow: 0 6px 20px rgba(229, 57, 53, 0.4);
}

.back-to-top-btn:active {
  transform: translateY(-2px) scale(1.05);
}

.back-to-top-btn svg {
  width: 24px;
  height: 24px;
}

/* Transition */
.back-to-top-enter-active,
.back-to-top-leave-active {
  transition: all 0.3s ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}

@media (max-width: 768px) {
  .back-to-top-btn {
    bottom: 77px;
    right: 16px;
    width: 45px;
    height: 45px;
  }
}
</style>
