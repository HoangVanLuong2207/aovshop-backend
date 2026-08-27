<template>
  <div class="admin-categories">
    <div class="page-header flex-between">
      <h1 class="page-title">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>
        Quản lý danh mục
      </h1>
      <button class="btn btn-primary" @click="openModal()">+ Thêm danh mục</button>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <div v-else>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Tên danh mục</th>
            <th>Mô tả</th>
            <th>Sản phẩm</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in categories" :key="cat.id">
            <td data-label="ID">{{ cat.id }}</td>
            <td data-label="Tên">{{ cat.name }}</td>
            <td data-label="Mô tả" class="text-muted-desc">{{ cat.description || '-' }}</td>
            <td data-label="Sản phẩm">{{ cat.products_count }}</td>
            <td data-label="Trạng thái">
              <span :class="['badge', cat.active ? 'badge-success' : 'badge-danger']">
                {{ cat.active ? 'Hoạt động' : 'Ẩn' }}
              </span>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" @click="openModal(cat)">Sửa</button>
              <button class="btn btn-danger btn-sm" @click="deleteCategory(cat)">Xóa</button>
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
    </div>

    <!-- Modal -->
    <Transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">{{ editing ? 'Sửa danh mục' : 'Thêm danh mục' }}</h3>
            <button class="modal-close" @click="closeModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Tên danh mục *</label>
              <input v-model="form.name" type="text" class="form-input" required />
            </div>
            <div class="form-group">
              <label class="form-label">Mô tả</label>
              <textarea v-model="form.description" class="form-input" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">URL hình ảnh</label>
              <input v-model="form.image" type="text" class="form-input" placeholder="https://example.com/image.jpg" />
              <small v-if="form.image && !isDirectLink(form.image)" class="text-warning d-block mt-1">
                ⚠️ Có vẻ bạn đang dùng link trang web thay vì link ảnh trực tiếp. Hãy dùng "Direct link" (kết thúc bằng .jpg, .png, ...).
              </small>
              <div v-if="form.image" class="image-preview">
                <img :src="form.image" alt="Preview" @error="handleImageError" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" v-model="form.active" /> Hoạt động
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeModal">Hủy</button>
            <button class="btn btn-primary" @click="saveCategory" :disabled="saving">
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
import { isDirectLink, convertDriveLink } from '../../utils/image'
import Pagination from '../../components/Pagination.vue'

const { toast, confirm } = useToast()

const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const categories = ref([])

// Pagination
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const totalPages = ref(0)


const form = reactive({
  name: '',
  description: '',
  image: '',
  active: true,
})

// Tự động chuyển đổi link Google Drive
watch(() => form.image, (newVal) => {
  if (newVal) {
    const converted = convertDriveLink(newVal)
    if (converted !== newVal) {
      form.image = converted
    }
  }
})

const loadCategories = async () => {
  loading.value = true
  try {
    const response = await adminApi.getCategories({ 
      page: page.value, 
      limit: limit.value 
    })
    categories.value = response.data.data
    total.value = response.data.pagination.total
    totalPages.value = response.data.pagination.totalPages
  } catch (error) {
    console.error('Failed to load categories:', error)
    toast.error('Lỗi khi tải danh mục')
  } finally {
    loading.value = false
  }
}

// Watch for pagination changes
watch([page, limit], loadCategories)

const handleImageError = (e) => {
  e.target.src = 'https://via.placeholder.com/200x150?text=Invalid+URL'
}


const openModal = (cat = null) => {
  editing.value = cat
  if (cat) {
    form.name = cat.name
    form.description = cat.description || ''
    form.image = cat.image || ''
    form.active = cat.active
  } else {
    form.name = ''
    form.description = ''
    form.image = ''
    form.active = true
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editing.value = null
}

const saveCategory = async () => {
  if (!form.name) {
    toast.error('Vui lòng nhập tên danh mục')
    return
  }
  
  saving.value = true
  try {
    const data = {
      name: form.name,
      description: form.description,
      image: form.image,
      active: form.active
    }

    if (editing.value) {
      await adminApi.updateCategory(editing.value.id, data)
      const index = categories.value.findIndex(c => c.id === editing.value.id)
      if (index !== -1) {
        categories.value[index].name = form.name
        categories.value[index].description = form.description
        categories.value[index].image = form.image
        categories.value[index].active = form.active
      }
      toast.success('Cập nhật danh mục thành công!')
    } else {
      await adminApi.createCategory(data)
      await loadCategories()
      toast.success('Thêm danh mục thành công!')
    }
    
    closeModal()
  } catch (error) {
    toast.error(error.response?.data?.message || 'Lưu thất bại')
  } finally {
    saving.value = false
  }
}

const deleteCategory = async (cat) => {
  const confirmed = await confirm(`Xóa danh mục "${cat.name}"?`, { type: 'danger', title: 'Xóa danh mục' })
  if (!confirmed) return
  
  try {
    await adminApi.deleteCategory(cat.id)
    // Optimized: Update local state
    categories.value = categories.value.filter(c => c.id !== cat.id)
  } catch (error) {
    toast.error(error.response?.data?.message || 'Xóa thất bại')
  }
}

onMounted(loadCategories)
</script>

<style scoped>
.admin-categories {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.image-preview {
  margin-top: 0.75rem;
}

.image-preview img {
  max-width: 200px;
  max-height: 150px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.text-muted-desc {
  color: var(--text-muted);
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

  .text-muted-desc {
    word-break: break-word;
  }

  .modal {
    width: 95% !important;
    max-width: 100% !important;
    margin: 0 auto;
  }
}
</style>

