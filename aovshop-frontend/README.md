# AOVShop - Hệ thống bán hàng tự động

## Giới thiệu
AOVShop là hệ thống bán hàng trực tuyến với tích hợp thanh toán SePay tự động.

## Yêu cầu
- Node.js 18+
- Tài khoản Turso (https://turso.tech) - Database miễn phí
- Tài khoản Render (https://render.com) - Hosting miễn phí
- Tài khoản SePay (https://my.sepay.vn) - Thanh toán

---

## Cấu trúc dự án

```
AOVShop/
├── backend-ts/     ← Backend (Node.js/Express)
├── frontend/       ← Frontend (Vue.js)
└── README.md
```

---

## BƯỚC 1: Tạo Database (Turso)

1. Đăng ký tại https://turso.tech
2. Click **"Create Database"** → Đặt tên (vd: `aovshop`)
3. Vào database → **"Get Token"** → Copy:
   - `Database URL`: `libsql://aovshop-xxxxx.turso.io`
   - `Auth Token`: `eyJhbGciOiJFZERTQS...`

---

## BƯỚC 2: Deploy Backend

### 2.1. Chuẩn bị code
1. Copy folder `backend-ts` lên GitHub repo của bạn

### 2.2. Deploy trên Render
1. Vào https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. **Connect repository**: Chọn repo chứa `backend-ts`
4. **Cấu hình:**
   - **Name**: `aovshop-backend` (hoặc tên bạn muốn)
   - **Root Directory**: `backend-ts`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. **Environment Variables** (click "Add Environment Variable"):
   | Key | Value |
   |-----|-------|
   | `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` |
   | `TURSO_AUTH_TOKEN` | `eyJhbGciOiJFZERTQS...` |
   | `JWT_SECRET` | `your-secret-key-32-characters` | Nhập bất kì 32 kí tự là được, lưu dữ chuỗi cho kĩ vì để lộ sẽ có khả năng bị hack dữ liệu!!!
   | `FRONTEND_URL` | `https://your-frontend.onrender.com` | nếu chưa tạo thì sẽ thêm sau
6. Click **"Deploy Web Service"**
7. Đợi deploy xong → Copy URL backend (vd: `https://aovshop-backend.onrender.com`)

### 2.3. Khởi tạo Database
Sau khi deploy xong, chạy command trong local:
```bash
cd backend-ts
npm install
npm run db:push    # Tạo tables
npm run db:seed    # Tạo admin + data mẫu
```

---

## BƯỚC 3: Deploy Frontend

### 3.1. Chuẩn bị code
1. Copy folder `frontend` lên GitHub repo của bạn

### 3.2. Deploy trên Render
1. Vào https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. **Connect repository**: Chọn repo chứa `frontend`
4. **Cấu hình:**
   - **Name**: `aovshop-frontend` (hoặc tên bạn muốn)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://aovshop-backend.onrender.com/api` | Nếu chưa tạo có thể thêm sau
6. Click **"Deploy Web Service"**
7. Đợi deploy xong → Copy URL frontend

### 3.3. Cập nhật Backend CORS
Quay lại Render → Backend → Environment Variables:
- Sửa `FRONTEND_URL` = URL frontend vừa deploy

---

## BƯỚC 4: Cấu hình SePay

1. Đăng nhập https://my.sepay.vn
2. Vào **Phương thức thanh toán** → Kích hoạt ngân hàng
3. Vào **IPN** → Cấu hình:
   - **IPN URL**: `https://your-backend.onrender.com/api/deposit/webhook`
   - **Auth Type**: Secret Key
   - **Secret Key**: Tự tạo (vd: `mysecretkey123`)
   - **Content Type**: application/json
   - **Trạng thái**: Kích hoạt IPN
4. Click **Cập nhật**

### 4.2. Cấu hình trên Admin Panel
1. Đăng nhập website với tài khoản admin
2. Vào **Cài đặt** (Admin → Settings)
3. Nhập:
   - Merchant ID (từ SePay)
   - Secret Key (giống bước 3)
   - Tên ngân hàng
   - Số tài khoản
   - Tên chủ tài khoản
4. Click **Lưu**

---

## Tài khoản mặc định

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | password | Admin |
| user@example.com | password | User |

**⚠️ Đổi mật khẩu sau khi đăng nhập lần đầu!**

---

## Hỗ trợ
Liên hệ: [Thông tin liên hệ của bạn]
