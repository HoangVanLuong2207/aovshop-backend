<template>
  <div class="admin-transactions">
    <div class="page-header flex-between">
      <h1 class="page-title">💳 Quản lý giao dịch</h1>
      <button class="btn btn-success" @click="showDepositModal = true">+ Nạp tiền thủ công</button>
    </div>

    <div class="filters mb-3">
      <div class="filter-group">
        <select v-model="filter.type" class="form-input" @change="loadTransactions">
          <option value="">Tất cả loại</option>
          <option value="deposit">Nạp tiền</option>
          <option value="purchase">Mua hàng</option>
          <option value="refund">Hoàn tiền</option>
        </select>
        <select v-model="filter.status" class="form-input" @change="loadTransactions">
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ xử lý</option>
          <option value="completed">Hoàn thành</option>
          <option value="failed">Thất bại</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <div v-else>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Người dùng</th>
            <th>Loại</th>
            <th>Số tiền</th>
            <th>Số dư trước</th>
            <th>Số dư sau</th>
            <th>Trạng thái</th>
            <th>Mô tả</th>
            <th>Ngày tạo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id">
            <td data-label="ID">{{ tx.id }}</td>
            <td data-label="Người dùng">{{ tx.user?.name }}<br><small class="text-muted">{{ tx.user?.email }}</small></td>
            <td data-label="Loại">
              <span :class="['badge', typeClass(tx.type)]">{{ typeText(tx.type) }}</span>
            </td>
            <td data-label="Số tiền" :class="tx.type === 'deposit' ? 'text-success' : 'text-danger'">
              {{ tx.type === 'deposit' ? '+' : '' }}{{ formatPrice(tx.amount) }}
            </td>
            <td data-label="Số dư trước">{{ formatPrice(tx.balanceBefore) }}</td>
            <td data-label="Số dư sau">{{ formatPrice(tx.balanceAfter) }}</td>
            <td data-label="Trạng thái">
              <span :class="['badge', statusClass(tx.status)]">{{ statusText(tx.status) }}</span>
            </td>
            <td data-label="Mô tả" class="text-muted-desc">{{ tx.description || '-' }}</td>
            <td data-label="Ngày tạo">{{ formatDate(tx.createdAt) }}</td>
          </tr>
        </tbody>
      </table>

      <Pagination 
        v-model:page="page" 
        v-model:limit="limit" 
        :total="total" 
        :totalPages="totalPages" 
      />
    </div>

    <!-- Manual Deposit Modal -->
    <Transition name="modal">
      <div v-if="showDepositModal" class="modal-overlay" @click.self="showDepositModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">Nạp tiền thủ công</h3>
            <button class="modal-close" @click="showDepositModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">User ID *</label>
              <input v-model.number="depositForm.user_id" type="number" class="form-input" required />
            </div>
            <div class="form-group">
              <label class="form-label">Số tiền *</label>
              <input v-model.number="depositForm.amount" type="number" class="form-input" min="1000" required />
            </div>
            <div class="form-group">
              <label class="form-label">Ghi chú</label>
              <input v-model="depositForm.description" type="text" class="form-input" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showDepositModal = false">Hủy</button>
            <button class="btn btn-success" @click="manualDeposit" :disabled="depositing">
              {{ depositing ? 'Đang xử lý...' : 'Nạp tiền' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { adminApi } from '../../api'
import { useToast } from '../../composables/useToast'
import Pagination from '../../components/Pagination.vue'

const { toast } = useToast()

const loading = ref(true)
const depositing = ref(false)
const showDepositModal = ref(false)
const transactions = ref([])
const filter = reactive({ type: '', status: '' })

// Pagination
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const totalPages = ref(0)

const depositForm = reactive({
  user_id: '',
  amount: 100000,
  description: '',
})

const formatPrice = (price) => new Intl.NumberFormat('vi-VN').format(price) + 'đ'
const formatDate = (date) => new Date(date).toLocaleString('vi-VN')

const typeClass = (type) => ({
  deposit: 'badge-success',
  purchase: 'badge-primary',
  refund: 'badge-warning',
})[type] || 'badge-primary'

const typeText = (type) => ({
  deposit: 'Nạp tiền',
  purchase: 'Mua hàng',
  refund: 'Hoàn tiền',
})[type] || type

const statusClass = (status) => ({
  pending: 'badge-warning',
  completed: 'badge-success',
  failed: 'badge-danger',
})[status] || 'badge-primary'

const statusText = (status) => ({
  pending: 'Chờ xử lý',
  completed: 'Thành công',
  failed: 'Thất bại',
})[status] || status

const loadTransactions = async () => {
  loading.value = true
  try {
    const params = { 
      page: page.value, 
      limit: limit.value 
    }
    if (filter.type) params.type = filter.type
    if (filter.status) params.status = filter.status
    const response = await adminApi.getTransactions(params)
    transactions.value = response.data.data
    total.value = response.data.pagination.total
    totalPages.value = response.data.pagination.totalPages
  } catch (error) {
    console.error('Failed to load transactions:', error)
    toast.error('Lỗi khi tải giao dịch')
  } finally {
    loading.value = false
  }
}

const manualDeposit = async () => {
  if (!depositForm.user_id || !depositForm.amount) return
  
  depositing.value = true
  try {
    await adminApi.manualDeposit(depositForm)
    showDepositModal.value = false
    depositForm.user_id = ''
    depositForm.amount = 100000
    depositForm.description = ''
    loadTransactions()
    toast.success('Nạp tiền thành công!')
  } catch (error) {
    toast.error(error.response?.data?.message || 'Nạp tiền thất bại')
  } finally {
    depositing.value = false
  }
}

// Watch for changes
watch([page, limit], loadTransactions)
watch([() => filter.type, () => filter.status], () => {
  page.value = 1
  loadTransactions()
})

onMounted(loadTransactions)
</script>

<style scoped>
.admin-transactions {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.filters {
  display: flex;
  gap: 1rem;
}

.filter-group {
  display: flex;
  gap: 1rem;
  width: 100%;
}

.text-muted-desc {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
  }
  .filter-group {
    flex-direction: column;
    gap: 0.5rem;
  }
  .filter-group .form-input {
    width: 100% !important;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  .page-header .btn {
    width: 100%;
  }

  .table thead {
    display: none;
  }

  .table tbody tr {
    display: block;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .table td {
    display: flex;
    flex-wrap: wrap; /* Cho phép nội dung xuống dòng nếu quá dài */
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    text-align: right;
    gap: 0.5rem;
    min-width: 0;
  }

  .table td > * {
    max-width: 100%;
    word-break: break-all;
  }

  .table td:last-child {
    border-bottom: none;
    justify-content: center;
    padding-top: 1rem !important;
  }

  .table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 0.8rem;
    text-align: left;
    flex-shrink: 0;
  }

  .text-muted-desc {
    text-align: right;
    width: 100%;
    word-break: break-word;
  }

  .modal {
    width: 95% !important;
    max-width: 100% !important;
    margin: 0 auto;
  }
}

.text-success { color: var(--success); }
.text-danger { color: var(--danger); }
</style>
