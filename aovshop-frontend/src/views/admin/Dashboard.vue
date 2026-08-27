<template>
  <div class="dashboard">
    <h1 class="page-title">📊 Dashboard</h1>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <div v-else>
      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon orders">📋</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.total_orders }}</div>
            <div class="stat-label">Tổng đơn hàng</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pending">⏳</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pending_orders }}</div>
            <div class="stat-label">Chờ xử lý</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon completed">✓</div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.completed_orders }}</div>
            <div class="stat-label">Hoàn thành</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon revenue">💰</div>
          <div class="stat-info">
            <div class="stat-value">{{ formatPrice(stats.total_revenue) }}</div>
            <div class="stat-label">Tổng doanh thu</div>
          </div>
        </div>
      </div>

      <!-- Transaction Stats -->
      <div class="stats-grid mt-3">
        <div class="stat-card">
          <div class="stat-icon deposit">↓</div>
          <div class="stat-info">
            <div class="stat-value">{{ formatPrice(txStats.total_deposits) }}</div>
            <div class="stat-label">Tổng nạp tiền</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purchase">↑</div>
          <div class="stat-info">
            <div class="stat-value">{{ formatPrice(txStats.total_purchases) }}</div>
            <div class="stat-label">Tổng mua hàng</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pending">⏳</div>
          <div class="stat-info">
            <div class="stat-value">{{ txStats.pending_deposits }}</div>
            <div class="stat-label">Nạp tiền chờ duyệt</div>
          </div>
        </div>
      </div>

      <!-- Recent Activity Grid -->
      <div class="grid grid-2 gap-4 mt-4">
        <!-- Recent Orders -->
        <div class="card recent-activity">
          <div class="card-header flex-between">
            <span>📋 Đơn hàng gần đây</span>
            <router-link to="/admin/orders" class="text-primary text-sm">Xem tất cả</router-link>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Khách hàng</th>
                    <th>Tổng tiền</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="order in recentOrders" :key="order.id">
                    <td>#{{ order.id }}</td>
                    <td>
                      <div class="text-sm">{{ order.user?.name }}</div>
                      <small class="text-muted">{{ order.user?.email }}</small>
                    </td>
                    <td>{{ formatPrice(order.total) }}</td>
                    <td>
                      <span :class="['badge', order.status === 'completed' ? 'badge-success' : 'badge-warning']">
                        {{ order.status }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="recentOrders.length === 0">
                    <td colspan="4" class="text-center py-4 text-muted">Chưa có đơn hàng nào</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Recent Transactions -->
        <div class="card recent-activity">
          <div class="card-header flex-between">
            <span>💳 Giao dịch gần đây</span>
            <router-link to="/admin/transactions" class="text-primary text-sm">Xem tất cả</router-link>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Loại</th>
                    <th>Số tiền</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tx in recentTransactions" :key="tx.id">
                    <td>#{{ tx.id }}</td>
                    <td>
                      <span :class="['badge', tx.type === 'deposit' ? 'badge-success' : 'badge-primary']">
                        {{ tx.type === 'deposit' ? 'Nạp' : 'Mua' }}
                      </span>
                    </td>
                    <td :class="tx.type === 'deposit' ? 'text-success' : 'text-danger'">
                      {{ tx.type === 'deposit' ? '+' : '' }}{{ formatPrice(tx.amount) }}
                    </td>
                    <td class="text-sm">{{ formatDate(tx.createdAt) }}</td>
                  </tr>
                  <tr v-if="recentTransactions.length === 0">
                    <td colspan="4" class="text-center py-4 text-muted">Chưa có giao dịch nào</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions mt-4">
        <h3>Thao tác nhanh</h3>
        <div class="actions-grid">
          <router-link to="/admin/products" class="action-btn">
            ➕ Thêm sản phẩm
          </router-link>
          <router-link to="/admin/categories" class="action-btn">
            📁 Quản lý danh mục
          </router-link>
          <router-link to="/admin/promotions" class="action-btn">
            🎁 Tạo khuyến mãi
          </router-link>
          <router-link to="/admin/orders" class="action-btn">
            📋 Xem đơn hàng
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { adminApi } from '../../api'

const loading = ref(true)
const stats = reactive({
  total_orders: 0,
  pending_orders: 0,
  completed_orders: 0,
  total_revenue: 0,
})
const txStats = reactive({
  total_deposits: 0,
  total_purchases: 0,
  pending_deposits: 0,
})

const recentOrders = ref([])
const recentTransactions = ref([])

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price || 0)
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(async () => {
  try {
    const [orderRes, txRes, recentOrdersRes, recentTxRes] = await Promise.all([
      adminApi.getOrderStats(),
      adminApi.getTransactionStats(),
      adminApi.getOrders({ per_page: 10 }),
      adminApi.getTransactions({ per_page: 10 }),
    ])
    Object.assign(stats, orderRes.data)
    Object.assign(txStats, txRes.data)
    recentOrders.value = recentOrdersRes.data.data
    recentTransactions.value = recentTxRes.data.data
  } catch (error) {
    console.error('Failed to load stats:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .stat-card {
    padding: 1rem;
  }
  
  .stat-value {
    font-size: 1.25rem;
  }
}

.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.stat-icon.orders { background: rgba(99, 102, 241, 0.2); }
.stat-icon.pending { background: rgba(245, 158, 11, 0.2); }
.stat-icon.completed { background: rgba(34, 197, 94, 0.2); }
.stat-icon.revenue { background: rgba(16, 185, 129, 0.2); }
.stat-icon.deposit { background: rgba(34, 197, 94, 0.2); }
.stat-icon.purchase { background: rgba(239, 68, 68, 0.2); }

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.quick-actions h3 {
  margin-bottom: 1rem;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

@media (max-width: 1024px) {
  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .actions-grid {
    grid-template-columns: 1fr;
  }
  
  .action-btn {
    padding: 1rem;
  }
}

.action-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  text-align: center;
  color: var(--text);
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary);
  background: var(--bg-tertiary);
}

.grid {
  display: grid;
}

.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 992px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

.recent-activity {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.recent-activity .card-header {
  padding: 1rem;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.recent-activity .card-body {
  max-height: 400px;
  overflow-y: auto;
}

.table-responsive {
  width: 100%;
}

.text-sm {
  font-size: 0.875rem;
}

.ml-2 {
  margin-left: 0.5rem;
}

.p-0 {
  padding: 0 !important;
}

.mt-4 {
  margin-top: 1.5rem;
}

.gap-4 {
  gap: 1.5rem;
}
</style>
