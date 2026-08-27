<template>
  <div class="admin-promotions">
    <div class="page-header flex-between">
      <h1 class="page-title">🎁 Quản lý khuyến mãi</h1>
      <button class="btn btn-primary" @click="openModal()">+ Thêm khuyến mãi</button>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Mã</th>
          <th>Tên</th>
          <th>Áp dụng cho</th>
          <th>Loại</th>
          <th>Giá trị</th>
          <th>Đơn tối thiểu</th>
          <th>Thời gian</th>
          <th>Đã dùng</th>
          <th>Trạng thái</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="promo in promotions" :key="promo.id">
          <td data-label="Mã"><code>{{ promo.code }}</code></td>
          <td data-label="Tên">{{ promo.name }}</td>
          <td data-label="Áp dụng">{{ getAppliedProductsText(promo) }}</td>
          <td data-label="Loại">{{ promo.type === 'percent' ? 'Phần trăm' : 'Cố định' }}</td>
          <td data-label="Giá trị">{{ promo.type === 'percent' ? promo.value + '%' : formatPrice(promo.value) }}</td>
          <td data-label="Đơn tối thiểu">{{ formatPrice(promo.min_order) }}</td>
          <td data-label="Thời gian">
            {{ formatDate(promo.start_date) }}<br>
            <small class="text-muted">→ {{ formatDate(promo.end_date) }}</small>
          </td>
          <td data-label="Đã dùng">{{ promo.used_count }}/{{ promo.usage_limit || '∞' }}</td>
          <td data-label="Trạng thái">
            <button 
              :class="['badge', promo.active ? 'badge-success' : 'badge-danger']"
              style="cursor: pointer"
              @click="toggleActive(promo)"
            >
              {{ promo.active ? 'Đang chạy' : 'Tắt' }}
            </button>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" @click="openModal(promo)">Sửa</button>
            <button class="btn btn-danger btn-sm" @click="deletePromotion(promo)">Xóa</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pagination 
      v-model:page="page" 
      v-model:limit="limit" 
      :total="total" 
      :totalPages="totalPages" 
    />

    <!-- Modal -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal" style="max-width: 550px">
          <div class="modal-header">
            <h3 class="modal-title">{{ editing ? 'Sửa khuyến mãi' : 'Thêm khuyến mãi' }}</h3>
            <button class="modal-close" @click="closeModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="grid grid-2 gap-2">
              <div class="form-group">
                <label class="form-label">Mã khuyến mãi *</label>
                <input v-model="form.code" type="text" class="form-input" required />
              </div>
              <div class="form-group">
                <label class="form-label">Tên *</label>
                <input v-model="form.name" type="text" class="form-input" required />
              </div>
            </div>
            <div class="grid grid-2 gap-2">
              <div class="form-group">
                <label class="form-label">Loại giảm giá</label>
                <select v-model="form.type" class="form-input">
                  <option value="percent">Phần trăm (%)</option>
                  <option value="fixed">Số tiền cố định</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Giá trị *</label>
                <input v-model.number="form.value" type="number" class="form-input" min="0" required />
              </div>
            </div>
            <div class="grid grid-2 gap-2">
              <div class="form-group">
                <label class="form-label">Đơn tối thiểu</label>
                <input v-model.number="form.min_order" type="number" class="form-input" min="0" />
              </div>
              <div class="form-group">
                <label class="form-label">Giảm tối đa</label>
                <input v-model.number="form.max_discount" type="number" class="form-input" min="0" />
              </div>
            </div>
            <div class="grid grid-2 gap-2">
              <div class="form-group">
                <label class="form-label">Ngày bắt đầu *</label>
                <input 
                  v-model="form.start_date" 
                  type="datetime-local" 
                  class="form-input" 
                  required 
                />
              </div>
              <div class="form-group">
                <label class="form-label">Ngày kết thúc *</label>
                <input 
                  v-model="form.end_date" 
                  type="datetime-local" 
                  class="form-input" 
                  required 
                />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Giới hạn lượt dùng</label>
              <input v-model.number="form.usage_limit" type="number" class="form-input" min="1" placeholder="Để trống = không giới hạn" />
            </div>
            <div class="form-group">
              <label class="form-label">Áp dụng cho sản phẩm cụ thể</label>
              <select v-model="form.applies_to_product_ids" class="form-input" multiple size="6">
                <option v-for="product in products" :key="product.id" :value="product.id">
                  #{{ product.id }} - {{ product.name }}
                </option>
              </select>
              <small class="text-muted">Để trống = áp dụng toàn bộ sản phẩm</small>
            </div>
            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" v-model="form.active" /> Kích hoạt
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Hủy</button>
            <button class="btn btn-primary" @click="savePromotion" :disabled="saving">
              {{ saving ? 'Đang lưu...' : 'Lưu' }}
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

const { toast, confirm } = useToast()

const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const promotions = ref([])
const products = ref([])

// Pagination
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const totalPages = ref(0)

const form = reactive({
  code: '',
  name: '',
  type: 'percent',
  value: 0,
  min_order: 0,
  max_discount: null,
  usage_limit: null,
  applies_to_product_ids: [],
  start_date: '',
  end_date: '',
  active: true,
})

const formatPrice = (price) => new Intl.NumberFormat('vi-VN').format(price) + 'đ'
const formatDate = (date) => new Date(date).toLocaleDateString('vi-VN')

const loadPromotions = async () => {
  loading.value = true
  try {
    const response = await adminApi.getPromotions({ 
      page: page.value, 
      limit: limit.value 
    })
    promotions.value = (response.data.data || []).map(promo => ({
      ...promo,
      applies_to_product_ids: parseProductIds(promo.applies_to_product_ids),
    }))
    total.value = response.data.pagination.total
    totalPages.value = response.data.pagination.totalPages
  } catch (error) {
    console.error('Failed to load promotions:', error)
    toast.error('Lỗi khi tải khuyến mãi')
  } finally {
    loading.value = false
  }
}

// Watch for changes
watch([page, limit], loadPromotions)

const parseProductIds = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(id => Number(id)).filter(id => !Number.isNaN(id))
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map(id => Number(id)).filter(id => !Number.isNaN(id))
      }
    } catch {
      return []
    }
  }
  return []
}

const loadProducts = async () => {
  try {
    const response = await adminApi.getProducts({ per_page: 1000 })
    products.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to load products:', error)
    products.value = []
  }
}

const getAppliedProductsText = (promo) => {
  const ids = parseProductIds(promo.applies_to_product_ids)
  if (ids.length === 0) return 'Tất cả sản phẩm'
  if (!products.value.length) return `${ids.length} sản phẩm`
  return ids
    .map(id => products.value.find(p => p.id === id)?.name)
    .filter(Boolean)
    .join(', ') || `${ids.length} sản phẩm`
}

const openModal = (promo = null) => {
  editing.value = promo
  if (promo) {
    Object.assign(form, {
      code: promo.code,
      name: promo.name,
      type: promo.type,
      value: promo.value,
      min_order: promo.min_order || 0,
      max_discount: promo.max_discount,
      usage_limit: promo.usage_limit,
      applies_to_product_ids: parseProductIds(promo.applies_to_product_ids),
      start_date: promo.start_date?.slice(0, 16),
      end_date: promo.end_date?.slice(0, 16),
      active: promo.active,
    })
  } else {
    const now = new Date()
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    Object.assign(form, {
      code: '',
      name: '',
      type: 'percent',
      value: 10,
      min_order: 0,
      max_discount: null,
      usage_limit: null,
      applies_to_product_ids: [],
      start_date: now.toISOString().slice(0, 16),
      end_date: nextMonth.toISOString().slice(0, 16),
      active: true,
    })
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editing.value = null
}

const savePromotion = async () => {
  if (!form.code) {
    toast.error('Vui lòng nhập mã khuyến mãi')
    return
  }
  if (!form.name) {
    toast.error('Vui lòng nhập tên khuyến mãi')
    return
  }
  if (!form.value || form.value <= 0) {
    toast.error('Vui lòng nhập giá trị giảm giá hợp lệ')
    return
  }
  
  saving.value = true
  try {
    const data = {
      ...form,
      applies_to_product_ids: Array.isArray(form.applies_to_product_ids)
        ? form.applies_to_product_ids.map(id => Number(id)).filter(id => !Number.isNaN(id))
        : [],
    }
    
    if (editing.value) {
      await adminApi.updatePromotion(editing.value.id, data)
      await loadPromotions()
      toast.success('Cập nhật khuyến mãi thành công!')
    } else {
      await adminApi.createPromotion(data)
      await loadPromotions()
      toast.success('Thêm khuyến mãi thành công!')
    }
    
    closeModal()
  } catch (error) {
    toast.error(error.response?.data?.message || 'Lưu thất bại')
  } finally {
    saving.value = false
  }
}

const toggleActive = async (promo) => {
  try {
    await adminApi.togglePromotion(promo.id)
    promo.active = !promo.active
  } catch (error) {
    toast.error('Cập nhật thất bại')
  }
}

const deletePromotion = async (promo) => {
  const confirmed = await confirm(`Xóa khuyến mãi "${promo.name}"?`, { type: 'danger', title: 'Xóa khuyến mãi' })
  if (!confirmed) return
  
  try {
    await adminApi.deletePromotion(promo.id)
    // Optimized: Update local state
    promotions.value = promotions.value.filter(p => p.id !== promo.id)
  } catch (error) {
    toast.error(error.response?.data?.message || 'Xóa thất bại')
  }
}

onMounted(async () => {
  await Promise.all([loadPromotions(), loadProducts()])
})
</script>

<style scoped>
.admin-promotions {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

code {
  background: var(--bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

@media (max-width: 768px) {
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
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    text-align: right;
    gap: 1rem;
    min-width: 0;
    word-break: break-word;
  }

  .table td:last-child {
    border-bottom: none;
    justify-content: center;
    gap: 0.5rem;
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

  .modal {
    width: 95% !important;
    max-width: 100% !important;
    margin: 0 auto;
  }
}
</style>
