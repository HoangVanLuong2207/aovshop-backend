<template>
  <div class="profile-page">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">👤 Tài khoản</h1>
      </div>

      <div class="profile-content">
        <div class="card">
          <div class="card-header">Thông tin cá nhân</div>
          <div class="card-body">
            <form @submit.prevent="updateProfile">
              <div class="form-group">
                <label class="form-label">Họ tên</label>
                <input v-model="profile.name" type="text" class="form-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <div class="email-status-wrapper">
                  <input 
                    v-model="profile.email" 
                    type="email" 
                    class="form-input" 
                    :disabled="authStore.user?.emailVerified" 
                    :style="authStore.user?.emailVerified ? 'opacity: 0.7; cursor: not-allowed; flex: 1;' : 'flex: 1;'" 
                  />
                  <div v-if="authStore.user?.emailVerified" class="status-badge status-verified">
                    ✓ Đã xác thực
                  </div>
                  <div v-else class="status-badge status-unverified">
                    ⚠ Chưa xác thực
                  </div>
                </div>
                <div v-if="!authStore.user?.emailVerified" class="verification-notice">
                  <p>Xác thực email để bảo mật tài khoản và khôi phục mật khẩu.</p>
                  <button type="button" @click="resendVerification" class="btn-text" :disabled="resending">
                    {{ resending ? 'Đang gửi...' : '🚀 Gửi lại link xác thực' }}
                  </button>
                </div>
                <small style="color: var(--text-muted);">
                  {{ authStore.user?.emailVerified ? 'Email không thể thay đổi' : 'Có thể thay đổi cho đến khi xác thực' }}
                </small>
              </div>
              <button type="submit" class="btn btn-primary" :disabled="updating">
                {{ updating ? 'Đang lưu...' : 'Cập nhật' }}
              </button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Đổi mật khẩu</div>
          <div class="card-body">
            <form @submit.prevent="changePassword">
              <div class="form-group">
                <label class="form-label">Mật khẩu hiện tại</label>
                <input v-model="password.current_password" type="password" class="form-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Mật khẩu mới</label>
                <input v-model="password.password" type="password" class="form-input" required minlength="6" />
              </div>
              <div class="form-group">
                <label class="form-label">Xác nhận mật khẩu</label>
                <input v-model="password.password_confirmation" type="password" class="form-input" required />
              </div>
              <button type="submit" class="btn btn-primary" :disabled="changingPassword">
                {{ changingPassword ? 'Đang xử lý...' : 'Đổi mật khẩu' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api, { authApi } from '../api'
import { useToast } from '../composables/useToast'
import { storage } from '../utils/storage'

const { toast } = useToast()

const authStore = useAuthStore()

const profile = reactive({
  name: '',
  email: '',
})

const password = reactive({
  current_password: '',
  password: '',
  password_confirmation: '',
})

const updating = ref(false)
const changingPassword = ref(false)
const resending = ref(false)

onMounted(async () => {
  // Fetch fresh profile from backend to get latest verification status
  try {
    const response = await authApi.profile()
    authStore.user = response.data.user
    storage.set('user', response.data.user)
  } catch (err) {
    console.error('Failed to fetch profile:', err)
  }

  if (authStore.user) {
    profile.name = authStore.user.name
    profile.email = authStore.user.email
  }
})

const updateProfile = async () => {
  updating.value = true
  try {
    const response = await authApi.updateProfile(profile)
    authStore.user = response.data.user
    storage.set('user', response.data.user)
    toast.success('Cập nhật thành công!')
  } catch (error) {
    toast.error(error.response?.data?.message || 'Cập nhật thất bại')
  } finally {
    updating.value = false
  }
}

const changePassword = async () => {
  if (password.password !== password.password_confirmation) {
    toast.error('Mật khẩu xác nhận không khớp')
    return
  }

  changingPassword.value = true
  try {
    await authApi.changePassword(password)
    password.current_password = ''
    password.password = ''
    password.password_confirmation = ''
    toast.success('Đổi mật khẩu thành công!')
  } catch (error) {
    toast.error(error.response?.data?.message || 'Đổi mật khẩu thất bại')
  } finally {
    changingPassword.value = false
  }
}

const resendVerification = async () => {
  resending.value = true
  try {
    await api.post('/auth/resend-verification', { email: profile.email })
    toast.success('Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư!')
  } catch (error) {
    toast.error(error.response?.data?.message || 'Không thể gửi email')
  } finally {
    resending.value = false
  }
}
</script>

<style scoped>
.profile-page {
  padding: 2rem 0;
}

.profile-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  align-items: start;
}

@media (max-width: 768px) {
  .profile-content {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

.email-status-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-verified {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.status-unverified {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
  border: 1px solid rgba(234, 179, 8, 0.2);
}

.verification-notice {
  background: var(--bg-tertiary);
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.verification-notice p {
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.btn-text {
  background: none;
  border: none;
  color: var(--primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  transition: opacity 0.2s;
}

.btn-text:hover {
  opacity: 0.8;
}

.btn-text:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: none;
}
</style>
