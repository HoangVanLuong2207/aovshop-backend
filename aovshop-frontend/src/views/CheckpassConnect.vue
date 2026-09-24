<template>
  <main class="connect-page">
    <section class="connect-card">
      <div class="connect-icon">🛡️</div>
      <h1>Kết nối Checkpass</h1>
      <p v-if="loading">Đang xác thực tài khoản SP1S và chuyển bạn về Checkpass...</p>
      <template v-else-if="error">
        <p class="error">{{ error }}</p>
        <button class="btn btn-primary" @click="connect">Thử lại</button>
      </template>
      <p class="hint">Checkpass chỉ nhận mã đăng nhập dùng một lần, không nhận mật khẩu SP1S của bạn.</p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { checkpassApi } from '../api'

const route = useRoute()
const loading = ref(true)
const error = ref('')

const connect = async () => {
  loading.value = true
  error.value = ''
  try {
    const returnUrl = String(route.query.return_url || '')
    if (!returnUrl) throw new Error('Thiếu địa chỉ quay lại Checkpass')
    const { data } = await checkpassApi.createSsoTicket(returnUrl)
    if (!data?.redirect_url) throw new Error('Máy chủ không trả mã đăng nhập')
    window.location.assign(data.redirect_url)
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Không thể kết nối Checkpass'
    loading.value = false
  }
}

onMounted(connect)
</script>

<style scoped>
.connect-page {
  min-height: 70vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.connect-card {
  width: min(100%, 480px);
  padding: 2.5rem;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.connect-icon { font-size: 3rem; }
.connect-card h1 { margin: .75rem 0; }
.connect-card p { color: var(--text-secondary); }
.connect-card .error { color: var(--danger, #dc2626); }
.hint { margin-top: 1.5rem; font-size: .85rem; }
</style>
