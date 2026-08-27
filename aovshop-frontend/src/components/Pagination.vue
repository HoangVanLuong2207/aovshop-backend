<template>
  <div class="pagination-container">
    <div class="pagination-info">
      Hiển thị {{ start }} - {{ end }} trong tổng số {{ total }} bản ghi
    </div>
    
    <div class="pagination-controls">
      <div class="per-page-selector">
        <select :value="limit" @change="$emit('update:limit', Number($event.target.value))" class="form-input select-sm">
          <option :value="10">10 / trang</option>
          <option :value="20">20 / trang</option>
          <option :value="50">50 / trang</option>
        </select>
      </div>

      <div class="page-buttons">
        <button 
          class="btn btn-secondary btn-sm" 
          :disabled="page <= 1"
          @click="$emit('update:page', page - 1)"
        >
          ‹
        </button>
        
        <span class="page-indicator">
          Trang {{ page }} / {{ totalPages }}
        </span>

        <button 
          class="btn btn-secondary btn-sm" 
          :disabled="page >= totalPages"
          @click="$emit('update:page', page + 1)"
        >
          ›
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  page: { type: Number, required: true },
  limit: { type: Number, required: true },
  total: { type: Number, required: true },
  totalPages: { type: Number, required: true }
})

defineEmits(['update:page', 'update:limit'])

const start = computed(() => props.total === 0 ? 0 : (props.page - 1) * props.limit + 1)
const end = computed(() => Math.min(props.page * props.limit, props.total))
</script>

<style scoped>
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 1rem;
}

.pagination-info {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.per-page-selector .select-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  width: auto;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-indicator {
  font-size: 0.85rem;
  font-weight: 600;
  min-width: 80px;
  text-align: center;
}

.btn-sm {
  padding: 0.25rem 0.6rem;
  font-size: 1.1rem;
  line-height: 1;
}

@media (max-width: 600px) {
  .pagination-container {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}
</style>
