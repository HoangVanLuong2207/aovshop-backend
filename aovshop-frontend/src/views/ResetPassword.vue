<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Đặt lại mật khẩu</h1>
      <p class="auth-subtitle">Nhập mật khẩu mới cho tài khoản của bạn.</p>

      <div v-if="success" class="verify-prompt">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 class="auth-title">Xong!</h2>
        <p class="verify-text">{{ success }}</p>
        <router-link to="/login" class="btn btn-primary">
          Đăng nhập ngay
        </router-link>
      </div>

      <div v-else>
        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <form @submit.prevent="handleReset">
          <input type="hidden" v-model="token" />
          
          <div class="form-group">
            <label class="form-label">Mật khẩu mới</label>
            <input 
              v-model="password" 
              type="password" 
              class="form-input" 
              placeholder="Tối thiểu 6 ký tự"
              required
              minlength="6"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Xác nhận mật khẩu mới</label>
            <input 
              v-model="password_confirmation" 
              type="password" 
              class="form-input" 
              placeholder="Nhập lại mật khẩu mới"
              required
            />
          </div>

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
            {{ loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { authApi } from '../api'

const route = useRoute()
const token = ref('')
const password = ref('')
const password_confirmation = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

onMounted(() => {
  token.value = route.query.token || ''
  if (!token.value) {
    error.value = 'Token không hợp lệ hoặc đã thiếu'
  }
})

const handleReset = async () => {
  if (password.value !== password_confirmation.value) {
    error.value = 'Mật khẩu xác nhận không khớp'
    return
  }

  loading.value = true
  error.value = ''
  success.value = ''
  
  try {
    const response = await authApi.resetPassword({
      token: token.value,
      password: password.value,
    })
    success.value = response.data.message
  } catch (err) {
    error.value = err.response?.data?.message || 'Đặt lại mật khẩu thất bại'
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

.verify-prompt {
  text-align: center;
}

.success-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  background: rgba(34, 197, 94, 0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #22c55e;
}

.success-icon svg {
  width: 40px;
  height: 40px;
}

.verify-text {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 2rem;
}
</style>
