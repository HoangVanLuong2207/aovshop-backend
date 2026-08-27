<template>
  <div class="checkout-page">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">💳 Thanh toán</h1>
      </div>

      <div v-if="cartStore.isEmpty" class="empty-state">
        <h3>Giỏ hàng trống</h3>
        <router-link to="/products" class="btn btn-primary">Mua sắm ngay</router-link>
      </div>

      <div v-else class="checkout-content">
        <!-- Order Items -->
        <div class="checkout-items">
          <h3>Sản phẩm ({{ cartStore.itemCount }})</h3>
          <div v-for="item in cartStore.items" :key="item.id" class="checkout-item">
            <img 
              :src="getImageUrl(item.image)" 
              :alt="item.name"
            />
            <div class="item-info">
              <h4>{{ item.name }}</h4>
              <p>{{ formatPrice(item.sale_price || item.price) }} × {{ item.quantity }}</p>
              <div class="item-qty-control">
                <button @click="updateQuantity(item.id, item.quantity - 1, item.stock)">-</button>
                <input 
                  type="number"
                  :value="item.quantity"
                  @input="onQuantityInput(item, $event)"
                  @blur="onQuantityBlur(item, $event)"
                  :min="minimumQuantity(item)"
                  :max="item.is_preorder ? 9999 : item.stock"
                  class="quantity-input"
                />
                <button
                  @click="updateQuantity(item.id, item.quantity + 1, item.stock)"
                  :disabled="!item.is_preorder && item.quantity >= item.stock"
                  :title="!item.is_preorder && item.quantity >= item.stock ? 'Đã đạt giới hạn kho' : ''"
                >+</button>
              </div>
            </div>
            <div class="item-total">
              {{ formatPrice((item.sale_price || item.price) * item.quantity) }}
            </div>
            <div v-if="item.daily_buy_limit" class="item-daily-limit">
              🔒 Max {{ item.daily_buy_limit }}/ngày
            </div>
            <div v-if="item.minimum_order_quantity" class="item-daily-limit">
              Tối thiểu {{ item.minimum_order_quantity }} sản phẩm
            </div>
          </div>

          <!-- Promo Code -->
          <div class="promo-section">
            <h3>Mã khuyến mãi</h3>
            <div class="promo-input">
              <input 
                v-model="promoCode" 
                type="text" 
                class="form-input" 
                placeholder="Nhập mã giảm giá"
                :disabled="appliedPromo"
              />
              <button 
                v-if="!appliedPromo"
                class="btn btn-secondary" 
                @click="applyPromo"
                :disabled="!promoCode || applyingPromo"
              >
                {{ applyingPromo ? '...' : 'Áp dụng' }}
              </button>
              <button v-else class="btn btn-danger btn-sm" @click="removePromo">Hủy</button>
            </div>
            <p v-if="promoError" class="text-danger" style="margin-top: 0.5rem">{{ promoError }}</p>
            <p v-if="appliedPromo" class="text-success" style="margin-top: 0.5rem">
              ✓ {{ appliedPromo.name }} - Giảm {{ formatPrice(discount) }}
            </p>
          </div>

          <!-- Contact Info (required for all orders) -->
          <div class="note-section" :class="{ 'preorder-note-section': hasPreorderItems }">
            <div v-if="hasPreorderItems" class="preorder-badge-header">
              <span class="preorder-icon">⏳</span>
              <div>
                <h3>Thông tin liên hệ <span class="required-star">*</span></h3>
                <p class="preorder-hint">Sản phẩm đặt trước — vui lòng cung cấp thông tin cần thiết bên dưới để shop xử lý đơn hàng của bạn</p>
              </div>
            </div>
            <h3 v-else>Thông tin liên hệ <span class="required-star">*</span></h3>
            <textarea 
              v-model="contactInfo" 
              class="form-input"
              :class="{ 'preorder-input': hasPreorderItems, 'input-error': contactInfoError }"
              rows="4" 
              :placeholder="hasPreorderItems 
                ? preorderPlaceholder
                : 'Số điện thoại, tên, hoặc thông tin liên lạc khác'"
              required
            ></textarea>
            <p v-if="contactInfoError" class="text-danger mt-1">⚠️ {{ contactInfoError }}</p>
          </div>
        </div>

        <!-- Summary -->
        <div class="checkout-summary">
          <h3>Tổng thanh toán</h3>
          <div class="summary-row">
            <span>Tạm tính</span>
            <span>{{ formatPrice(cartStore.subtotal) }}</span>
          </div>
          <div v-if="discount > 0" class="summary-row discount">
            <span>Giảm giá</span>
            <span>-{{ formatPrice(discount) }}</span>
          </div>
          <div class="summary-total">
            <span>Tổng cộng</span>
            <span>{{ formatPrice(total) }}</span>
          </div>

          <div class="balance-check">
            <p>Số dư hiện tại: <strong>{{ formatPrice(authStore.balance) }}</strong></p>
            <p v-if="authStore.balance < total" class="text-danger">
              ⚠️ Số dư không đủ. Vui lòng nạp thêm tiền.
            </p>
          </div>

          <button 
            class="btn btn-primary btn-lg" 
            style="width: 100%"
            @click="placeOrder"
            :disabled="processing || authStore.balance < total"
          >
            {{ processing ? 'Đang xử lý...' : (hasPreorderItems ? '📦 Đặt hàng Pre-order' : '💳 Thanh toán') }}
          </button>

          <router-link 
            v-if="authStore.balance < total" 
            to="/deposit" 
            class="btn btn-success" 
            style="width: 100%; margin-top: 0.5rem"
          >
            Nạp tiền →
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import { useAuthStore } from '../stores/auth'
import { orderApi } from '../api'
import { getImageUrl } from '../utils/image'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const router = useRouter()
const cartStore = useCartStore()
const authStore = useAuthStore()

const promoCode = ref('')
const appliedPromo = ref(null)
const discount = ref(0)
const promoError = ref('')
const applyingPromo = ref(false)
const contactInfo = ref('')
const contactInfoError = ref('')
const processing = ref(false)

const minimumQuantity = (item) => Math.max(1, Number(item.minimum_order_quantity) || 1)

const hasPreorderItems = computed(() =>
  cartStore.items.some(item => item.is_preorder)
)

const preorderPlaceholder = computed(() => {
  const placeholders = cartStore.items
    .filter(item => item.is_preorder && item.preorder_placeholder)
    .map(item => item.preorder_placeholder);
  
  if (placeholders.length > 0) {
    // Unique placeholders only
    return [...new Set(placeholders)].join(', ');
  }
  return 'Ví dụ: Số điện thoại zalo, link fb,... mình liên lạc lại để thông báo khi thể lệ ra mắt';
})

const total = computed(() => cartStore.subtotal - discount.value)

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price)
}

const applyPromo = async () => {
  if (!promoCode.value) return
  
  applyingPromo.value = true
  promoError.value = ''
  
  try {
    const promoItems = cartStore.items.map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      price: item.price,
      sale_price: item.sale_price,
    }))

    const response = await orderApi.applyPromotion({
      code: promoCode.value,
      subtotal: cartStore.subtotal,
      items: promoItems,
    })
    appliedPromo.value = response.data.promotion
    discount.value = response.data.discount
  } catch (error) {
    promoError.value = error.response?.data?.message || 'Mã không hợp lệ'
  } finally {
    applyingPromo.value = false
  }
}

const removePromo = () => {
  appliedPromo.value = null
  discount.value = 0
  promoCode.value = ''
  promoError.value = ''
}

const updateQuantity = (productId, quantity, stock) => {
  if (quantity < 1) {
    cartStore.removeItem(productId)
    if (cartStore.isEmpty) {
      removePromo()
    }
    return
  }
  cartStore.updateQuantity(productId, quantity, stock)
}

const onQuantityInput = (item, event) => {
  const val = event.target.value
  if (val === '') return
  let num = parseInt(val, 10)
  if (isNaN(num) || num < minimumQuantity(item)) {
    num = minimumQuantity(item)
  }
  const maxStock = item.is_preorder ? 9999 : (item.stock || 9999)
  if (num > maxStock) {
    num = maxStock
    event.target.value = maxStock
  }
  cartStore.updateQuantity(item.id, num, item.stock)
}

const onQuantityBlur = (item, event) => {
  const val = event.target.value
  let num = parseInt(val, 10)
  if (isNaN(num) || num < minimumQuantity(item)) {
    num = minimumQuantity(item)
  }
  const maxStock = item.is_preorder ? 9999 : (item.stock || 9999)
  if (num > maxStock) {
    num = maxStock
  }
  event.target.value = num
  cartStore.updateQuantity(item.id, num, item.stock)
}

const placeOrder = async () => {
  contactInfoError.value = ''

  if (!contactInfo.value.trim()) {
    contactInfoError.value = 'Vui lòng điền thông tin liên hệ trước khi đặt hàng'
    return
  }

  processing.value = true
  
  try {
    const response = await orderApi.checkout({
      items: cartStore.getCheckoutItems(),
      promo_code: appliedPromo.value?.code || null,
      note: contactInfo.value,
      customer_note: hasPreorderItems.value ? contactInfo.value : null,
    })
    
    await authStore.fetchProfile()
    cartStore.clearCart()
    
    const msg = response.data.message || 'Thành công!'
    toast.success(msg)
    router.push('/orders')
  } catch (error) {
    console.error('Checkout error:', error)
    toast.error(error.response?.data?.message || 'Thanh toán thất bại: ' + error.message)
  } finally {
    processing.value = false
  }
}
</script>

<style scoped>
.checkout-page {
  padding: 1rem 0;
}

@media (min-width: 768px) {
  .checkout-page {
    padding: 2rem 0;
  }
}

.checkout-content {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 2rem;
}

@media (max-width: 900px) {
  .checkout-content {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  
  .checkout-summary {
    position: static; /* Bỏ sticky trên mobile để tránh lỗi layout */
    order: 2; /* Đẩy summary xuống dưới cùng nếu cần */
  }
}

.checkout-items {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.checkout-items h3 {
  margin-bottom: 0.5rem;
}

.checkout-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1rem;
}

.checkout-item img {
  width: 70px;
  height: 70px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

@media (max-width: 480px) {
  .checkout-item {
    padding: 0.75rem;
    gap: 0.75rem;
  }
  .checkout-item img {
    width: 60px;
    height: 60px;
  }
  .checkout-item .item-info h4 {
    font-size: 0.85rem;
  }
  .checkout-item .item-total {
    font-size: 0.9rem;
  }
}

.checkout-item .item-info {
  flex: 1;
}

.checkout-item .item-info h4 {
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.checkout-item .item-info p {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.item-qty-control {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 0.25rem;
}

.item-qty-control button {
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.item-qty-control button:hover {
  background: var(--bg-secondary);
}

.item-qty-control input {
  width: 50px;
  height: 30px;
  border: none;
  background: none;
  text-align: center;
  color: var(--text);
  font-size: 0.95rem;
}

.item-qty-control input::-webkit-outer-spin-button,
.item-qty-control input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.item-qty-control input[type=number] {
  -moz-appearance: textfield;
}

.checkout-item .item-total {
  font-weight: 600;
}

.promo-section, .note-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
}

.promo-input {
  display: flex;
  gap: 0.5rem;
}

.promo-input .form-input {
  flex: 1;
}

.checkout-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  height: fit-content;
  position: sticky;
  top: 100px;
}

.checkout-summary h3 {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  color: var(--text-secondary);
}

.summary-row.discount {
  color: var(--success);
}

.summary-total {
  display: flex;
  justify-content: space-between;
  font-size: 1.25rem;
  font-weight: 700;
  padding-top: 1rem;
  margin-top: 1rem;
  margin-bottom: 1.5rem;
  border-top: 1px solid var(--border);
}

.balance-check {
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.balance-check p {
  font-size: 0.9rem;
}

.text-success { color: var(--success); }
.text-danger { color: var(--danger); }
.mt-1 { margin-top: 0.4rem; }

.preorder-note-section {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.03));
  border: 1.5px solid rgba(245, 158, 11, 0.5);
  border-radius: var(--radius);
  padding: 1.25rem;
}

.preorder-badge-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.preorder-icon {
  font-size: 1.5rem;
  line-height: 1;
  margin-top: 2px;
}

.preorder-badge-header h3 {
  margin: 0 0 0.25rem;
  color: #d97706;
  font-size: 1rem;
}

.preorder-hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

.preorder-input {
  border-color: rgba(245, 158, 11, 0.4) !important;
}

.preorder-input:focus {
  border-color: #f59e0b !important;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15) !important;
}

.required-star {
  color: var(--danger);
  margin-left: 2px;
}

.input-error {
  border-color: var(--danger) !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12) !important;
}

.item-daily-limit {
  font-size: 0.72rem;
  color: #b45309;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  align-self: center;
}
</style>
