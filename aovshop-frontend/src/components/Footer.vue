<template>
  <footer class="footer glass">
    <div class="container footer-content">
      <div class="footer-grid">
        <!-- Shop Info -->
        <div class="footer-section shop-info">
          <div class="footer-logo">
            <img v-if="settingsStore.shopLogo" :src="settingsStore.shopLogo" :alt="settingsStore.shopName" class="logo-img">
            <span v-else class="logo-text">{{ settingsStore.shopName }}</span>
          </div>
          <p class="shop-description">
            Cung cấp các dịch vụ game uy tín, chất lượng hàng đầu. Giao dịch tự động 24/7, hỗ trợ nhanh chóng.
          </p>
          <div class="social-links">
            <a v-if="settingsStore.contactMessenger" :href="settingsStore.contactMessenger" target="_blank" class="social-link messenger" title="Messenger">
              <i class="fab fa-facebook-messenger"></i>
            </a>
            <a v-if="settingsStore.contactZalo" :href="settingsStore.contactZalo" target="_blank" class="social-link zalo" title="Zalo">
              <span class="zalo-icon">Z</span>
            </a>
          </div>
        </div>

        <!-- Quick Links -->
        <div class="footer-section">
          <h4 class="section-title">Liên Kết Nhanh</h4>
          <ul class="footer-links">
            <li><router-link to="/">Trang Chủ</router-link></li>
            <li><router-link to="/products">Sản Phẩm</router-link></li>
            <li><router-link to="/categories">Danh Mục</router-link></li>
            <li><router-link to="/profile">Tài Khoản</router-link></li>
          </ul>
        </div>


        <!-- Contact Info -->
        <div class="footer-section contact-info">
          <h4 class="section-title">Liên Hệ</h4>
          <ul class="footer-contact">
            <li v-if="settingsStore.contactHotline">
              <span class="contact-label">Hotline:</span>
              <span class="contact-text"><strong>{{ settingsStore.contactHotline }}</strong></span>
            </li>
            <li>
              <span class="contact-label">Hỗ trợ:</span>
              <span class="contact-text">24/7</span>
            </li>
            <li>
              <span class="contact-label">Ghi chú:</span>
              <span class="contact-text">Hệ thống nạp thẻ tự động siêu nhanh.</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p>&copy; {{ currentYear }} <strong>{{ settingsStore.shopName }}</strong>. All rights reserved.</p>
        <div class="made-by">
          Thiết kế bởi <span class="author">Lượng chứ ai</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.footer {
  margin-top: 5rem;
  padding: 4rem 0 2rem;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  position: relative;
  overflow: hidden;
}

[data-theme="light"] .footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}

.footer-content {
  position: relative;
  z-index: 1;
}

.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.5fr;
  gap: 3rem;
  margin-bottom: 4rem;
}

.footer-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.footer-logo {
  display: flex;
  align-items: center;
}

.logo-img {
  height: 50px;
  object-fit: contain;
}

.logo-text {
  font-size: 2rem;
  font-weight: 800;
  color: var(--primary);
}

.shop-description {
  color: var(--text-secondary);
  font-size: 0.95rem;
  line-height: 1.6;
  max-width: 320px;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  position: relative;
  padding-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 40px;
  height: 2px;
  background: var(--primary);
  border-radius: 2px;
}

.footer-links {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.footer-links a {
  color: var(--text-secondary);
  transition: all 0.2s;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.footer-links a:hover {
  color: var(--primary);
  transform: translateX(5px);
  text-shadow: none;
}

.footer-contact {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.footer-contact li {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.contact-label {
  font-weight: 600;
  color: var(--text);
  font-size: 0.95rem;
  white-space: nowrap;
}

.contact-text {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.contact-text strong {
  color: var(--text);
}

.social-links {
  display: flex;
  gap: 1rem;
}

.social-link {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 1.25rem;
  transition: all 0.3s;
}

.social-link:hover {
  transform: translateY(-5px);
  background: var(--primary);
  border-color: var(--primary);
  color: white;
  box-shadow: var(--glow-primary);
}

.zalo-icon {
  font-weight: 800;
  font-size: 1.1rem;
}

.footer-bottom {
  padding-top: 2rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.author {
  color: var(--text);
  font-weight: 700;
}



.author {
  color: var(--text);
  font-weight: 600;
}

/* Responsive */
@media (max-width: 1024px) {
  .footer-grid {
    grid-template-columns: 1.5fr 1fr 1.5fr;
    gap: 2rem;
  }
}

@media (max-width: 768px) {
  .footer {
    padding: 3rem 0 2rem;
  }
  
  .footer-grid {
    grid-template-columns: 1fr 1fr;
    gap: 2.5rem;
  }
  
  .footer-bottom {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  
  .shop-description {
    max-width: 100%;
  }
}
</style>
