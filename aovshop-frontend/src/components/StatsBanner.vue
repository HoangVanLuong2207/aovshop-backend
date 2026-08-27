<template>
  <div class="stats-banner glass">
    <div class="stat-item">
      <div class="stat-value">{{ productCount }}+</div>
      <div class="stat-label">Sản phẩm</div>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <div class="stat-value">{{ soldCount }}+</div>
      <div class="stat-label">Đã bán</div>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item">
      <div class="stat-value">100%</div>
      <div class="stat-label">Uy tín</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  products: {
    type: Array,
    default: () => []
  }
})

const productCount = computed(() => props.products.length)
const soldCount = computed(() => {
  return props.products.reduce((acc, curr) => acc + (parseInt(curr.sold_count) || 0), 0)
})
</script>

<style scoped>
.stats-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 1.5rem 3rem;
  border-radius: var(--radius-lg);
  margin-top: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 15, 26, 0.6);
  backdrop-filter: blur(12px);
  max-width: fit-content;
  margin-left: auto;
  margin-right: auto;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text);
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  margin-top: 0.25rem;
}

.stat-divider {
  width: 1px;
  height: 40px;
  background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.2), transparent);
}

@media (max-width: 640px) {
  .stats-banner {
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    width: 100%;
  }
  
  .stat-divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);
  }
}
</style>
