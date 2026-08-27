<template>
  <div class="top-deposit">
    <h3 class="top-deposit-title">TOP NẠP</h3>

    <!-- Tabs -->
    <div class="top-deposit-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="leaderboard-skeleton">
      <div v-for="n in 5" :key="'skel-' + n" class="skeleton-row">
        <div class="skeleton-rank"></div>
        <div class="skeleton-name"></div>
        <div class="skeleton-amount"></div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="leaderboard-error">
      <p>Không tải được dữ liệu</p>
      <button class="btn-retry" @click="fetchData">Thử lại</button>
    </div>

    <!-- Leaderboard Content -->
    <div v-else class="leaderboard-list">
      <div
        v-for="(item, idx) in paddedLeaderboard"
        :key="idx"
        class="leaderboard-row"
        :class="{ 'top-1': idx === 0 && item.filled, 'top-2': idx === 1 && item.filled, 'top-3': idx === 2 && item.filled, 'row-empty': !item.filled }"
      >
        <div class="rank">
          <span v-if="idx < 3" class="rank-medal">{{ rankMedals[idx] }}</span>
          <span v-else class="rank-number">{{ idx + 1 }}</span>
        </div>
        <div class="user-info">
          <span class="user-name">{{ item.filled ? item.display_name : '---' }}</span>
          <span v-if="item.filled && item.deposit_count" class="deposit-count">{{ item.deposit_count }} lần</span>
        </div>
        <div class="deposit-amount">{{ item.filled ? formatPrice(item.total_deposit) : '---' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { shopApi } from '../api'

const loading = ref(true)
const error = ref(false)
const data = ref(null)
const activeTab = ref('all')
let refreshInterval = null

const tabs = [
  { key: 'all', label: 'Tổng' },
  { key: 'month', label: 'Tháng' },
  { key: 'week', label: 'Tuần' },
]

const rankMedals = ['1', '2', '3']

const currentLeaderboard = computed(() => {
  if (!data.value?.periods) return []
  const period = data.value.periods[activeTab.value]
  return period?.leaderboard || []
})

const paddedLeaderboard = computed(() => {
  const list = currentLeaderboard.value.map(item => ({ ...item, filled: true }))
  while (list.length < 5) {
    list.push({ filled: false })
  }
  return list
})

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price)
}

const fetchData = async () => {
  try {
    error.value = false
    loading.value = true
    const res = await shopApi.getTopDeposit()
    data.value = res.data
  } catch (err) {
    console.error('Failed to fetch top deposit:', err)
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  // Refresh every 3 minutes
  refreshInterval = setInterval(fetchData, 3 * 60 * 1000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})
</script>

<style scoped>
.top-deposit {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.top-deposit-title {
  background: var(--primary);
  color: #fff;
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 1px;
  margin: 0;
}

/* Tabs */
.top-deposit-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  flex: 1;
  padding: 0.6rem 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text);
  background: var(--bg-tertiary);
}

.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Leaderboard List */
.leaderboard-list {
  padding: 0.5rem 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.leaderboard-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem;
  transition: background 0.15s;
  flex: 1;
}

.leaderboard-row:hover {
  background: var(--bg-tertiary);
}

.leaderboard-row.top-1 {
  background: rgba(255, 193, 7, 0.06);
}

.leaderboard-row.top-2 {
  background: rgba(158, 158, 158, 0.06);
}

.leaderboard-row.top-3 {
  background: rgba(205, 127, 50, 0.06);
}

/* Rank */
.rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rank-medal {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  color: #fff;
}

.top-1 .rank-medal {
  background: linear-gradient(135deg, #FFD700, #FFA000);
  box-shadow: 0 2px 6px rgba(255, 215, 0, 0.3);
}

.top-2 .rank-medal {
  background: linear-gradient(135deg, #C0C0C0, #9E9E9E);
  box-shadow: 0 2px 6px rgba(158, 158, 158, 0.3);
}

.top-3 .rank-medal {
  background: linear-gradient(135deg, #CD7F32, #A0522D);
  box-shadow: 0 2px 6px rgba(205, 127, 50, 0.3);
}

.rank-number {
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

/* User Info */
.user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.deposit-count {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* Amount */
.deposit-amount {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--primary);
  white-space: nowrap;
}

/* Empty */
.leaderboard-empty {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Error */
.leaderboard-error {
  text-align: center;
  padding: 1.5rem 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.btn-retry {
  margin-top: 0.5rem;
  padding: 0.35rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Skeleton */
.leaderboard-skeleton {
  padding: 0.5rem 0;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
}

.skeleton-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-name {
  flex: 1;
  height: 14px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  animation-delay: 0.1s;
}

.skeleton-amount {
  width: 70px;
  height: 14px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  animation-delay: 0.2s;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
</style>
