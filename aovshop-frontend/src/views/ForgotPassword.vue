<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Quên mật khẩu?</h1>
      <p class="auth-subtitle">Nhập email của bạn để nhận link đặt lại mật khẩu.</p>

      <div v-if="success" class="alert alert-success">
        {{ success }}
      </div>
      
      <div v-else>
        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <form @submit.prevent="handleForgot">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input 
              v-model="email" 
              type="email" 
              class="form-input" 
              placeholder="your@email.com"
              required
            />
          </div>

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
            {{ loading ? 'Đang xử lý...' : 'Gửi link đặt lại mật khẩu' }}
          </button>
        </form>
      </div>

      <p class="auth-footer">
        <router-link to="/login">Quay lại đăng nhập</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { authApi } from '../api'

const email = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

const handleForgot = async () => {
  loading.value = true
  error.value = ''
  success.value = ''
  
  try {
    const response = await authApi.forgotPassword(email.value)
    success.value = response.data.message
  } catch (err) {
    error.value = err.response?.data?.message || 'Gửi yêu cầu thất bại'
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
</style>
