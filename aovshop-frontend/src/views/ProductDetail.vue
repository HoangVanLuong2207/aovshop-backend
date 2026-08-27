<template>
  <div class="product-detail-page">
    <div class="container">
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      
      <div v-else-if="product" class="product-detail">
        <div class="product-gallery">
          <div class="main-image-wrapper">
            <img 
              :src="getImageUrl(activeImage)" 
              :alt="product.name"
              class="product-main-image"
              :key="activeImage"
            />
            <div v-if="isOnSale" class="sale-badge-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              Flash Sale
            </div>
            <!-- Navigation arrows for gallery -->
            <template v-if="allImages.length > 1">
              <button class="gallery-nav gallery-nav-prev" @click="prevImage" aria-label="Previous">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button class="gallery-nav gallery-nav-next" @click="nextImage" aria-label="Next">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </template>
          </div>
          <!-- Thumbnails -->
          <div v-if="allImages.length > 1" class="gallery-thumbnails">
            <button
              v-for="(img, index) in allImages"
              :key="index"
              class="gallery-thumb-btn"
              :class="{ active: activeImageIndex === index }"
              @click="activeImageIndex = index"
            >
              <img :src="getImageUrl(img)" :alt="`Ảnh ${index + 1}`" />
            </button>
          </div>
        </div>

        <div class="product-content">
          <div class="product-category-badge" v-if="product.category">
            {{ product.category.name }}
          </div>
          
          <h1 class="product-title">{{ product.name }}</h1>
          
          <div class="product-pricing-lg">
            <span class="product-price-lg">{{ formatPrice(currentPrice) }}</span>
            <span v-if="isOnSale" class="product-price-old-lg">{{ formatPrice(product.price) }}</span>
            <span v-if="isOnSale" class="discount-percent">
              -{{ Math.round((1 - product.sale_price / product.price) * 100) }}%
            </span>
          </div>

          <div class="product-meta-lg">
            <div class="product-stock-status">
              <span class="stock-dot" :class="isPreorder ? 'bg-preorder' : (product?.stock > 0 ? 'bg-success' : 'bg-danger')"></span>
              <span :class="stockClass">{{ stockText }}</span>
            </div>
            <div class="product-sold-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
              Đã bán: {{ product.sold_count || 0 }}
            </div>
          </div>

          <div v-if="product.daily_buy_limit" class="daily-limit-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Giới hạn: Tối đa <strong>{{ product.daily_buy_limit }}</strong> sản phẩm / ngày / tài khoản</span>
          </div>

          <div v-if="product.minimum_order_quantity" class="daily-limit-notice">
            <span>Đơn tối thiểu: <strong>{{ product.minimum_order_quantity }}</strong> sản phẩm</span>
          </div>

          <div class="product-description" v-if="product.description">
            <h3>Mô tả</h3>
            <p>{{ product.description }}</p>
          </div>

          <div class="product-actions">
            <!-- Quantity control: no max limit for preorder, stock-limited for instant -->
            <div class="quantity-control">
              <button @click="quantity = Math.max(minimumQuantity, quantity - 1)">-</button>
              <input
                type="number"
                :value="quantity"
                @input="onQuantityInput"
                @blur="onQuantityBlur"
                :min="minimumQuantity"
                :max="isPreorder ? 9999 : product.stock"
              />
              <button @click="isPreorder ? quantity++ : quantity = Math.min(product.stock, quantity + 1)">+</button>
            </div>

            <div v-if="isPreorder" class="preorder-badge-inline">
              ⏳ Đặt trước
            </div>

            <button v-if="!isPreorder"
              class="btn btn-secondary btn-lg" 
              @click="addToCart"
              :disabled="product.stock === 0"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>
              Thêm vào giỏ
            </button>

            <button 
              class="btn btn-primary btn-lg" 
              @click="buyNow"
              :disabled="!isPreorder && product.stock === 0"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              {{ isPreorder ? '📦 Đặt trước ngay' : 'Mua ngay' }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <h3>Không tìm thấy sản phẩm</h3>
        <router-link to="/products" class="btn btn-primary">Quay lại</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { shopApi } from '../api'
import { useCartStore } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { getImageUrl } from '../utils/image'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const route = useRoute()
const router = useRouter()
const cartStore = useCartStore()
const authStore = useAuthStore()

const loading = ref(true)
const product = ref(null)
const quantity = ref(1)

const minimumQuantity = computed(() => Math.max(1, Number(product.value?.minimum_order_quantity) || 1))

const onQuantityInput = (event) => {
  const val = event.target.value
  if (val === '') return
  let num = parseInt(val, 10)
  if (isNaN(num) || num < minimumQuantity.value) {
    num = minimumQuantity.value
  }
  const maxStock = isPreorder.value ? 9999 : (product.value?.stock || 9999)
  if (num > maxStock) {
    num = maxStock
    event.target.value = maxStock
  }
  quantity.value = num
}

const onQuantityBlur = (event) => {
  const val = event.target.value
  let num = parseInt(val, 10)
  if (isNaN(num) || num < minimumQuantity.value) {
    num = minimumQuantity.value
  }
  const maxStock = isPreorder.value ? 9999 : (product.value?.stock || 9999)
  if (num > maxStock) {
    num = maxStock
  }
  event.target.value = num
  quantity.value = num
}
const activeImageIndex = ref(0)

// Combine main image + gallery images
const allImages = computed(() => {
  if (!product.value) return []
  const imgs = []
  if (product.value.image) imgs.push(product.value.image)
  if (product.value.images && product.value.images.length > 0) {
    const sortedGallery = [...product.value.images]
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(img => img.url)
    imgs.push(...sortedGallery)
  }
  return imgs
})

const activeImage = computed(() => {
  if (allImages.value.length === 0) return null
  return allImages.value[activeImageIndex.value] || allImages.value[0]
})

const prevImage = () => {
  activeImageIndex.value = activeImageIndex.value > 0
    ? activeImageIndex.value - 1
    : allImages.value.length - 1
}

const nextImage = () => {
  activeImageIndex.value = activeImageIndex.value < allImages.value.length - 1
    ? activeImageIndex.value + 1
    : 0
}

const currentPrice = computed(() => product.value?.sale_price || product.value?.price)
const isOnSale = computed(() => product.value?.sale_price && product.value.sale_price < product.value.price)

const stockClass = computed(() => ({
  'text-success': product.value?.stock > 10,
  'text-warning': product.value?.stock > 0 && product.value?.stock <= 10,
  'text-danger': !product.value?.is_preorder && product.value?.stock === 0,
  'text-preorder': product.value?.is_preorder,
}))

const isPreorder = computed(() => product.value?.is_preorder || false)

const stockText = computed(() => {
  if (!product.value) return ''
  if (product.value.is_preorder) return 'Sản phẩm đặt trước'
  if (product.value.stock === 0) return 'Hết hàng'
  if (product.value.stock <= 10) return `Số lượng có hạn: ${product.value.stock}`
  return `Còn hàng (${product.value.stock})`
})

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price)
}

const addToCart = () => {
  if (!authStore.isAuthenticated) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  cartStore.addItem(product.value, quantity.value)
  toast.success('Đã thêm vào giỏ hàng!')
}

const buyNow = () => {
  if (!authStore.isAuthenticated) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  cartStore.addItem(product.value, quantity.value)
  router.push({ name: 'checkout' })
}

onMounted(async () => {
  try {
    const response = await shopApi.getProduct(route.params.id)
    product.value = response.data
    quantity.value = minimumQuantity.value
  } catch (error) {
    console.error('Failed to load product:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.product-detail-page {
  padding: 1rem 0;
}

@media (min-width: 768px) {
  .product-detail-page {
    padding: 2rem 0;
  }
}

.product-detail {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
}

@media (max-width: 768px) {
  .product-detail {
    grid-template-columns: 1fr;
  }
}

.product-gallery {
  position: relative;
}

.main-image-wrapper {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.product-main-image {
  width: 100%;
  display: block;
  transition: opacity 0.3s ease;
}

.gallery-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 1.5rem;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 2;
}

.main-image-wrapper:hover .gallery-nav {
  opacity: 1;
}

.gallery-nav:hover {
  background: rgba(0, 0, 0, 0.75);
}

.gallery-nav-prev {
  left: 10px;
}

.gallery-nav-next {
  right: 10px;
}

.gallery-thumbnails {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.gallery-thumb-btn {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.gallery-thumb-btn.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
}

.gallery-thumb-btn:hover {
  border-color: var(--primary);
}

.gallery-thumb-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}

.sale-badge-lg {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(239, 68, 68, 0.95);
  backdrop-filter: blur(8px);
  color: white;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 1.5px;
  box-shadow: 0 8px 25px rgba(239, 68, 68, 0.4);
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-transform: uppercase;
  display: flex;
  align-items: center;
  pointer-events: none;
  animation: shine 3s infinite;
}

@keyframes shine {
  0% { opacity: 0.95; }
  50% { opacity: 1; box-shadow: 0 8px 30px rgba(239, 68, 68, 0.6); }
  100% { opacity: 0.95; }
}

.product-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.product-category-badge {
  display: inline-block;
  background: var(--bg-tertiary);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  width: fit-content;
}

.product-title {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

@media (min-width: 768px) {
  .product-title {
    font-size: 2rem;
  }
}

.product-pricing-lg {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.product-price-lg {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--secondary);
}

@media (min-width: 768px) {
  .product-price-lg {
    font-size: 2rem;
  }
}

.product-price-old-lg {
  font-size: 1.25rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.discount-percent {
  background: #fff5f5;
  color: #f03e3e;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  border: 1px solid #ffa8a8;
}

.product-stock-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
}

.stock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.bg-success { background-color: var(--success); }
.bg-danger { background-color: var(--danger); }

.product-meta-lg {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1rem;
}

.product-sold-lg {
  font-weight: 600;
  color: var(--secondary);
}

.product-stock-status {
  font-size: 1rem;
}

.product-description h3 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}

.product-description p {
  color: var(--text-secondary);
}

.product-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}

@media (max-width: 480px) {
  .product-actions {
    flex-direction: column;
    align-items: stretch;
  }
  
  .quantity-control {
    justify-content: center;
    margin-bottom: 0.5rem;
  }
  
  .product-actions .btn {
    width: 100%;
  }
}

.quantity-control {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.quantity-control button {
  width: 40px;
  height: 40px;
  border: none;
  background: none;
  color: var(--text);
  font-size: 1.25rem;
  cursor: pointer;
}

.quantity-control button:hover {
  background: var(--bg-tertiary);
}

.quantity-control input {
  width: 60px;
  height: 40px;
  border: none;
  background: none;
  text-align: center;
  color: var(--text);
  font-size: 1rem;
}

.quantity-control input::-webkit-outer-spin-button,
.quantity-control input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.quantity-control input[type=number] {
  -moz-appearance: textfield;
}

.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-danger { color: var(--danger); }
.text-preorder { color: #d97706; font-weight: 600; }
.bg-preorder { background-color: #f59e0b; }

.preorder-badge-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05));
  border: 1.5px solid rgba(245, 158, 11, 0.5);
  color: #d97706;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
}

.daily-limit-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.65rem 1rem;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.04));
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--radius-sm);
  color: #b45309;
  font-size: 0.88rem;
}

.daily-limit-notice strong {
  color: #92400e;
}
</style>
