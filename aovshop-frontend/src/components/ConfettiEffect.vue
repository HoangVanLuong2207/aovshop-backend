<template>
  <Teleport to="body">
    <Transition name="confetti">
      <div v-if="isActive" class="confetti-container">
        <div 
          v-for="n in particleCount" 
          :key="n" 
          class="confetti-particle"
          :style="getParticleStyle(n)"
        ></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  duration: {
    type: Number,
    default: 3000
  },
  particleCount: {
    type: Number,
    default: 50
  }
})

const emit = defineEmits(['complete'])
const isActive = ref(false)

const colors = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', 
  '#74c0fc', '#b197fc', '#f783ac', '#6366f1'
]

const getParticleStyle = (n) => {
  const randomColor = colors[Math.floor(Math.random() * colors.length)]
  const randomX = Math.random() * 100
  const randomDelay = Math.random() * 0.5
  const randomDuration = 2 + Math.random() * 2
  const randomSize = 8 + Math.random() * 8
  const randomRotation = Math.random() * 360

  return {
    '--particle-color': randomColor,
    '--particle-x': `${randomX}vw`,
    '--particle-delay': `${randomDelay}s`,
    '--particle-duration': `${randomDuration}s`,
    '--particle-size': `${randomSize}px`,
    '--particle-rotation': `${randomRotation}deg`,
  }
}

watch(() => props.active, (newVal) => {
  if (newVal) {
    isActive.value = true
    setTimeout(() => {
      isActive.value = false
      emit('complete')
    }, props.duration)
  }
})
</script>

<style scoped>
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 10000;
  overflow: hidden;
}

.confetti-particle {
  position: absolute;
  top: -20px;
  left: var(--particle-x);
  width: var(--particle-size);
  height: var(--particle-size);
  background: var(--particle-color);
  border-radius: 2px;
  animation: confetti-fall var(--particle-duration) ease-out var(--particle-delay) forwards;
  transform: rotate(var(--particle-rotation));
}

.confetti-particle:nth-child(odd) {
  border-radius: 50%;
}

.confetti-particle:nth-child(3n) {
  width: calc(var(--particle-size) * 0.6);
  height: calc(var(--particle-size) * 1.5);
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg) scale(0.5);
    opacity: 0;
  }
}

/* Transition */
.confetti-enter-active,
.confetti-leave-active {
  transition: opacity 0.3s ease;
}

.confetti-enter-from,
.confetti-leave-to {
  opacity: 0;
}
</style>
