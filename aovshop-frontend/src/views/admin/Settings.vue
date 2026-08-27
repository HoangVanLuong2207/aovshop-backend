<template>
  <div class="settings-page">
    <h1>Cài đặt hệ thống</h1>
    <div class="settings-grid">
    <div class="settings-column">
    <!-- Notification Section -->
    <div class="settings-section">
      <h2>📢 Thông báo trang web</h2>
      
      <form @submit.prevent="saveSettings" class="settings-form">
       <div class="form-group">
        <label 
          class="toggle-label"
          style="
            display: flex;
            align-items: center;
            gap: 10px;
          "
        >
          <input 
            type="checkbox" 
            v-model="settings.notification_enabled"
            class="toggle-input"
          />
          <span class="toggle-switch"></span>
          <span style="line-height: 1;">Thông báo</span>
        </label>
      </div>

        <div class="form-group" v-if="settings.notification_enabled">
          <label>Nội dung thông báo</label>
          
          <!-- Formatting Toolbar -->
          <div class="editor-toolbar">
            <button type="button" class="toolbar-btn" @click="insertBold" title="In đậm">
              <strong>B</strong>
            </button>
            <button type="button" class="toolbar-btn" @click="insertItalic" title="In nghiêng">
              <em>I</em>
            </button>
            <button type="button" class="toolbar-btn" @click="insertLink" title="Chèn link">
              🔗
            </button>
            <button type="button" class="toolbar-btn" @click="insertImage" title="Chèn ảnh">
              🖼️
            </button>
          </div>
          
          <textarea 
            ref="notificationTextarea"
            v-model="settings.notification_text" 
            class="form-input editor-textarea"
            rows="6"
            placeholder="Nhập nội dung thông báo..."
          ></textarea>
          <small>Sử dụng các nút trên để định dạng văn bản. Xem trước bên dưới.</small>
        </div>

        <div v-if="settings.notification_enabled && settings.notification_text" class="notification-preview">
          <h4>Xem trước nội dung:</h4>
          <div class="preview-popup">
            <div class="preview-popup-header">
              <span>📢</span>
              <strong>Thông báo</strong>
            </div>
            <div class="preview-popup-content" v-html="settings.notification_text">
            </div>
          </div>
        </div>

        <div class="form-actions" style="display: flex; gap: 10px;">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu thông báo' }}
          </button>
          <button type="button" class="btn btn-secondary" @click="testPush">
            🔔 Gửi thông báo thử (Push)
          </button>
        </div>
      </form>
    </div>

    <!-- Shop Branding Section -->
    <div class="settings-section">
      <h2>🏪 Thông tin Shop</h2>
      
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Tên Shop</label>
          <input 
            type="text" 
            v-model="settings.shop_name" 
            class="form-input"
            placeholder="Nhập tên shop của bạn"
          />
        </div>

        <div class="form-group">
          <label>Logo URL</label>
          <input 
            type="url" 
            v-model="settings.shop_logo" 
            class="form-input"
            placeholder="https://example.com/logo.png"
          />
          <small>Link ảnh logo (khuyến nghị 200x200px)</small>
        </div>

        <div class="form-group">
          <label>Banner URLs (Slider)</label>
          <div class="banner-list">
            <div v-for="(banner, index) in bannerList" :key="index" class="banner-item">
              <input 
                type="url" 
                v-model="bannerList[index]" 
                class="form-input"
                :placeholder="`Banner ${index + 1}: https://example.com/banner.png`"
              />
              <button type="button" class="btn btn-danger btn-sm" @click="removeBanner(index)" v-if="bannerList.length > 1">
                ✕
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="addBanner" style="margin-top: 8px;">
            + Thêm Banner
          </button>
          <small>Link ảnh banner trang chủ (khuyến nghị 1200x400px). Nhiều ảnh sẽ chạy slider.</small>
        </div>

        <div v-if="settings.shop_logo || bannerList.some(b => b)" class="preview-section">
          <h4>Xem trước:</h4>
          <div class="preview-images">
            <div v-if="settings.shop_logo" class="preview-item">
              <span>Logo:</span>
              <img :src="settings.shop_logo" alt="Logo" class="preview-logo" />
            </div>
            <div v-if="bannerList.some(b => b)" class="preview-item banner-preview-list">
              <span>Banner ({{ bannerList.filter(b => b).length }} ảnh):</span>
              <div class="banner-preview-grid">
                <img v-for="(banner, idx) in bannerList.filter(b => b)" :key="idx" :src="banner" alt="Banner" class="preview-banner-thumb" />
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu thông tin Shop' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Telegram Bot Section -->
    <div class="settings-section">
      <h2>🤖 Telegram Bot (Thông báo Admin)</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
        Nhận thông báo đơn hàng và nạp tiền ngay lập tức qua Telegram. Không sợ bị chặn như trình duyệt.
      </p>
      
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Bot Token (@BotFather)</label>
          <input 
            type="password" 
            v-model="settings.telegram_bot_token" 
            class="form-input"
            placeholder="Ví dụ: 123456789:ABCdefGHI..."
          />
        </div>

        <div class="form-group">
          <label>Chat ID (@userinfobot)</label>
          <input 
            type="text" 
            v-model="settings.telegram_chat_id" 
            class="form-input"
            placeholder="Ví dụ: 123456789"
          />
          <small>Lưu ý: Bạn phải chủ động chat hoặc /start với Bot trước thì nó mới gửi tin nhắn được.</small>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu Telegram Bot' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Email (Brevo) Section -->
    <div class="settings-section">
      <h2>📧 Email (Brevo)</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
        Cấu hình gửi email xác thực tài khoản và quên mật khẩu. Đăng ký miễn phí tại <a href="https://app.brevo.com" target="_blank">app.brevo.com</a>.
      </p>
      
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Brevo API Key</label>
          <input 
            type="password" 
            v-model="settings.brevo_api_key" 
            class="form-input"
            placeholder="xkeysib-..."
          />
          <small>Lấy từ Brevo → SMTP & API → Generate API Key</small>
        </div>

        <div class="form-group">
          <label>Email người gửi</label>
          <input 
            type="email" 
            v-model="settings.brevo_sender_email" 
            class="form-input"
            placeholder="your-email@gmail.com"
          />
          <small>Email đã xác minh trên Brevo Senders. Nếu để trống, email sẽ không gửi được.</small>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu Email' }}
          </button>
        </div>
      </form>
    </div>

    </div>

    <div class="settings-column">
        
    <!-- Contact Settings Section -->
    <div class="settings-section">
      <h2>📞 Liên hệ / Chat</h2>
      
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Link Zalo</label>
          <input 
            type="url" 
            v-model="settings.contact_zalo" 
            class="form-input"
            placeholder="https://zalo.me/0123456789"
          />
          <small>Link Zalo chat của shop</small>
        </div>

        <div class="form-group">
          <label>Link Facebook</label>
          <input 
            type="url" 
            v-model="settings.contact_messenger" 
            class="form-input"
            placeholder="https://m.me/yourpage"
          />
          <small>Link Facebook Messenger của shop</small>
        </div>

        <div class="form-group">
          <label>Số Hotline</label>
          <input 
            type="tel" 
            v-model="settings.contact_hotline" 
            class="form-input"
            placeholder="0123456789"
          />
          <small>Số điện thoại liên hệ</small>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu liên hệ' }}
          </button>
        </div>
      </form>
    </div>


    <!-- Payment Accounts Section -->
    <div class="settings-section">
      <h2>💳 Danh sách tài khoản ngân hàng</h2>
      <p class="section-desc">Cấu hình các tài khoản ngân hàng để khách hàng chuyển khoản nạp tiền.</p>
      
      <div class="payment-accounts-list">
        <div v-for="account in paymentAccountsList" :key="account.id" class="account-card">
          <div class="account-info">
            <div class="account-bank">{{ account.bankName }}</div>
            <div class="account-number">{{ account.accountNumber }}</div>
            <div class="account-name">{{ account.accountName }}</div>
          </div>
          <div class="account-actions">
            <button class="btn btn-sm" @click="editAccount(account)">✏️</button>
            <button class="btn btn-danger btn-sm" @click="deleteAccount(account.id)">✕</button>
          </div>
        </div>
        
        <button class="btn btn-secondary btn-block" @click="showAddAccountModal = true">
          + Thêm tài khoản ngân hàng
        </button>
      </div>
    </div>

    <!-- Add/Edit Account Modal -->
    <Transition name="modal">
      <div v-if="showAddAccountModal" class="modal-overlay" @click.self="showAddAccountModal = false">
        <div class="modal-card">
          <h3>{{ editingAccount ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới' }}</h3>
          <div class="form-group">
            <label>Ngân hàng</label>
            <select v-model="accountForm.bankName" class="form-input">
              <option value="MB">MB Bank</option>
              <option value="VCB">Vietcombank</option>
              <option value="ACB">ACB</option>
              <option value="TCB">Techcombank</option>
              <option value="VPB">VPBank</option>
              <option value="TPB">TPBank</option>
              <option value="BIDV">BIDV</option>
              <option value="VIB">VIB</option>
            </select>
          </div>
          <div class="form-group">
            <label>Số tài khoản</label>
            <input v-model="accountForm.accountNumber" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>Tên chủ tài khoản</label>
            <input v-model="accountForm.accountName" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>Merchant ID (SePay)</label>
            <input v-model="accountForm.merchantId" type="text" class="form-input" placeholder="SP-LIVE-xxxxxxx" />
          </div>
          <div class="form-group">
            <label>Secret Key (SePay)</label>
            <input v-model="accountForm.secretKey" type="password" class="form-input" placeholder="Nhập Secret Key" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="saveAccount">💾 Lưu</button>
          </div>
        </div>
      </div>
    </Transition>
    </div>
    </div>

    <div class="settings-section" style="margin-top: 24px;">
      <h2>Đăng nhập Google</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
        Dán OAuth 2.0 Client ID loại Web application từ Google Cloud Console. Đây không phải Google ID cá nhân.
      </p>
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Google OAuth Client ID</label>
          <input
            v-model="settings.google_client_id"
            type="text"
            class="form-input"
            placeholder="1234567890-abcxyz.apps.googleusercontent.com"
          />
          <small>Thêm domain frontend vào Authorized JavaScript origins trong Google Cloud Console.</small>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : 'Lưu cấu hình Google' }}
          </button>
        </div>
      </form>
    </div>

    <!-- API Settings Section -->
    <div class="settings-section" style="margin-top: 24px;">
      <h2>🔑 API cho Công cụ (Tool)</h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
        Mã bí mật dùng để xác thực cho các công cụ tự động (như tool thêm acc từ máy tính).
      </p>
      
      <form @submit.prevent="saveSettings" class="settings-form">
        <div class="form-group">
          <label>Secret API Token</label>
          <div style="display: flex; gap: 8px;">
            <input 
              v-model="settings.api_auth_token" 
              :type="showToken ? 'text' : 'password'" 
              class="form-input" 
              placeholder="Nhập mã bí mật..."
            />
            <button type="button" class="btn btn-secondary btn-sm" @click="showToken = !showToken">
              {{ showToken ? '👁️' : '🙈' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="generateApiToken">
              Tạo mã
            </button>
          </div>
          <small>Lưu ý: Sau khi đổi mã, bạn phải cập nhật lại mã mới vào Tool Python.</small>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Đang lưu...' : '💾 Lưu mã API' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import { useToast } from '../../composables/useToast'
import { useSettingsStore } from '../../stores/settings'
import { usePush } from '../../composables/usePush'

const { toast } = useToast()
const settingsStore = useSettingsStore()
const push = usePush()

const settings = ref({
  notification_enabled: false,
  notification_type: 'info',
  notification_text: '',
  shop_name: '',
  shop_logo: '',
  shop_banner: '',
  sepay_merchant_id: '',
  sepay_secret_key: '',
  sepay_bank_name: '',
  sepay_bank_account: '',
  sepay_account_name: '',
  contact_zalo: '',
  contact_messenger: '',
  contact_hotline: '',
  api_auth_token: '',
  push_enabled: true,
  vapid_public_key: '',
  vapid_private_key: '',
  vapid_subject: '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  brevo_api_key: '',
  brevo_sender_email: '',
  google_client_id: '',
})

const showToken = ref(false)
const generateApiToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'ak_'
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    settings.value.api_auth_token = result
}

const paymentAccountsList = ref([])
const showAddAccountModal = ref(false)
const editingAccount = ref(null)
const accountForm = ref({
  bankName: 'MB',
  accountNumber: '',
  accountName: '',
  merchantId: '',
  secretKey: '',
  isActive: true
})

const saving = ref(false)

const webhookUrl = 'https://(web3).onrender.com/api/deposit/webhook'

const bannerList = ref([''])

const loadSettings = async () => {
  try {
    const response = await api.get('/admin/settings')
    const data = response.data
    
    // Create a clean object with only keys that exist in our local settings definition
    const filteredData = {}
    Object.keys(settings.value).forEach(key => {
      if (data[key] !== undefined) {
        // Handle special type conversions
        if (key === 'notification_enabled' || key === 'push_enabled') {
          filteredData[key] = data[key] === 'true' || data[key] === true
        } else {
          filteredData[key] = data[key]
        }
      }
    })

    // Parse shop_banner JSON array separately
    if (data.shop_banner) {
      try {
        const parsed = JSON.parse(data.shop_banner)
        if (Array.isArray(parsed)) {
          bannerList.value = parsed.length > 0 ? parsed : ['']
        }
      } catch {
        bannerList.value = [data.shop_banner]
      }
    }
    
    // Update local settings with filtered data from server
    settings.value = { ...settings.value, ...filteredData }
    console.log('Settings loaded:', settings.value)
  } catch (error) {
    console.error('Error loading settings:', error)
    toast.error('Không thể tải cài đặt từ server')
  }
}

const saveSettings = async () => {
  saving.value = true
  
  try {
    // Only send keys that are in our settings ref definition
    // This filters out junk like 'id', 'updatedAt', etc.
    const dataToSend = {}
    Object.keys(settings.value).forEach(key => {
      let val = settings.value[key]
      
      // Convert boolean to string for backend persistence
      if (key === 'notification_enabled' || key === 'push_enabled') {
        val = val ? 'true' : 'false'
      }
      
      dataToSend[key] = val
    })

    // Special handling for banners
    const validBanners = bannerList.value.filter(b => b && b.trim())
    dataToSend.shop_banner = validBanners.length > 0 ? JSON.stringify(validBanners) : '[]'
    
    const response = await api.post('/admin/settings', dataToSend)
    
    // Update the local state with what the server actually saved
    if (response.data && response.data.saved) {
        console.log('Saved keys:', response.data.saved)
    }

    // Refresh public settings store
    await settingsStore.refreshShopInfo()
    
    toast.success('Cài đặt đã được lưu thành công!')
  } catch (error) {
    console.error('Save error:', error)
    toast.error('Lỗi khi lưu cài đặt: ' + (error.response?.data?.message || error.message))
  } finally {
    saving.value = false
  }
}

const addBanner = () => {
  bannerList.value.push('')
}

const removeBanner = (index) => {
  bannerList.value.splice(index, 1)
}

const copyWebhook = () => {
  navigator.clipboard.writeText(webhookUrl)
  toast.success('Đã copy Webhook URL!')
}

const testPush = async () => {
  try {
    const success = await push.subscribe(true)
    if (!success) {
      toast.error('Vui lòng bật thông báo trình duyệt trước')
      return
    }

    await api.post('/admin/test-push')
    toast.success('Đã gửi thông báo thử!')
  } catch (error) {
    toast.error('Lỗi khi gửi thông báo thử')
  }
}

// Rich text editor functions
const notificationTextarea = ref(null)

const insertAtCursor = (text) => {
  const textarea = notificationTextarea.value
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = settings.value.notification_text.substring(0, start)
  const after = settings.value.notification_text.substring(end)
  
  settings.value.notification_text = before + text + after
  
  // Focus back and set cursor position
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + text.length, start + text.length)
  }, 0)
}

const insertBold = () => {
  const selectedText = window.getSelection().toString() || 'văn bản đậm'
  insertAtCursor(`<strong>${selectedText}</strong>`)
}

const insertItalic = () => {
  const selectedText = window.getSelection().toString() || 'văn bản nghiêng'
  insertAtCursor(`<em>${selectedText}</em>`)
}

const insertLink = () => {
  const url = prompt('Nhập URL (ví dụ: /products hoặc https://...):', '/products')
  if (!url) return
  
  const text = prompt('Nhập text hiển thị:', 'Xem ngay')
  if (!text) return
  
  insertAtCursor(`<a href="${url}">${text}</a>`)
}

const insertImage = () => {
  const url = prompt('Nhập URL ảnh:', 'https://...')
  if (!url) return
  
  insertAtCursor(`<img src="${url}" style="max-width: 100%; border-radius: 8px;" />`)
}

const loadPaymentAccounts = async () => {
  try {
    const response = await api.get('/admin/payment-accounts')
    paymentAccountsList.value = response.data.data
  } catch (error) {
    console.error('Error loading payment accounts:', error)
  }
}

const editAccount = (account) => {
  editingAccount.value = account
  accountForm.value = { ...account }
  showAddAccountModal.value = true
}

const saveAccount = async () => {
  try {
    if (editingAccount.value) {
      await api.patch(`/admin/payment-accounts/${editingAccount.value.id}`, accountForm.value)
      toast.success('Cập nhật tài khoản thành công')
    } else {
      await api.post('/admin/payment-accounts', accountForm.value)
      toast.success('Thêm tài khoản thành công')
    }
    showAddAccountModal.value = false
    editingAccount.value = null
    accountForm.value = { bankName: 'MB', accountNumber: '', accountName: '', merchantId: '', secretKey: '', isActive: true }
    loadPaymentAccounts()
  } catch (error) {
    toast.error('Lỗi khi lưu tài khoản')
  }
}

const deleteAccount = async (id) => {
  if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) return
  try {
    await api.delete(`/admin/payment-accounts/${id}`)
    toast.success('Đã xóa tài khoản')
    loadPaymentAccounts()
  } catch (error) {
    toast.error('Lỗi khi xóa tài khoản')
  }
}

onMounted(() => {
  loadSettings()
  loadPaymentAccounts()
})
</script>

<style scoped>
.settings-page {
  padding: 20px;
}

.settings-grid {
  display: flex;
  justify-content: space-around;
  gap: 24px;
}

.settings-column {
  flex: 1;
  min-width: 0;
}

@media (max-width: 900px) {
  .settings-grid {
    flex-direction: column;
  }
  
  .settings-column {
    width: 100%;
  }
}

.settings-section {
  background: var(--bg-secondary, rgba(26, 26, 46, 0.8));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.settings-section h2 {
  margin-bottom: 20px;
  color: var(--text-primary);
}

.settings-form {
  max-width: 500px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.webhook-info {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
}

.webhook-info h3 {
  margin-bottom: 8px;
  font-size: 14px;
}

.webhook-info p {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.webhook-info code {
  display: block;
  background: var(--card-bg);
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
  word-break: break-all;
  margin-bottom: 10px;
}

.form-actions {
  margin-top: 24px;
}

.message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 16px;
  font-size: 14px;
}

.message.success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.message.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

ol {
  padding-left: 20px;
  line-height: 1.8;
}

ol a {
  color: var(--primary-color);
}

.preview-section {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.preview-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.preview-images {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.preview-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-item span {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-logo {
  max-height: 80px;
  max-width: 200px;
  object-fit: contain;
  border-radius: 8px;
}

.preview-banner {
  max-height: 100px;
  max-width: 400px;
  object-fit: cover;
  border-radius: 8px;
}

small {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

/* Toggle Switch */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-primary, #f8fafc);
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch {
  flex-shrink: 0;
  width: 52px;
  height: 28px;
  background: #475569 !important;
  border-radius: 14px;
  position: relative;
  transition: background 0.3s ease;
  display: inline-block;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  top: 3px;
  left: 3px;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.toggle-input:checked + .toggle-switch {
  background: #22c55e !important;
}

.toggle-input:checked + .toggle-switch::after {
  transform: translateX(24px);
}

/* Notification Preview */
.notification-preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.notification-preview h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.preview-popup {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  overflow: hidden;
}

.preview-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(16, 185, 129, 0.1));
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
  font-size: 14px;
}

.preview-popup-content {
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Editor Toolbar */
.editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  width: 100%;
  box-sizing: border-box;
}

.toolbar-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toolbar-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.editor-textarea {
  border-radius: 0 0 8px 8px !important;
  border: 1px solid var(--border) !important;
  border-top: none !important;
  background: var(--bg-tertiary) !important;
  color: var(--text) !important;
  font-family: inherit;
  resize: vertical;
  width: 100% !important;
  box-sizing: border-box;
  padding: 12px;
}

.preview-popup-content a {
  color: #818cf8;
  text-decoration: underline;
}

.preview-popup-content img {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}

/* Banner List Styles */
.banner-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.banner-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.banner-item .form-input {
  flex: 1;
}

.banner-preview-list {
  flex-direction: column;
  align-items: flex-start;
}

.banner-preview-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.preview-banner-thumb {
  max-height: 60px;
  max-width: 150px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}

/* Payment Accounts Styles */
.payment-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.account-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.account-bank {
  font-weight: 700;
  color: var(--primary);
  font-size: 1.1rem;
}

.account-number {
  font-family: monospace;
  font-size: 1rem;
  margin: 4px 0;
}

.account-name {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.account-actions {
  display: flex;
  gap: 8px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--bg-secondary);
  padding: 24px;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
}

.modal-card h3 {
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.modal-actions button {
  flex: 1;
}

.section-desc {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.btn-block {
  width: 100%;
}
</style>
