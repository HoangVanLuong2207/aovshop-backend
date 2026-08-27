<template>
  <div class="admin-deposits">
    <div class="page-header">
      <h1>💰 Quản lý nạp tiền</h1>
      <div class="header-actions">
        <button class="btn btn-danger btn-sm" @click="clearJunk" :disabled="clearing">
          🗑️ Dọn đơn rác
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-header filters">
        <div class="filter-group">
          <label>Trạng thái</label>
          <select v-model="filterStatus" class="form-input" @change="loadDeposits">
            <option value="">Tất cả</option>
            <option value="pending">Đang chờ</option>
            <option value="completed">Thành công</option>
            <option value="expired">Hết hạn</option>
            <option value="failed">Thất bại</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Tìm kiếm (Mã tham chiếu)</label>
          <input 
            v-model="search" 
            type="text" 
            class="form-input" 
            placeholder="NAP..." 
            @keyup.enter="loadDeposits"
          />
        </div>
      </div>

      <div class="card-body">
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        
        <table v-else class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Khách hàng</th>
              <th>Số tiền</th>
              <th>Mã tham chiếu</th>
              <th>Cổng nạp</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="deposit in deposits" :key="deposit.id">
              <td><strong>{{ deposit.id }}</strong></td>
              <td>
                <div v-if="deposit.user">
                  <div>{{ deposit.user.name }}</div>
                  <small class="text-secondary">{{ deposit.user.email }}</small>
                </div>
                <span v-else class="text-danger">N/A</span>
              </td>
              <td class="text-success-val">{{ formatPrice(deposit.amount) }}</td>
              <td><code>{{ deposit.reference }}</code></td>
              <td>{{ deposit.bank?.bankName || 'N/A' }}</td>
              <td>
                <span :class="['badge', getStatusClass(deposit.status)]">
                  {{ getStatusLabel(deposit.status) }}
                </span>
              </td>
              <td>{{ formatDate(deposit.createdAt) }}</td>
              <td>
                <button 
                  v-if="deposit.status !== 'completed'"
                  class="btn btn-sm btn-success" 
                  title="Duyệt nạp tiền thủ công"
                  @click="approveDeposit(deposit)"
                >
                  ✓ Duyệt
                </button>
              </td>
            </tr>
            <tr v-if="deposits.length === 0">
              <td colspan="8" class="text-center py-4">Không có dữ liệu</td>
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
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '../../api'
import { useToast } from '../../composables/useToast'
import Pagination from '../../components/Pagination.vue'

const { toast, confirm } = useToast()

const deposits = ref([])
const loading = ref(true)
const clearing = ref(false)
const filterStatus = ref('')
const search = ref('')

// Pagination
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const totalPages = ref(0)

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price || 0)
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('vi-VN')
}

const getStatusClass = (status) => {
  switch (status) {
    case 'completed': return 'badge-success'
    case 'pending': return 'badge-warning'
    case 'expired': return 'badge-secondary'
    case 'failed': return 'badge-danger'
    default: return 'badge-secondary'
  }
}

const getStatusLabel = (status) => {
  switch (status) {
    case 'completed': return 'Thành công'
    case 'pending': return 'Đang chờ'
    case 'expired': return 'Hết hạn'
    case 'failed': return 'Thất bại'
    default: return status
  }
}

const loadDeposits = async () => {
  loading.value = true
  try {
    const params = {
      status: filterStatus.value || undefined,
      q: search.value || undefined,
      page: page.value,
      limit: limit.value
    }
    const response = await api.get('/admin/deposits', { params })
    deposits.value = response.data.data
    total.value = response.data.pagination.total
    totalPages.value = response.data.pagination.totalPages
  } catch (error) {
    console.error('Failed to load deposits:', error)
    toast.error('Lỗi khi tải danh sách đơn nạp')
  } finally {
    loading.value = false
  }
}

// Watch for changes
watch([page, limit], loadDeposits)
watch([filterStatus, search], () => {
  page.value = 1
  loadDeposits()
})

const approveDeposit = async (deposit) => {
  const confirmed = await confirm(
    `Bạn có chắc chắn muốn duyệt đơn nạp #${deposit.id} số tiền ${formatPrice(deposit.amount)} cho khách hàng ${deposit.user?.name}? Số dư sẽ được cộng ngay lập tức.`,
    { title: 'Xác nhận duyệt nạp tiền', type: 'success' }
  )
  
  if (!confirmed) return

  try {
    await api.post(`/admin/deposits/${deposit.id}/approve`)
    toast.success('Đã duyệt đơn nạp thành công!')
    await loadDeposits()
  } catch (error) {
    toast.error(error.response?.data?.message || 'Lỗi khi duyệt đơn nạp')
  }
}

const clearJunk = async () => {
  const confirmed = await confirm(
    'Xóa toàn bộ đơn nạp trạng thái "Đang chờ" hoặc "Hết hạn"?',
    { title: 'Dọn dẹp đơn rác', type: 'danger' }
  )

  if (!confirmed) return

  clearing.value = true
  try {
    const response = await api.delete('/admin/deposits/junk')
    toast.success(response.data.message)
    await loadDeposits()
  } catch (error) {
    toast.error('Lỗi khi dọn dẹp đơn rác')
  } finally {
    clearing.value = false
  }
}

onMounted(loadDeposits)
</script>

<style scoped>
.admin-deposits {
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.filters {
  display: flex;
  gap: 1.5rem;
  padding: 1rem;
  background: var(--bg-secondary);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th, .table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.text-success-val {
  color: var(--success);
  font-weight: 600;
}

code {
  background: var(--bg-tertiary);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
}

@media (max-width: 768px) {
  .table thead { display: none; }
  .table tr { display: block; margin-bottom: 1rem; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .table td { display: flex; justify-content: space-between; border: none; padding: 0.5rem 0; }
  .table td::before { content: attr(data-label); font-weight: 600; color: var(--text-secondary); }
}
</style>
