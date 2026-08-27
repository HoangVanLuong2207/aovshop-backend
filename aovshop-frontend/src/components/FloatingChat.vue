<template>
  <div class="floating-chat">
    <Transition name="chat-options">
      <div v-if="isExpanded" class="chat-options">
        <a 
          v-for="option in chatOptions" 
          :key="option.name"
          :href="option.url" 
          target="_blank"
          class="chat-option"
          :style="{ '--option-color': option.color }"
          @click="trackClick(option.name)"
        >
          <span class="chat-option-icon">
            <img v-if="option.icon.startsWith('http')" :src="option.icon" :alt="option.name" class="option-icon-img" />
            <svg v-else-if="option.icon === 'phone'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </span>
          <span class="chat-option-label">{{ option.name }}</span>
        </a>
      </div>
    </Transition>
    
    <button 
      class="chat-toggle"
      :class="{ 'is-expanded': isExpanded }"
      @click="toggleExpand"
    >
      <span class="chat-icon">💬</span>
      <span class="chat-close">✕</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()

const isExpanded = ref(false)

// Read from settings store, with fallbacks
const chatOptions = computed(() => {
  const options = []
  
  if (settingsStore.contactZalo) {
    options.push({ 
      name: 'Zalo', 
      icon: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Icon_of_Zalo.svg', 
      url: settingsStore.contactZalo, 
      color: '#0068ff' 
    })
  }
  
  if (settingsStore.contactMessenger) {
    options.push({ 
      name: 'Facebook', 
      icon: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg', 
      url: settingsStore.contactMessenger, 
      color: '#1877f2' 
    })
  }
  
  if (settingsStore.contactHotline) {
    options.push({ 
      name: 'Hotline', 
      icon: 'phone', 
      url: `tel:${settingsStore.contactHotline}`, 
      color: '#22c55e' 
    })
  }
  
  return options
})

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

const trackClick = (name) => {
  console.log('Chat clicked:', name)
  isExpanded.value = false
}

onMounted(() => {
  // Force refresh to ensure contact settings are loaded
  settingsStore.refreshShopInfo()
})
</script>

<style scoped>
.floating-chat {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.chat-toggle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--primary);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(229, 57, 53, 0.3);
  transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  position: relative;
}

.chat-toggle:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(229, 57, 53, 0.4);
}

.chat-icon,
.chat-close {
  position: absolute;
  font-size: 24px;
  transition: all 0.3s ease;
}

.chat-icon {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.chat-close {
  opacity: 0;
  transform: scale(0.5) rotate(-90deg);
  color: white;
  font-size: 20px;
}

.chat-toggle.is-expanded .chat-icon {
  opacity: 0;
  transform: scale(0.5) rotate(90deg);
}

.chat-toggle.is-expanded .chat-close {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.chat-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.chat-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 50px;
  color: var(--text);
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.chat-option:hover {
  transform: translateX(-10px);
  border-color: var(--option-color);
  box-shadow: 0 4px 15px rgba(229, 57, 53, 0.2);
}

.chat-option-icon {
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.option-icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.chat-option-label {
  font-weight: 600;
  font-size: 14px;
}

/* Transition */
.chat-options-enter-active,
.chat-options-leave-active {
  transition: all 0.3s ease;
}

.chat-options-enter-from,
.chat-options-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.chat-options-enter-active .chat-option {
  animation: popIn 0.3s ease-out forwards;
}

.chat-options-enter-active .chat-option:nth-child(1) { animation-delay: 0ms; }
.chat-options-enter-active .chat-option:nth-child(2) { animation-delay: 50ms; }
.chat-options-enter-active .chat-option:nth-child(3) { animation-delay: 100ms; }

@keyframes popIn {
  0% {
    opacity: 0;
    transform: translateX(20px) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@media (max-width: 768px) {
  .floating-chat {
    bottom: 16px;
    right: 16px;
  }
  
  .chat-toggle {
    width: 55px;
    height: 55px;
  }
}
</style>
