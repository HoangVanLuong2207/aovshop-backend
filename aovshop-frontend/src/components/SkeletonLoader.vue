<template>
  <div class="skeleton-wrapper">
    <!-- Product Card Skeleton -->
    <div v-if="type === 'product-card'" class="skeleton-card">
      <div class="skeleton skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton skeleton-text" style="width: 40%"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text" style="width: 50%"></div>
        <div class="skeleton-row">
          <div class="skeleton skeleton-text" style="width: 30%"></div>
          <div class="skeleton skeleton-text" style="width: 25%"></div>
        </div>
      </div>
    </div>

    <!-- Category Card Skeleton -->
    <div v-else-if="type === 'category-card'" class="skeleton-category">
      <div class="skeleton skeleton-icon"></div>
      <div class="skeleton skeleton-title" style="width: 70%"></div>
      <div class="skeleton skeleton-text" style="width: 50%"></div>
    </div>

    <!-- Text Lines Skeleton -->
    <div v-else-if="type === 'text'" class="skeleton-lines">
      <div 
        v-for="n in lines" 
        :key="n" 
        class="skeleton skeleton-text"
        :style="{ width: getLineWidth(n) }"
      ></div>
    </div>

    <!-- Avatar Skeleton -->
    <div v-else-if="type === 'avatar'" class="skeleton skeleton-avatar"></div>

    <!-- Image Skeleton -->
    <div v-else-if="type === 'image'" class="skeleton skeleton-image-only" :style="{ height: height }"></div>

    <!-- Default Box Skeleton -->
    <div v-else class="skeleton skeleton-box" :style="{ width, height }"></div>
  </div>
</template>

<script setup>
const props = defineProps({
  type: {
    type: String,
    default: 'box' // box, product-card, category-card, text, avatar, image
  },
  lines: {
    type: Number,
    default: 3
  },
  width: {
    type: String,
    default: '100%'
  },
  height: {
    type: String,
    default: '200px'
  }
})

const getLineWidth = (n) => {
  if (n === props.lines) return '60%'
  return `${80 + Math.random() * 20}%`
}
</script>

<style scoped>
.skeleton-wrapper {
  width: 100%;
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.03) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.03) 75%
  );
  background-size: 200px 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 8px;
}

@keyframes skeleton-loading {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

/* Product Card Skeleton */
.skeleton-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.skeleton-image {
  height: 200px;
  border-radius: 0;
}

.skeleton-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-text {
  height: 14px;
}

.skeleton-title {
  height: 20px;
  width: 80%;
}

.skeleton-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

/* Category Card Skeleton */
.skeleton-category {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.skeleton-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
}

/* Text Lines */
.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Avatar */
.skeleton-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
}

/* Image Only */
.skeleton-image-only {
  width: 100%;
  border-radius: var(--radius);
}

/* Box */
.skeleton-box {
  border-radius: var(--radius);
}
</style>
