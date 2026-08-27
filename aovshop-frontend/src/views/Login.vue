<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Đăng nhập</h1>
      <p class="auth-subtitle">Chào mừng bạn quay lại!</p>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input 
            v-model="form.email" 
            type="email" 
            class="form-input" 
            placeholder="your@email.com"
            required
          />
        </div>

        <div class="form-group">
          <div class="label-row">
            <label class="form-label">Mật khẩu</label>
            <router-link to="/forgot-password" class="forgot-link">Quên mật khẩu?</router-link>
          </div>
          <input 
            v-model="form.password" 
            type="password" 
            class="form-input" 
            placeholder="••••••••"
            required
          />
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
          {{ loading ? 'Đang xử lý...' : 'Đăng nhập' }}
        </button>
      </form>

      <div class="auth-divider"><span>hoặc</span></div>
      <GoogleSignInButton @credential="handleGoogleLogin" @error="error = $event" />

      <p class="auth-footer">
        Chưa có tài khoản? 
        <router-link to="/register">Đăng ký ngay</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import GoogleSignInButton from '../components/GoogleSignInButton.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(false)
const error = ref('')
const form = reactive({
  email: '',
  password: '',
})

const handleLogin = async () => {
  loading.value = true
  error.value = ''
  
  try {
    await authStore.login(form)
    const redirect = route.query.redirect || (authStore.isAdmin ? '/admin' : '/')
    router.push(redirect)
  } catch (err) {
    error.value = err.response?.data?.message || 'Đăng nhập thất bại'
  } finally {
    loading.value = false
  }
}

const handleGoogleLogin = async (credential) => {
  loading.value = true
  error.value = ''
  try {
    await authStore.googleLogin(credential)
    const redirect = route.query.redirect || (authStore.isAdmin ? '/admin' : '/')
    router.push(redirect)
  } catch (err) {
    error.value = err.response?.data?.message || 'Đăng nhập Google thất bại'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.auth-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  width: 100%;
  max-width: 420px;
}

.auth-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  text-align: center;
}

.auth-subtitle {
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 2rem;
}

.auth-footer {
  text-align: center;
  margin-top: 1.5rem;
  color: var(--text-secondary);
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.label-row .form-label {
  margin-bottom: 0;
}

.forgot-link {
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: none;
}

.forgot-link:hover {
  text-decoration: underline;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;
  color: var(--text-secondary);
  font-size: .85rem;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border);
}
</style>
