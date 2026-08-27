<template>
  <div class="products-page">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Sản phẩm</h1>
        <p class="page-subtitle">Tất cả sản phẩm đang bán</p>
      </div>

      <!-- Filters -->
      <div class="filters">
        <select v-model="filters.category" class="form-input filter-select" @change="loadProducts">
          <option value="">Tất cả danh mục</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>

        <select v-model="filters.sort" class="form-input filter-select" @change="loadProducts">
          <option value="">Mới nhất</option>
          <option value="price_asc">Giá thấp → cao</option>
          <option value="price_desc">Giá cao → thấp</option>
          <option value="name">Tên A-Z</option>
        </select>

        <input 
          v-model="filters.search" 
          type="text" 
          class="form-input filter-search" 
          placeholder="Tìm kiếm..."
          @input="debouncedSearch"
        />
      </div>

      <!-- Products Grid -->
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      
      <div v-else-if="products.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <h3 class="empty-title">Không có sản phẩm</h3>
        <p class="empty-text">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
      </div>

      <div v-else class="grid grid-4">
        <ProductCard v-for="product in products" :key="product.id" :product="product" />
      </div>

      <!-- Pagination -->
      <div v-if="pagination.lastPage > 1" class="pagination">
        <button 
          class="btn btn-secondary btn-sm" 
          :disabled="pagination.currentPage === 1"
          @click="changePage(pagination.currentPage - 1)"
        >
          ← Trước
        </button>
        <span class="pagination-info">
          Trang {{ pagination.currentPage }} / {{ pagination.lastPage }}
        </span>
        <button 
          class="btn btn-secondary btn-sm" 
          :disabled="pagination.currentPage === pagination.lastPage"
          @click="changePage(pagination.currentPage + 1)"
        >
          Sau →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { shopApi } from '../api'
import ProductCard from '../components/ProductCard.vue'

const route = useRoute()
const loading = ref(true)
const products = ref([])
const categories = ref([])

const filters = reactive({
  category: '',
  sort: '',
  search: '',
})

const pagination = reactive({
  currentPage: 1,
  lastPage: 1,
  total: 0,
})

let searchTimeout = null
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.currentPage = 1
    loadProducts()
  }, 300)
}

const loadProducts = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      per_page: 12,
    }
    if (filters.category) params.category_id = filters.category
    if (filters.sort) params.sort = filters.sort
    if (filters.search) params.search = filters.search

    const response = await shopApi.getProducts(params)
    products.value = response.data.data
    pagination.currentPage = response.data.current_page
    pagination.lastPage = response.data.last_page
    pagination.total = response.data.total
  } catch (error) {
    console.error('Failed to load products:', error)
  } finally {
    loading.value = false
  }
}

const loadCategories = async () => {
  try {
    const response = await shopApi.getCategories()
    categories.value = response.data
  } catch (error) {
    console.error('Failed to load categories:', error)
  }
}

const changePage = (page) => {
  pagination.currentPage = page
  loadProducts()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(async () => {
  if (route.query.category) {
    filters.category = route.query.category
  }
  await loadCategories()
  await loadProducts()
})

watch(() => route.query.category, (newCategory) => {
  filters.category = newCategory || ''
  pagination.currentPage = 1
  loadProducts()
})
</script>

<style scoped>
.products-page {
  padding: 2rem 0;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.filter-select {
  width: auto;
  min-width: 180px;
}

.filter-search {
  flex: 1;
  min-width: 200px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 3rem;
}

.pagination-info {
  color: var(--text-secondary);
}
</style>
