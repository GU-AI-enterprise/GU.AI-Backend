# 🎨 GU.AI - Backend Service

AI-powered Virtual Fashion Model Generation Platform for Vietnamese Market

GU.AI Backend cung cấp RESTful API mạnh mẽ cho nền tảng tạo người mẫu ảo và ảnh sản phẩm thời trang. Xử lý hàng loạt ảnh, queue thông minh, tích hợp AI, và quản lý credits.

## 🎯 Our Goal

GU.AI Backend ra đời để giải quyết bài toán tốn kém và mất thời gian khi thuê người mẫu, chụp ảnh sản phẩm thời trang.

- Tiết kiệm 90% chi phí sản xuất ảnh sản phẩm
- Tạo người mẫu ảo phù hợp với thể trạng và thị hiếu Việt Nam
- Giữ nguyên nét vải, họa tiết, màu sắc thật của sản phẩm
- Hỗ trợ nhà bán lẻ nhỏ & vừa không có budget lớn
- Xuất ảnh đúng chuẩn Shopee, TikTok Shop, Facebook

## 🚀 Key Features

- Queue System: Xử lý batch 100+ ảnh không bị timeout, tự động retry 3 lần nếu fail, priority cho user trả phí.
- AI Key Rotation: Tự động chuyển API key khi hết quota, đảm bảo service 24/7.
- Multi-format Export: Xuất ảnh chuẩn từng nền tảng (Shopee 1:1, TikTok 9:16, Facebook 4:5).
- Brand Kit: Lưu style, màu sắc, ánh sáng, fonts theo từng thương hiệu.
- Credit System: Mua credits, subscription (Stripe/VNPay), tự động trừ khi generate.
- Auto Thumbnail: Tự động tạo thumbnail 200x200 cho mỗi ảnh.
- Signed URLs: Bảo mật file storage với URL có thời hạn.
- Rate Limiting: Chống abuse theo IP và user.

## 🛠 Tech Stack

Category | Technology
--- | ---
Runtime | Node.js 20 LTS
Framework | Express.js
Language | TypeScript
Database | PostgreSQL 15
ORM | Prisma
Cache & Queue | Redis + BullMQ
File Storage | Cloudflare R2 / AWS S3
AI Integration | Replicate API / Fal.ai
Payment | Stripe + VNPay
Validation | Zod
Logging | Winston
Testing | Jest + Supertest

## 📂 Folder Structure

```plain
guai-backend/
│
├── src/
│   ├── config/                 # Database, Redis, S3, AI configs
│   │
│   ├── controllers/            # Xử lý request/response
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── image.controller.ts
│   │   ├── brand.controller.ts
│   │   ├── subscription.controller.ts
│   │   ├── credit.controller.ts
│   │   └── webhook.controller.ts
│   │
│   ├── services/               # Business logic chính
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── image.service.ts      # Core: generate ảnh
│   │   ├── brand.service.ts      # Brand kit management
│   │   ├── credit.service.ts     # Credit balance & transaction
│   │   ├── payment.service.ts    # Stripe/VNPay
│   │   ├── storage.service.ts    # Upload/download R2/S3
│   │   └── ai.service.ts         # Gọi AI API
│   │
│   ├── middlewares/            # Auth, rate limit, upload, error handler
│   
│   ├── queues/                 # BullMQ setup & workers
│   │   ├── index.ts              # Queue definitions
│   │   └── workers/
│   │       ├── image.worker.ts   # Xử lý generate 1 ảnh
│   │       └── batch.worker.ts   # Xử lý batch nhiều ảnh
│   │
│   ├── routes/                 # API routes
│   │   └── v1/                  # Version 1 endpoints
│   
│   ├── schemas/                # Zod validation schemas
│   ├── utils/                  # Helper functions
│   ├── types/                  # TypeScript definitions
│   
│   ├── app.ts                  # Express app setup
│   └── server.ts               # Entry point
│
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Prisma migrations
│
├── scripts/
│   ├── seed.ts                 # Seed database
│   └── setup.sh
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── logs/                       # Winston logs
├── uploads/                    # Temporary uploads
│
├── docker-compose.yml          # PostgreSQL + Redis containers
├── Dockerfile
├── ecosystem.config.js         # PM2 config
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Setup & Run

### Prerequisites

- Node.js 20+
- Docker (cho PostgreSQL + Redis)
- npm hoặc pnpm

### Development

```bash
# 1. Clone repository
git clone https://github.com/gu-ai/guai-backend.git
cd guai-backend

# 2. Install dependencies
npm install

# 3. Start PostgreSQL & Redis with Docker
docker-compose up -d

# 4. Run database migrations
npx prisma migrate dev

# 5. Start development server
npm run dev

# 6. (Optional) Run queue workers in separate terminals
npm run queue:worker
npm run queue:batch
```

### Production Build

```bash
# Build TypeScript
npm run build

# Start with PM2
npm run start:prod
```

## 📦 Deployment

Platform | Method
--- | ---
Railway / Render | Connect GitHub repo, add env vars, auto-deploy
AWS EC2 | pm2 start ecosystem.config.js
Docker | docker build -t guai-backend .

## 💡 Pro Tip

Queue Strategy: Batch jobs được split thành nhiều jobs nhỏ. Mỗi job xử lý 5 ảnh. Nếu 1 job fail, chỉ mất 5 ảnh, không ảnh hưởng toàn bộ batch.

AI Key Rotation: Nếu dùng Google Gemini hoặc OpenAI, backend tự động chuyển sang key khác khi hết quota.
