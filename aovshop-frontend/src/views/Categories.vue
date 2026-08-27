<template>
  <div class="categories-page">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Danh mục sản phẩm</h1>
        <p class="page-subtitle">Khám phá các danh mục sản phẩm của chúng tôi</p>
      </div>

      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      
      <div v-else-if="categories.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <h3 class="empty-title">Chưa có danh mục nào</h3>
        <p class="empty-text">Các danh mục sẽ được hiển thị ở đây</p>
      </div>

      <div v-else class="categories-grid">
        <router-link 
          v-for="cat in categories" 
          :key="cat.id" 
          :to="`/products?category=${cat.id}`"
          class="category-card"
          :style="cat.image ? { backgroundImage: `url(${cat.image})` } : {}"
        >
          <div class="category-overlay"></div>
          <div class="category-content">
            <h3 class="category-name">{{ cat.name }}</h3>
            <p class="category-count">{{ cat.products_count || 0 }} sản phẩm</p>
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { shopApi } from '../api'

const loading = ref(true)
const categories = ref([])

const loadCategories = async () => {
  loading.value = true
  try {
    const response = await shopApi.getCategories()
    categories.value = response.data
  } catch (error) {
    console.error('Failed to load categories:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadCategories()
})
</script>

<style scoped>
.categories-page {
  padding: 2rem 0;
  min-height: 60vh;
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.category-card {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 180px;
  border-radius: var(--radius);
  overflow: hidden;
  text-decoration: none;
  color: white;
  background-size: cover;
  background-position: center;
  background-color: var(--bg-tertiary);
  transition: all 0.3s ease;
}

.category-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 100%);
  transition: all 0.3s ease;
}

.category-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
}

.category-card:hover .category-overlay {
  background: linear-gradient(to top, rgba(99,102,241,0.8) 0%, rgba(0,0,0,0.3) 100%);
}

.category-content {
  position: relative;
  z-index: 1;
  padding: 1.5rem;
  width: 100%;
}

.category-name {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.category-count {
  font-size: 0.875rem;
  opacity: 0.9;
  margin: 0;
}

@media (max-width: 480px) {
  .categories-grid {
    grid-template-columns: 1fr;
  }
  
  .category-card {
    min-height: 140px;
  }
}
</style>

