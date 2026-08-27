<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="quick-view-overlay" @click.self="$emit('close')">
        <div class="quick-view-modal">
          <button class="close-btn" @click="$emit('close')">✕</button>
          
          <div class="modal-content">
            <div class="modal-image">
              <img :src="getImageUrl(product.image)" :alt="product.name" />
              <div v-if="isOnSale" class="sale-tag">-{{ discountPercent }}%</div>
            </div>
            
            <div class="modal-info">
              <div class="product-category" v-if="product.category">
                {{ product.category.name }}
              </div>
              <h2 class="product-name">{{ product.name }}</h2>
              
              <div class="product-pricing">
                <span class="current-price">{{ formatPrice(currentPrice) }}</span>
                <span v-if="isOnSale" class="old-price">{{ formatPrice(product.price) }}</span>
              </div>
              
              <p class="product-description">{{ product.description || 'Không có mô tả' }}</p>
              
              <div class="product-stats">
                <div class="stat">
                  <span class="stat-label">Trạng thái</span>
                  <span class="stat-value" :class="stockClass">{{ stockText }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Đã bán</span>
                  <span class="stat-value">{{ product.sold_count || 0 }}</span>
                </div>
              </div>
              
              <div class="action-buttons">
                <div class="quantity-selector">
                  <button @click="decrementQuantity" :disabled="quantity <= 1">-</button>
                  <span>{{ quantity }}</span>
                  <button @click="incrementQuantity" :disabled="!product.is_preorder && quantity >= product.stock">+</button>
                </div>
                <div class="main-actions">
                  <button 
                    class="btn btn-secondary add-to-cart-btn" 
                    @click="addToCart"
                    :disabled="!product.is_preorder && product.stock === 0"
                  >
                    🛒 Thêm giỏ
                  </button>
                  <button 
                    class="btn btn-primary buy-now-btn" 
                    @click="buyNow"
                    :disabled="!product.is_preorder && product.stock === 0"
                  >
                    {{ product.is_preorder ? '📦 Đặt trước' : '⚡ Mua ngay' }}
                  </button>
                </div>
              </div>
              
              <router-link :to="`/products/${product.id}`" class="view-detail-link" @click="$emit('close')">
                Xem chi tiết sản phẩm →
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getImageUrl } from '../utils/image'
import { useCartStore } from '../stores/cart'
import { useToast } from '../composables/useToast'

const props = defineProps({
  show: Boolean,
  product: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const router = useRouter()
const cartStore = useCartStore()
const { toast } = useToast()
const quantity = ref(1)

const currentPrice = computed(() => props.product.sale_price || props.product.price)
const isOnSale = computed(() => props.product.sale_price && props.product.sale_price < props.product.price)
const discountPercent = computed(() => {
  if (!isOnSale.value) return 0
  return Math.round((1 - props.product.sale_price / props.product.price) * 100)
})

const stockClass = computed(() => ({
  'text-preorder': props.product.is_preorder,
  'text-success': !props.product.is_preorder && props.product.stock > 10,
  'text-warning': !props.product.is_preorder && props.product.stock > 0 && props.product.stock <= 10,
  'text-danger': !props.product.is_preorder && props.product.stock === 0,
}))

const stockText = computed(() => {
  if (props.product.is_preorder) return 'Đặt trước'
  if (props.product.stock === 0) return 'Hết hàng'
  if (props.product.stock <= 10) return `Còn ${props.product.stock}`
  return 'Còn hàng'
})

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price)
}

const incrementQuantity = () => {
  if (props.product.is_preorder || quantity.value < props.product.stock) {
    quantity.value++
  }
}

const decrementQuantity = () => {
  if (quantity.value > 1) {
    quantity.value--
  }
}

const addToCart = () => {
  cartStore.addItem(props.product, quantity.value)
  toast.success('Đã thêm vào giỏ hàng!')
}

const buyNow = () => {
  cartStore.addItem(props.product, quantity.value)
  emit('close')
  router.push('/checkout')
}
</script>

<style scoped>
.quick-view-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.quick-view-modal {
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  max-width: 900px;
  width: 100%;
  max-height: 95vh; /* Tăng nhẹ để tận dụng không gian mobile */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
}

.modal-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.modal-image {
  position: relative;
  height: 100%;
  min-height: 400px;
  background: var(--bg-tertiary);
}

.modal-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sale-tag {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1.1rem;
}

.modal-info {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  flex: 1; /* Để phần info tự co giãn và scroll nếu cần */
}

.product-category {
  color: var(--primary-light);
  font-size: 0.85rem;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.product-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.product-pricing {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.current-price {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--secondary);
}

.old-price {
  font-size: 1.1rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.product-description {
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 0.95rem;
}

.product-stats {
  display: flex;
  gap: 2rem;
  padding: 1rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.stat-value {
  font-weight: 600;
  font-size: 1rem;
}

.main-actions {
  flex: 1;
  display: flex;
  gap: 0.75rem;
}

.add-to-cart-btn,
.buy-now-btn {
  flex: 1;
  padding: 0.875rem;
  font-size: 0.95rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.add-to-cart-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text);
}

.add-to-cart-btn:hover:not(:disabled) {
  background: var(--border);
}

.view-detail-link {
  color: var(--primary-light);
  text-align: center;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.view-detail-link:hover {
  color: var(--primary);
}

.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-danger { color: var(--danger); }
.text-preorder { color: #d97706; font-weight: 600; }

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .quick-view-modal,
.modal-leave-to .quick-view-modal {
  transform: scale(0.9) translateY(20px);
}

/* Responsive */
@media (max-width: 768px) {
  .quick-view-modal {
    max-height: 92vh;
  }

  .modal-content {
    grid-template-columns: 1fr;
    height: 100%;
    overflow-y: auto;
  }
  
  .modal-image {
    min-height: 180px; /* Thu nhỏ đáng kể ảnh trên mobile */
    height: 180px;
  }
  
  .modal-info {
    padding: 1.25rem;
    gap: 0.75rem;
    overflow-y: visible; /* Để container cha lo việc scroll */
  }
  
  .product-name {
    font-size: 1.2rem;
  }

  .current-price {
    font-size: 1.4rem;
  }
  
  .action-buttons {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .main-actions {
    width: 100%;
  }
  
  .quantity-selector {
    padding: 0.25rem;
    justify-content: center;
  }

  .quantity-selector button {
    width: 32px;
    height: 32px;
  }
  
  .add-to-cart-btn,
  .buy-now-btn {
    padding: 0.875rem;
    font-size: 0.9rem;
  }
}

@media (max-width: 400px) {
  .modal-image {
    height: 150px;
    min-height: 150px;
  }
  .action-buttons {
    flex-direction: column;
  }
}
</style>
