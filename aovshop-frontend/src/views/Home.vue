<template>
  <div class="home">


    <!-- Hero Section: Banner + Top Deposit -->
    <section class="hero-wrapper">
      <div class="container hero-grid">
        <!-- Banner Slider -->
        <div class="hero-banner">
          <div class="slider-container" v-if="bannerImages.length > 0">
            <div 
              class="slider-track" 
              :class="{ 'no-transition': isResetting }"
              :style="{ transform: `translateX(-${currentSlide * 100}%)` }"
            >
              <!-- Original slides + 1 cloned first slide for seamless loop -->
              <div 
                v-for="(banner, idx) in extendedBannerImages" 
                :key="idx" 
                class="slider-slide"
                :style="{ backgroundImage: `url(${banner})` }"
              ></div>
            </div>
          </div>
          <div v-else class="slider-fallback"></div>
          
          <!-- Content overlay -->
          <div class="hero-content">
            <div>
              <h1 class="hero-title">{{ settingsStore.shopName }}</h1>
              <p class="hero-subtitle">Shop acc 24/7</p>
              <button @click="scrollToCategories" class="btn btn-primary btn-lg">
                Khám phá ngay
              </button>
            </div>
          </div>
          
          <!-- Slider dots -->
          <div v-if="bannerImages.length > 1" class="slider-dots">
            <button 
              v-for="(_, idx) in bannerImages" 
              :key="idx" 
              class="slider-dot" 
              :class="{ active: currentSlide === idx }"
              @click="goToSlide(idx)"
            ></button>
          </div>
        </div>

        <!-- Top Deposit Leaderboard -->
        <div class="hero-deposit">
          <TopDepositLeaderboard />
        </div>
      </div>
    </section>

    <!-- Mobile Recent Orders (inline, only visible on mobile) -->
    <section v-if="recentOrders.length > 0" class="mobile-recent-orders">
      <div class="container">
        <div class="recent-orders-marquee">
          <div class="marquee-content">
            <span v-for="(order, idx) in recentOrders" :key="idx" class="marquee-item">
              <strong>{{ order.user }}</strong> vừa mua <strong>{{ order.product }}</strong>
              <span class="marquee-sep">•</span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Categories Carousel -->
    <section class="section" id="categories-section" ref="categoriesSection">
      <div class="container">
        <h2 class="section-title reveal">Danh mục sản phẩm</h2>
        <div v-if="loading" class="skeleton-grid">
          <div v-for="n in 3" :key="'skel-cat-' + n" class="skeleton-category-card">
            <div class="skeleton skeleton-icon"></div>
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div>
          </div>
        </div>
        <div v-else-if="categories.length > 0" class="carousel-wrapper">
          <button class="carousel-arrow carousel-arrow-left" @click="prevCategorySlide" v-if="categories.length > categoriesPerView">‹</button>
          <div class="carousel-container" ref="categoryCarousel">
            <div 
              class="carousel-track category-carousel-track"
              :class="{ 'no-transition': categoryResetting }"
              :style="{ transform: `translateX(-${categorySlide * (100 / categoriesPerView)}%)` }"
            >
              <div 
                v-for="(category, idx) in extendedCategories" 
                :key="'cat-' + idx"
                class="carousel-item category-slide"
                :style="{ width: `${100 / categoriesPerView}%` }"
              >
                <router-link 
                  :to="`/products?category=${category.id}`"
                  class="category-card"
                  :style="category.image ? { backgroundImage: `url(${getImageUrl(category.image)})` } : {}"
                >
                  <div class="category-overlay"></div>
                  <div class="category-content">
                    <h3>{{ category.name }}</h3>
                    <p>{{ category.products_count }} sản phẩm</p>
                  </div>
                </router-link>
              </div>
            </div>
          </div>
          <button class="carousel-arrow carousel-arrow-right" @click="nextCategorySlide" v-if="categories.length > categoriesPerView">›</button>
        </div>
      </div>
    </section>

    <!-- Featured Products Carousel -->
    <section class="section" v-if="featuredProducts.length">
      <div class="container">
        <h2 class="section-title reveal">Đang giảm giá</h2>
        <div class="carousel-wrapper">
          <button class="carousel-arrow carousel-arrow-left" @click="prevFeaturedSlide" v-if="featuredProducts.length > productsPerView">‹</button>
          <div class="carousel-container">
            <div 
              class="carousel-track"
              :class="{ 'no-transition': featuredResetting }"
              :style="{ transform: `translateX(-${featuredSlide * (100 / productsPerView)}%)` }"
            >
              <div 
                v-for="(product, idx) in extendedFeaturedProducts" 
                :key="'featured-' + idx"
                class="carousel-item"
                :style="{ width: `${100 / productsPerView}%` }"
              >
                <ProductCard :product="product" />
              </div>
            </div>
          </div>
          <button class="carousel-arrow carousel-arrow-right" @click="nextFeaturedSlide" v-if="featuredProducts.length > productsPerView">›</button>
        </div>
      </div>
    </section>

    <!-- New Products Carousel -->
    <section class="section" v-if="newProducts.length">
      <div class="container">
        <h2 class="section-title reveal">Sản phẩm mới</h2>
        <div class="carousel-wrapper">
          <button class="carousel-arrow carousel-arrow-left" @click="prevNewSlide" v-if="newProducts.length > productsPerView">‹</button>
          <div class="carousel-container">
            <div 
              class="carousel-track"
              :class="{ 'no-transition': newResetting }"
              :style="{ transform: `translateX(-${newSlide * (100 / productsPerView)}%)` }"
            >
              <div 
                v-for="(product, idx) in extendedNewProducts" 
                :key="'new-' + idx"
                class="carousel-item"
                :style="{ width: `${100 / productsPerView}%` }"
              >
                <ProductCard :product="product" />
              </div>
            </div>
          </div>
          <button class="carousel-arrow carousel-arrow-right" @click="nextNewSlide" v-if="newProducts.length > productsPerView">›</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { shopApi } from '../api'
import api from '../api'
import ProductCard from '../components/ProductCard.vue'
import TopDepositLeaderboard from '../components/TopDepositLeaderboard.vue'
import { getImageUrl } from '../utils/image'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()

const loading = ref(true)
const categories = ref([])
const featuredProducts = ref([])
const newProducts = ref([])
const recentOrders = ref([])

const categoriesSection = ref(null)

// Scroll to categories section with slower animation
const scrollToCategories = () => {
  if (categoriesSection.value) {
    const targetPosition = categoriesSection.value.offsetTop
    const startPosition = window.pageYOffset
    const distance = targetPosition - startPosition
    const duration = 1200 // 1.2 seconds
    let startTime = null

    const animation = (currentTime) => {
      if (startTime === null) startTime = currentTime
      const timeElapsed = currentTime - startTime
      const progress = Math.min(timeElapsed / duration, 1)
      
      // Easing function for smooth deceleration
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      
      window.scrollTo(0, startPosition + distance * easeOutCubic)
      
      if (timeElapsed < duration) {
        requestAnimationFrame(animation)
      }
    }
    
    requestAnimationFrame(animation)
  }
}

// Banner Slider Logic
const currentSlide = ref(0)
const isResetting = ref(false) // Flag to disable transition during reset
let slideInterval = null

const bannerImages = computed(() => {
  const banner = settingsStore.shopBanner
  if (!banner) return []
  
  try {
    const parsed = JSON.parse(banner)
    if (Array.isArray(parsed)) {
      return parsed.filter(b => b && b.trim())
    }
  } catch {
    // Not JSON, treat as single URL
  }
  return banner.trim() ? [banner] : []
})

// Extended array: original slides + 1 cloned first slide for seamless loop
const extendedBannerImages = computed(() => {
  if (bannerImages.value.length <= 1) return bannerImages.value
  return [...bannerImages.value, bannerImages.value[0]]
})

const goToSlide = (index) => {
  currentSlide.value = index
  resetAutoSlide()
}

const nextSlide = () => {
  if (bannerImages.value.length <= 1) return
  
  currentSlide.value++
  
  // When we reach the cloned slide (last position), wait for transition then reset
  if (currentSlide.value >= bannerImages.value.length) {
    setTimeout(() => {
      isResetting.value = true // Disable transition
      currentSlide.value = 0 // Jump back to real first slide
      
      // Re-enable transition after the position is reset
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isResetting.value = false
        })
      })
    }, 600) // Match the CSS transition duration
  }
}

const stopAutoSlide = () => {
  if (slideInterval) {
    clearInterval(slideInterval)
    slideInterval = null
  }
}

const startAutoSlide = () => {
  stopAutoSlide() // Luôn clear trước khi start mới
  if (bannerImages.value.length > 1) {
    slideInterval = setInterval(nextSlide, 5000)
  }
}

const resetAutoSlide = () => {
  startAutoSlide()
}

// ================== CAROUSEL LOGIC ==================

// Responsive items per view
const categoriesPerView = ref(3)
const productsPerView = ref(4)

// Category carousel state
const categorySlide = ref(0)
const categoryResetting = ref(false)
let categoryInterval = null

// Featured products carousel state
const featuredSlide = ref(0)
const featuredResetting = ref(false)
let featuredInterval = null

// New products carousel state
const newSlide = ref(0)
const newResetting = ref(false)
let newInterval = null

// Extended arrays for seamless infinite loop
const extendedCategories = computed(() => {
  if (categories.value.length <= categoriesPerView.value) return categories.value
  return [...categories.value, ...categories.value.slice(0, categoriesPerView.value)]
})

const extendedFeaturedProducts = computed(() => {
  if (featuredProducts.value.length <= productsPerView.value) return featuredProducts.value
  return [...featuredProducts.value, ...featuredProducts.value.slice(0, productsPerView.value)]
})

const extendedNewProducts = computed(() => {
  if (newProducts.value.length <= productsPerView.value) return newProducts.value
  return [...newProducts.value, ...newProducts.value.slice(0, productsPerView.value)]
})

// Generic carousel navigation helper
const createCarouselNav = (slideRef, resettingRef, items, perView) => {
  const next = () => {
    if (items.value.length <= perView.value) return
    slideRef.value++
    
    if (slideRef.value >= items.value.length) {
      setTimeout(() => {
        resettingRef.value = true
        slideRef.value = 0
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resettingRef.value = false
          })
        })
      }, 500)
    }
  }
  
  const prev = () => {
    if (items.value.length <= perView.value) return
    if (slideRef.value <= 0) {
      resettingRef.value = true
      slideRef.value = items.value.length
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resettingRef.value = false
          slideRef.value--
        })
      })
    } else {
      slideRef.value--
    }
  }
  
  return { next, prev }
}

// Category carousel navigation
const { next: nextCategorySlide, prev: prevCategorySlide } = createCarouselNav(
  categorySlide, categoryResetting, categories, categoriesPerView
)

// Featured products carousel navigation
const { next: nextFeaturedSlide, prev: prevFeaturedSlide } = createCarouselNav(
  featuredSlide, featuredResetting, featuredProducts, productsPerView
)

// New products carousel navigation
const { next: nextNewSlide, prev: prevNewSlide } = createCarouselNav(
  newSlide, newResetting, newProducts, productsPerView
)

// Auto-scroll for all carousels (slower intervals)
const startCarouselAutoSlide = () => {
  if (categories.value.length > categoriesPerView.value) {
    categoryInterval = setInterval(nextCategorySlide, 6000)
  }
  if (featuredProducts.value.length > productsPerView.value) {
    featuredInterval = setInterval(nextFeaturedSlide, 7000)
  }
  if (newProducts.value.length > productsPerView.value) {
    newInterval = setInterval(nextNewSlide, 8000)
  }
}

const stopCarouselAutoSlide = () => {
  if (categoryInterval) clearInterval(categoryInterval)
  if (featuredInterval) clearInterval(featuredInterval)
  if (newInterval) clearInterval(newInterval)
}

// Update items per view on resize
const updateItemsPerView = () => {
  const width = window.innerWidth
  if (width < 480) {
    categoriesPerView.value = 1
    productsPerView.value = 1
  } else if (width < 768) {
    categoriesPerView.value = 2
    productsPerView.value = 2
  } else if (width < 1024) {
    categoriesPerView.value = 3
    productsPerView.value = 3
  } else {
    categoriesPerView.value = 3
    productsPerView.value = 4
  }
}

// Chỉ reset khi bannerImages thay đổi thực sự
watch(bannerImages, (newVal, oldVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
    currentSlide.value = 0
    resetAutoSlide()
  }
})

onMounted(async () => {
  // Luôn refresh settings để lấy banner mới nhất
  await settingsStore.refreshShopInfo()
  
  try {
    const [catRes, featuredRes, newRes] = await Promise.all([
      shopApi.getCategories(),
      shopApi.getFeaturedProducts(),
      shopApi.getNewProducts(),
    ])
    categories.value = catRes.data
    featuredProducts.value = featuredRes.data
    newProducts.value = newRes.data
  } catch (error) {
    console.error('Failed to load home data:', error)
  } finally {
    loading.value = false
  }
  
  startAutoSlide()
  
  // Initialize carousels
  updateItemsPerView()
  window.addEventListener('resize', updateItemsPerView)
  
  // Start carousel auto-scroll after data is loaded
  setTimeout(() => {
    startCarouselAutoSlide()
  }, 1000)
  
  // Fetch recent orders for mobile inline section
  try {
    const response = await api.get('/shop/recent-orders')
    if (response.data && response.data.length > 0) {
      recentOrders.value = response.data.slice(0, 5) // Max 5 for marquee
    }
  } catch (error) {
    console.error('Failed to fetch recent orders:', error)
  }
  


  // Initialize scroll reveal
  nextTick(() => {
    initScrollReveal()
  })
})

onUnmounted(() => {
  stopAutoSlide()
  stopCarouselAutoSlide()
  window.removeEventListener('resize', updateItemsPerView)
})



// Scroll reveal initialization
const initScrollReveal = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  })
  
  document.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el)
  })
}
</script>

<style scoped>
/* ===== HERO WRAPPER: Banner + Deposit side by side ===== */
.hero-wrapper {
  padding: 1rem 0;
}

.hero-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 1rem;
  align-items: stretch;
}

.hero-banner {
  position: relative;
  min-height: 350px;
  border-radius: var(--radius);
  overflow: hidden;
  text-align: center;
}

.hero-deposit {
  min-width: 0;
}

@media (max-width: 900px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }

  .hero-banner {
    min-height: 280px;
  }
}

@media (max-width: 480px) {
  .hero-wrapper {
    padding: 0.5rem 0;
  }

  .hero-banner {
    min-height: 220px;
  }
}

/* Slider Container */
.slider-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.slider-track {
  display: flex;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.slider-track.no-transition {
  transition: none;
}

/* ===== CAROUSEL STYLES ===== */
.carousel-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.carousel-container {
  overflow: hidden;
  flex: 1;
  border-radius: var(--radius-lg);
}

.carousel-track {
  display: flex;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.carousel-track.no-transition {
  transition: none;
}

.carousel-item {
  flex-shrink: 0;
  padding: 0 8px;
  box-sizing: border-box;
}

/* Category slide wrapper - holds the card with spacing */
.category-slide {
  padding: 0 10px;
}

.category-slide .category-card {
  display: block;
  height: 100%;
}

.carousel-arrow {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 10;
  box-shadow: var(--shadow);
}

.carousel-arrow:hover {
  background: var(--primary);
  border-color: var(--primary);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(229, 57, 53, 0.3);
}

.carousel-arrow:active {
  transform: scale(0.95);
}

.carousel-arrow-left {
  margin-right: 5px;
}

.carousel-arrow-right {
  margin-left: 5px;
}

.slider-slide {
  flex-shrink: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.slider-fallback {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #E53935, #FF6F00);
}

/* Hero Content Overlay */
.hero-content {
  position: relative;
  z-index: 5;
  padding: 6rem 0;
}

/* Banner Slider Dots */
.slider-dots {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 10;
}

.slider-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0;
}

.slider-dot:hover {
  border-color: white;
  background: rgba(255, 255, 255, 0.3);
}

.slider-dot.active {
  background: white;
  border-color: white;
  transform: scale(1.2);
}

.hero-banner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.65));
  z-index: 1;
}

.hero-banner::after {
  display: none;
}


.hero-title {
  font-size: 3rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.75rem;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.hero-subtitle {
  font-size: 1.25rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2rem;
}

.hero-banner .btn-primary {
  padding: 1rem 2.5rem;
  font-size: 1.1rem;
  border-radius: 6px;
}

/* ===== SECTIONS ===== */
.section {
  padding: 1rem 0;
  animation: fadeInUp 0.6s ease-out;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 2rem;
  color: var(--primary);
  text-align: center;
  position: relative;
  display: block;
}

.section-title::after {
  content: '';
  display: block;
  width: 60px;
  height: 3px;
  background: var(--primary);
  margin: 8px auto 0;
  border-radius: 2px;
}

/* ===== CATEGORY CARDS ===== */
.category-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  text-decoration: none;
  color: white;
  background-size: cover;
  background-position: center;
  background-color: rgba(26, 26, 46, 0.8);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.category-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  transition: all 0.3s ease;
}

.category-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(229, 57, 53, 0.2);
}

.category-card:hover .category-overlay {
  background: rgba(229, 57, 53, 0.5);
}

.category-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
}

.category-card h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .hero-banner {
    padding: 4rem 0;
  }

  .hero-banner::before,
  .hero-banner::after {
    opacity: 0.3;
    filter: blur(40px);
  }

  .hero-banner::before {
    width: 200px;
    height: 200px;
  }

  .hero-banner::after {
    width: 250px;
    height: 250px;
  }

  .hero-title {
    font-size: 2.5rem;
    word-break: break-word;
  }

  .hero-subtitle {
    font-size: 1.1rem;
    margin-bottom: 2rem;
  }

  .hero-banner .btn-primary {
    padding: 1rem 2rem;
    font-size: 1rem;
  }

  .section {
    padding: 3rem 0;
  }

  .section-title {
    font-size: 1.5rem;
    margin-bottom: 2rem;
  }

  .category-card {
    padding: 1.5rem 1rem;
  }

  .category-card:hover {
    transform: translateY(-4px) scale(1.01);
  }

  .category-icon {
    height: 60px;
    font-size: 2.5rem;
  }

  .category-img {
    width: 60px;
    height: 60px;
  }

  .category-card h3 {
    font-size: 1.1rem;
  }

  .category-card p {
    font-size: 0.85rem;
  }
}

@media (max-width: 480px) {
  .hero-banner {
    padding: 2rem 0;
  }

  .hero-title {
    font-size: 1.5rem;
  }

  .hero-subtitle {
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .section {
    padding: 1.5rem 0;
  }

  .section-title {
    font-size: 1.1rem;
  }

  .category-card {
    padding: 0.75rem;
  }

  .category-icon {
    height: 40px;
    font-size: 1.5rem;
  }

  .category-img {
    width: 40px;
    height: 40px;
  }

  .category-card h3 {
    font-size: 0.9rem;
  }

  /* Carousel mobile */
  .carousel-arrow {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }

  .carousel-item {
    padding: 0 5px;
  }

  .carousel-track {
    margin: 0 -5px;
  }

  .carousel-wrapper {
    margin: 0 -10px;
  }

  .carousel-container {
    margin: 0 10px;
  }
}



/* ===== SKELETON LOADING ===== */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

@media (max-width: 768px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .skeleton-grid {
    grid-template-columns: 1fr;
  }
}

.skeleton-category-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.04) 25%,
    rgba(0, 0, 0, 0.08) 50%,
    rgba(0, 0, 0, 0.04) 75%
  );
  background-size: 200px 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 6px;
}

.skeleton-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
}

.skeleton-title {
  height: 20px;
  width: 70%;
}

.skeleton-text {
  height: 14px;
  width: 50%;
}

@keyframes skeleton-loading {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

/* ===== SCROLL REVEAL ===== */
.reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ===== RECENT ORDERS (Inline Marquee) ===== */
.mobile-recent-orders {
  display: block;
  background: rgba(229, 57, 53, 0.06);
  border-bottom: 1px solid rgba(229, 57, 53, 0.15);
  padding: 10px 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .mobile-recent-orders {
    display: block;
  }
}

.recent-orders-marquee {
  display: flex;
  align-items: center;
  gap: 10px;
}

.marquee-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.marquee-content {
  display: flex;
  gap: 20px;
  animation: marqueeScroll 20s linear infinite;
  white-space: nowrap;
}

.marquee-item {
  font-size: 13px;
  color: var(--text-secondary);
}

.marquee-item strong {
  color: var(--text);
}

.marquee-sep {
  color: var(--text-muted);
  margin-left: 10px;
}

@keyframes marqueeScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}


</style>
