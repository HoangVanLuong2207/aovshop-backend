<template>
  <div class="floating-elements">
    <div class="element element-1"></div>
    <div class="element element-2"></div>
    <div class="element element-3"></div>
    <div class="element element-4"></div>
  </div>
</template>

<style scoped>
.floating-elements {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.element {
  position: absolute;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(40px);
  animation: float-around 20s infinite linear;
}

.element-1 {
  width: 300px;
  height: 300px;
  top: -10%;
  left: -5%;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%);
  animation-duration: 25s;
}

.element-2 {
  width: 400px;
  height: 400px;
  bottom: -10%;
  right: -5%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
  animation-duration: 30s;
  animation-delay: -5s;
}

.element-3 {
  width: 200px;
  height: 200px;
  top: 40%;
  right: 15%;
  background: radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%);
  animation-duration: 20s;
  animation-delay: -10s;
}

.element-4 {
  width: 150px;
  height: 150px;
  bottom: 30%;
  left: 15%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%);
  animation-duration: 22s;
  animation-delay: -15s;
}

@keyframes float-around {
  0% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(50px, 50px) rotate(90deg); }
  50% { transform: translate(0, 100px) rotate(180deg); }
  75% { transform: translate(-50px, 50px) rotate(270deg); }
  100% { transform: translate(0, 0) rotate(360deg); }
}
</style>
