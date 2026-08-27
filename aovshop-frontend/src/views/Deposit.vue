<template>
  <div class="deposit-page">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">💰 Nạp tiền</h1>
        <p class="page-subtitle">Nạp tiền vào tài khoản để mua sắm</p>
      </div>

      <div class="deposit-grid">
        <div>
          <!-- Balance Card -->
        <div class="balance-card">
          <div class="balance-label">Số dư hiện tại</div>
          <div class="balance-amount">{{ formatPrice(authStore.balance) }}</div>
          <div class="user-id">Mã tài khoản: <strong>{{ authStore.user?.id }}</strong></div>
        </div>

        <!-- Create Order Form (show when no active order) -->
        <div v-if="!paymentInfo" class="deposit-form card" style="margin-top: 20px;">
          <div class="card-header">Tạo đơn nạp tiền</div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Số tiền (tối thiểu 10,000đ)</label>
              <input 
                v-model.number="amount" 
                type="number" 
                class="form-input" 
                placeholder="Nhập số tiền..."
                min="10000"
                step="1000"
              />
            </div>

            <div class="quick-amounts">
              <button 
                v-for="amt in quickAmounts" 
                :key="amt" 
                class="btn btn-secondary btn-sm"
                @click="amount = amt"
              >
                {{ formatPrice(amt) }}
              </button>
            </div>

            <div v-if="amount && amount < 10000" class="error-message">
              ⚠️ Số tiền tối thiểu là 10,000đ
            </div>

            <button 
              class="btn btn-primary btn-lg create-btn"
              @click="createOrder"
              :disabled="!amount || amount < 10000 || creating"
            >
              {{ creating ? 'Đang tạo...' : '📋 Tạo đơn nạp tiền' }}
            </button>
          </div>
        </div>

        <!-- Payment Info (show after order created) -->
        <!-- Payment Info Section -->
        <div v-if="paymentInfo && !showPaymentModal" class="payment-info card" style="margin-top: 20px;">
          <div class="card-header">
            Thông tin chuyển khoản
            <div class="header-actions">
              <div class="polling-status" v-if="pollInterval">
                <span class="dot"></span> Đang chờ thanh toán...
              </div>
              <button class="btn btn-secondary btn-sm" @click="resetOrder">
                ← Tạo đơn mới
              </button>
            </div>
          </div>
          <div class="card-body">
            <div class="payment-details-grid">
              <div class="qr-section">
                <img :src="qrUrl" alt="QR Code" class="qr-code" />
                <p class="qr-note">Quét mã QR để chuyển khoản nhanh</p>
              </div>

              <div class="info-section">
                <div class="info-row">
                  <span>Ngân hàng:</span>
                  <strong>{{ paymentInfo.bank_name || (paymentInfo.bank && paymentInfo.bank.bankName) }}</strong>
                </div>
                <div class="info-row">
                  <span>Số tài khoản:</span>
                  <strong>{{ paymentInfo.account_number || (paymentInfo.bank && paymentInfo.bank.accountNumber) }}</strong>
                  <button class="btn-copy" @click="copy(paymentInfo.account_number || (paymentInfo.bank && paymentInfo.bank.accountNumber))">📋</button>
                </div>
                <div class="info-row">
                  <span>Chủ tài khoản:</span>
                  <strong>{{ paymentInfo.account_name || (paymentInfo.bank && paymentInfo.bank.accountName) }}</strong>
                </div>
                <div class="info-row highlight">
                  <span>Nội dung chuyển khoản:</span>
                  <strong>{{ paymentInfo.reference || paymentInfo.content }}</strong>
                  <button class="btn-copy" @click="copy(paymentInfo.reference || paymentInfo.content)">📋</button>
                </div>
                <div class="info-row highlight">
                  <span>Số tiền:</span>
                  <strong class="text-success">{{ formatPrice(paymentInfo.amount) }}</strong>
                  <button class="btn-copy" @click="copy(paymentInfo.amount)">📋</button>
                </div>
              </div>
            </div>

            <div class="important-note">
              <strong>⚠️ Quan trọng:</strong>
              <ul>
                <li>Chuyển đúng số tiền: <strong>{{ formatPrice(paymentInfo.amount) }}</strong></li>
                <li>Nội dung <strong>BẮT BUỘC</strong>: <strong>{{ paymentInfo.reference || paymentInfo.content }}</strong></li>
                <li>Tiền sẽ được cộng <strong>tự động</strong> sau 1-5 phút</li>
              </ul>
            </div>
          </div>
        </div>
        </div>

        <!-- Success Notification Overlay -->
        <Transition name="modal">
          <div v-if="paymentSuccess" class="success-overlay">
            <div class="success-card card animate-pop">
              <div class="success-icon">✅</div>
              <h2>Nạp tiền thành công!</h2>
              <p>Số tiền <strong>{{ formatPrice(lastDepositAmount) }}</strong> đã được cộng vào tài khoản.</p>
              <p class="new-balance">Số dư mới: <strong>{{ formatPrice(authStore.balance) }}</strong></p>
              <button class="btn btn-primary" @click="paymentSuccess = false">Đóng</button>
            </div>
          </div>
        </Transition>

        <!-- Payment Modal (for pending deposits) -->
        <Transition name="modal">
          <div v-if="showPaymentModal && paymentInfo" class="modal-overlay" @click.self="closePaymentModal">
            <div class="payment-modal card">
              <div class="modal-header">
                <h3>Thông tin chuyển khoản</h3>
                <button class="modal-close" @click="closePaymentModal">&times;</button>
              </div>
              <div class="modal-body">
                <div class="modal-grid">
                  <div class="qr-section">
                    <img :src="qrUrl" alt="QR Code" class="qr-code" />
                    <p class="qr-note">Quét mã QR</p>
                  </div>

                  <div class="info-section">
                    <div class="info-row">
                      <span>Ngân hàng:</span>
                      <strong>{{ paymentInfo.bank_name || (paymentInfo.bank && paymentInfo.bank.bankName) }}</strong>
                    </div>
                    <div class="info-row">
                      <span>STK:</span>
                      <strong>{{ paymentInfo.account_number || (paymentInfo.bank && paymentInfo.bank.accountNumber) }}</strong>
                      <button class="btn-copy" @click="copy(paymentInfo.account_number || (paymentInfo.bank && paymentInfo.bank.accountNumber))">📋</button>
                    </div>
                    <div class="info-row">
                      <span>Chủ TK:</span>
                      <strong>{{ paymentInfo.account_name || (paymentInfo.bank && paymentInfo.bank.accountName) }}</strong>
                    </div>
                    <div class="info-row highlight">
                      <span>Số tiền:</span>
                      <strong class="text-success">{{ formatPrice(paymentInfo.amount) }}</strong>
                      <button class="btn-copy" @click="copy(paymentInfo.amount)">📋</button>
                    </div>
                    <div class="info-row highlight">
                      <span>Nội dung:</span>
                      <strong>{{ paymentInfo.reference || paymentInfo.content }}</strong>
                      <button class="btn-copy" @click="copy(paymentInfo.reference || paymentInfo.content)">📋</button>
                    </div>
                  </div>
                </div>

                <div class="important-note compact">
                  ⚠️ Chuyển <strong>{{ formatPrice(paymentInfo.amount) }}</strong> với nội dung <strong>{{ paymentInfo.content }}</strong>.
                </div>

                <div class="polling-status" v-if="pollInterval">
                  <span class="dot"></span> Đang chờ thanh toán...
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Transaction History -->
        <div class="transactions card">
          <div class="card-header">Lịch sử giao dịch</div>
          <div class="card-body">
            <div v-if="loading" class="loading"><div class="spinner"></div></div>
            
            <div v-else-if="paginatedTransactions.length === 0" class="empty-state">
              <p>Chưa có giao dịch</p>
            </div>

            <div v-else class="transaction-list">
              <div 
                v-for="tx in paginatedTransactions" 
                :key="tx.id" 
                class="transaction-item"
                :class="{ 'clickable': tx.status === 'pending' }"
                @click="selectPendingDeposit(tx)"
              >
                <div class="tx-icon" :class="tx.type">
                  {{ tx.type === 'deposit' ? '↓' : '↑' }}
                </div>
                <div class="tx-info">
                  <div class="tx-desc">{{ tx.description || typeText(tx.type) }}</div>
                  <div class="tx-date">{{ formatDate(tx.createdAt) }}</div>
                  <div v-if="tx.reference" class="tx-reference" title="Nội dung chuyển khoản">
                    📝 {{ tx.reference }}
                  </div>
                </div>
                <div class="tx-amount" :class="tx.type">
                  {{ tx.type === 'deposit' ? '+' : '-' }}{{ formatPrice(Math.abs(tx.amount)) }}
                </div>
                <span :class="['badge', statusClass(tx.status)]">
                  {{ statusText(tx.status) }}
                </span>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="totalPages > 1" class="pagination">
              <button 
                class="btn btn-secondary btn-sm" 
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                ← Trước
              </button>
              <span class="pagination-info">
                Trang {{ currentPage }} / {{ totalPages }}
              </span>
              <button 
                class="btn btn-secondary btn-sm" 
                :disabled="currentPage === totalPages"
                @click="currentPage++"
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const authStore = useAuthStore()

const amount = ref(null)
const loading = ref(true)
const creating = ref(false)
const transactions = ref([])
const paymentInfo = ref(null)
const paymentSuccess = ref(false)
const lastDepositAmount = ref(0)
const currentPage = ref(1)
const perPage = 10
const showPaymentModal = ref(false)
const activeBanks = ref([])
const selectedBank = ref(null)
let pollInterval = null

const quickAmounts = [50000, 100000, 200000, 500000, 1000000]

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price || 0)
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('vi-VN')
}

const typeText = (type) => {
  const texts = {
    deposit: 'Nạp tiền',
    purchase: 'Mua hàng',
    refund: 'Hoàn tiền',
  }
  return texts[type] || type
}

const statusClass = (status) => {
  const classes = {
    pending: 'badge-warning',
    completed: 'badge-success',
    failed: 'badge-danger',
  }
  return classes[status] || 'badge-primary'
}

const statusText = (status) => {
  const texts = {
    pending: 'Chờ xử lý',
    completed: 'Thành công',
    failed: 'Thất bại',
  }
  return texts[status] || status
}

const copy = (text) => {
  if (text) {
    navigator.clipboard.writeText(text)
    toast.success('Đã copy!')
  }
}

const selectPendingDeposit = async (tx) => {
  if (tx.status !== 'pending') return
  
  // Stop any existing polling
  stopPolling()
  
  try {
    // Construct payment info from deposit record
    // Use assigned bank from transaction history
    paymentInfo.value = {
      ...tx,
      content: tx.reference,
    }

    // Show modal
    showPaymentModal.value = true
    
    // Start polling for this deposit
    pollInterval = setInterval(checkStatus, 5000)
  } catch (error) {
    console.error('Failed to load banks:', error)
    toast.error('Không thể tải thông tin ngân hàng')
  }
}

const fetchBanks = async () => {
  try {
    const response = await api.get('/deposit/banks')
    activeBanks.value = response.data
    if (activeBanks.value.length > 0 && !selectedBank.value) {
      selectedBank.value = activeBanks.value[0]
    }
  } catch (error) {
    console.error('Failed to fetch banks:', error)
  }
}

const selectBank = (bank) => {
  selectedBank.value = bank
}

const qrUrl = computed(() => {
  if (!paymentInfo.value) return ''
  if (paymentInfo.value.qr_url) return paymentInfo.value.qr_url

  const bank = paymentInfo.value.bank
  if (bank) {
    return `https://img.vietqr.io/image/${bank.bankName}-${bank.accountNumber}-compact2.png?amount=${paymentInfo.value.amount}&addInfo=${paymentInfo.value.content}&accountName=${encodeURIComponent(bank.accountName)}`
  }
  return ''
})

const closePaymentModal = () => {
  showPaymentModal.value = false
  stopPolling()
  paymentInfo.value = null
}

// Computed for pagination
const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * perPage
  const end = start + perPage
  return transactions.value.slice(start, end)
})

const totalPages = computed(() => {
  return Math.ceil(transactions.value.length / perPage)
})

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

const checkStatus = async () => {
  if (!paymentInfo.value) return

  try {
    const response = await api.get(`/deposit/status/${paymentInfo.value.content}`)
    if (response.data.status === 'completed') {
      lastDepositAmount.value = response.data.amount
      stopPolling()
      paymentSuccess.value = true
      authStore.fetchProfile()
      loadTransactions()
      paymentInfo.value = null
      amount.value = null
    }
  } catch (error) {
    console.error('Failed to check status:', error)
  }
}

const createOrder = async () => {
  if (!amount.value || amount.value < 10000) return
  
  creating.value = true
  try {
    const response = await api.post('/deposit/create', { amount: amount.value })
    paymentInfo.value = {
      ...response.data,
      content: response.data.reference
    }
    showPaymentModal.value = true
    loadTransactions()
    
    // Start polling
    stopPolling()
    pollInterval = setInterval(checkStatus, 5000)
  } catch (error) {
    toast.error(error.response?.data?.message || 'Lỗi khi tạo đơn')
  } finally {
    creating.value = false
  }
}

const resetOrder = () => {
  stopPolling()
  paymentInfo.value = null
  amount.value = null
}

const loadTransactions = async () => {
  loading.value = true
  try {
    const response = await api.get('/deposit/history')
    transactions.value = response.data || []
  } catch (error) {
    console.error('Failed to load transactions:', error)
    transactions.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // Refresh user profile to get latest balance
  authStore.fetchProfile()
  loadTransactions()
  fetchBanks()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.deposit-page {
  padding: 2rem 0;
}

.deposit-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 1024px) {
  .deposit-grid {
    grid-template-columns: 1fr;
  }
}

.balance-card {
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  text-align: center;
}

.balance-label {
  font-size: 0.85rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
}

.balance-amount {
  font-size: 2rem;
  font-weight: 800;
}

.quick-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.payment-info {
  margin-top: 1.5rem;
  padding: 1.25rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.payment-info h4 {
  margin-bottom: 1rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

.info-row:last-of-type {
  border-bottom: none;
}

.payment-info .note {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.tx-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.tx-icon.deposit {
  background: rgba(34, 197, 94, 0.2);
  color: var(--success);
}

.tx-icon.purchase, .tx-icon.refund {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
}

.tx-info {
  flex: 1;
}

.tx-desc {
  font-size: 0.9rem;
}

.tx-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.tx-amount {
  font-weight: 600;
}

.tx-amount.deposit {
  color: var(--success);
}

.tx-amount.purchase {
  color: var(--danger);
}

.text-success { color: var(--success); }

.tx-reference {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: monospace;
  background: var(--bg-tertiary);
  padding: 2px 4px;
  border-radius: 3px;
  margin-top: 4px;
}

.transaction-item.clickable {
  cursor: pointer;
  transition: all 0.2s;
}

.transaction-item.clickable:hover {
  background: var(--bg-secondary);
  transform: translateX(4px);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.pagination-info {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.user-id {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  opacity: 0.9;
}

.qr-section {
  text-align: center;
  padding: 1rem 0;
  margin-bottom: 1rem;
}

.qr-code {
  max-width: 200px;
  border-radius: 8px;
}

.qr-note {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}

.info-row.highlight {
  background: rgba(var(--primary-rgb), 0.1);
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px dashed var(--primary);
  margin: 0.5rem 0;
}

.btn-copy {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 1rem;
}

.btn-copy:hover {
  opacity: 0.7;
}

.important-note {
  margin-top: 1.5rem;
  padding: 1rem;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  border-left: 3px solid #f59e0b;
}

.important-note ul {
  margin: 0.5rem 0 0 1.5rem;
  padding: 0;
}

.important-note li {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.error-message {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 6px;
  font-size: 0.9rem;
}

.create-btn {
  width: 100%;
  margin-top: 1.5rem;
}

.card-header {
  display: flex;
  align-items: center;
}
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.polling-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  background-color: var(--warning);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.5; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.5; }
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.payment-modal {
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-secondary);
}

.payment-modal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.payment-modal .modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.payment-modal .modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-muted);
}

.payment-modal .modal-close:hover {
  color: var(--text);
}

.payment-modal .modal-body {
  padding: 1rem;
}

.modal-grid {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.modal-grid .qr-section {
  flex-shrink: 0;
}

.modal-grid .qr-code {
  width: 180px;
  height: auto;
}

.payment-details-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.bank-selector {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 10px;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.bank-tab {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.bank-tab:hover {
  border-color: var(--primary);
}

.bank-tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.bank-tab-name {
  font-weight: 700;
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .payment-details-grid {
    grid-template-columns: 1fr;
  }
}

.info-section .info-row {
  padding: 0.4rem 0;
  font-size: 0.9rem;
}

.important-note.compact {
  margin-top: 1rem;
  padding: 0.75rem;
  font-size: 0.85rem;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 6px;
  border-left: 3px solid #f59e0b;
}

@media (max-width: 600px) {
  .modal-grid {
    flex-direction: column;
    align-items: center;
  }
}

.success-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.success-card {
  max-width: 400px;
  width: 100%;
  text-align: center;
  padding: 2.5rem;
  background: var(--bg-secondary);
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.success-card h2 {
  margin-bottom: 1rem;
  color: var(--success);
}

.new-balance {
  margin: 1.5rem 0;
  font-size: 1.1rem;
  padding: 1rem;
  background: rgba(var(--primary-rgb), 0.1);
  border-radius: 8px;
}

.animate-pop {
  animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes pop {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* Tablet styles */
@media (max-width: 768px) {
  .deposit-page {
    padding: 1rem 0;
  }

  .page-title {
    font-size: 1.5rem;
  }

  .page-subtitle {
    font-size: 0.9rem;
  }

  .balance-card {
    padding: 1rem;
  }

  .balance-amount {
    font-size: 1.75rem;
  }

  .quick-amounts {
    gap: 0.4rem;
  }

  .quick-amounts .btn {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }

  .transaction-item {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem;
  }

  .tx-icon {
    width: 30px;
    height: 30px;
    font-size: 0.9rem;
  }

  .tx-info {
    flex: 1;
    min-width: 120px;
  }

  .tx-amount {
    font-size: 0.9rem;
  }

  .payment-modal {
    max-width: 95%;
    margin: 0.5rem;
  }

  .modal-grid .qr-code {
    width: 150px;
  }

  .info-section .info-row {
    font-size: 0.85rem;
  }

  .pagination {
    gap: 0.5rem;
    font-size: 0.85rem;
  }
}

/* Mobile styles */
@media (max-width: 480px) {
  .deposit-page {
    padding: 0.5rem 0;
  }

  .page-title {
    font-size: 1.25rem;
  }

  .balance-card {
    padding: 0.75rem;
  }

  .balance-amount {
    font-size: 1.5rem;
  }

  .balance-label {
    font-size: 0.75rem;
  }

  .user-id {
    font-size: 0.75rem;
  }

  .card-header {
    font-size: 0.9rem;
    padding: 0.75rem;
  }

  .card-body {
    padding: 0.75rem;
  }

  .form-input {
    font-size: 1rem;
    padding: 0.6rem;
  }

  .quick-amounts {
    gap: 0.3rem;
  }

  .quick-amounts .btn {
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
  }

  .create-btn {
    font-size: 0.9rem;
    padding: 0.75rem;
  }

  .transaction-item {
    padding: 0.5rem;
  }

  .tx-icon {
    width: 24px;
    height: 24px;
    font-size: 0.8rem;
  }

  .tx-desc {
    font-size: 0.8rem;
  }

  .tx-date {
    font-size: 0.65rem;
  }

  .tx-reference {
    font-size: 0.6rem;
  }

  .tx-amount {
    font-size: 0.85rem;
  }

  .badge {
    font-size: 0.65rem;
    padding: 0.2rem 0.4rem;
  }

  .modal-grid .qr-code {
    width: 120px;
  }

  .payment-modal .modal-header h3 {
    font-size: 1rem;
  }

  .info-section .info-row {
    font-size: 0.8rem;
    padding: 0.3rem 0;
  }

  .important-note.compact {
    font-size: 0.75rem;
    padding: 0.5rem;
  }

  .success-card {
    padding: 1.5rem;
  }

  .success-icon {
    font-size: 3rem;
  }

  .success-card h2 {
    font-size: 1.25rem;
  }

  .pagination {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination-info {
    width: 100%;
    text-align: center;
    order: -1;
    margin-bottom: 0.5rem;
  }
}
</style>
