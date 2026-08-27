import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import './assets/animations.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize theme
import { useThemeStore } from './stores/theme'
const themeStore = useThemeStore()
themeStore.init()

app.mount('#app')

// Traffic Analytics: Ping backend to record visit
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
fetch(`${API_URL}/health`, { credentials: 'include' }).catch(() => {});

