<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Đăng ký</h1>
      <p class="auth-subtitle">Tạo tài khoản mới</p>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <form @submit.prevent="handleRegister">
        <div class="form-group">
          <label class="form-label">Họ tên</label>
          <input 
            v-model="form.name" 
            type="text" 
            class="form-input" 
            placeholder="Nguyễn Văn A"
            required
          />
        </div>

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
          <label class="form-label">Mật khẩu</label>
          <input 
            v-model="form.password" 
            type="password" 
            class="form-input" 
            placeholder="Tối thiểu 6 ký tự"
            required
            minlength="6"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Xác nhận mật khẩu</label>
          <input 
            v-model="form.password_confirmation" 
            type="password" 
            class="form-input" 
            placeholder="Nhập lại mật khẩu"
            required
          />
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
          {{ loading ? 'Đang xử lý...' : 'Đăng ký' }}
        </button>
      </form>

      <div class="auth-divider"><span>hoặc</span></div>
      <GoogleSignInButton @credential="handleGoogleLogin" @error="error = $event" />

      <p class="auth-footer">
        Đã có tài khoản? 
        <router-link to="/login">Đăng nhập</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import { useToast } from '../composables/useToast'
import GoogleSignInButton from '../components/GoogleSignInButton.vue'

const router = useRouter()
const authStore = useAuthStore()
const { toast } = useToast()

const loading = ref(false)
const error = ref('')
const resending = ref(false)

const form = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
})

const handleRegister = async () => {
  if (form.password !== form.password_confirmation) {
    error.value = 'Mật khẩu xác nhận không khớp'
    return
  }

  loading.value = true
  error.value = ''
  
  try {
    await authStore.register({
      name: form.name,
      email: form.email,
      password: form.password,
    })
    
    toast.success('Đăng ký thành công!')
    router.push(authStore.isAdmin ? '/admin' : '/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Đăng ký thất bại'
  } finally {
    loading.value = false
  }
}

const handleGoogleLogin = async (credential) => {
  loading.value = true
  error.value = ''
  try {
    await authStore.googleLogin(credential)
    toast.success('Đăng nhập Google thành công!')
    router.push(authStore.isAdmin ? '/admin' : '/')
  } catch (err) {
    error.value = err.response?.data?.message || 'Đăng nhập Google thất bại'
  } finally {
    loading.value = false
  }
}

const resendEmail = async () => {
  resending.value = true
  try {
    await api.post('/auth/resend-verification', { email: form.email })
    toast.success('Đã gửi lại email xác thực!')
  } catch (err) {
    toast.error(err.response?.data?.message || 'Không thể gửi email')
  } finally {
    resending.value = false
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

/* Verification Prompt Styles */
.verify-prompt {
  text-align: center;
}

.success-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  background: rgba(99, 102, 241, 0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
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

.verify-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.verify-actions .btn {
  width: 100%;
}
</style>
