<template>
  <div class="verify-page">
    <div class="verify-card">
      <!-- Loading State -->
      <div v-if="loading" class="verify-loading">
        <div class="spinner"></div>
        <p>Đang xác thực email...</p>
      </div>

      <!-- Success State -->
      <div v-else-if="success" class="verify-result success">
        <div class="icon-wrapper success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h1>Xác thực thành công!</h1>
        <p>Email của bạn đã được xác thực. Bạn có thể đăng nhập ngay bây giờ.</p>
        <router-link to="/login" class="btn btn-primary btn-lg">
          Đăng nhập
        </router-link>
      </div>

      <!-- Error State -->
      <div v-else class="verify-result error">
        <div class="icon-wrapper error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h1>Xác thực thất bại</h1>
        <p>{{ errorMessage }}</p>
        <div class="verify-actions">
          <button @click="resendVerification" class="btn btn-secondary" :disabled="resending">
            {{ resending ? 'Đang gửi...' : 'Gửi lại email xác thực' }}
          </button>
          <router-link to="/login" class="btn btn-primary">
            Về trang đăng nhập
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const route = useRoute()

const loading = ref(true)
const success = ref(false)
const errorMessage = ref('')
const resending = ref(false)
const userEmail = ref('')

onMounted(async () => {
  const token = route.params.token
  
  if (!token) {
    loading.value = false
    errorMessage.value = 'Link xác thực không hợp lệ.'
    return
  }

  try {
    const response = await api.get(`/auth/verify-email/${token}`)
    success.value = true
  } catch (error) {
    errorMessage.value = error.response?.data?.message || 'Đã xảy ra lỗi khi xác thực email.'
  } finally {
    loading.value = false
  }
})

const resendVerification = async () => {
  const email = prompt('Nhập email của bạn:')
  if (!email) return

  resending.value = true
  try {
    await api.post('/auth/resend-verification', { email })
    toast.success('Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.')
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không thể gửi email.')
  } finally {
    resending.value = false
  }
}
</script>

<style scoped>
.verify-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
}

.verify-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 3rem;
  width: 100%;
  max-width: 480px;
  text-align: center;
}

.verify-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.verify-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.icon-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-wrapper svg {
  width: 40px;
  height: 40px;
}

.success-icon {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.error-icon {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.verify-result h1 {
  font-size: 1.75rem;
  margin: 0;
}

.verify-result p {
  color: var(--text-secondary);
  margin: 0;
}

.verify-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  margin-top: 1rem;
}

.verify-actions .btn {
  width: 100%;
}
</style>
