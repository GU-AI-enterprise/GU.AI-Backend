import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '🎨 GU.AI API Documentation',
      version: '1.0.0',
      description: 'RESTful API documentation for GU.AI - AI-powered Virtual Fashion Model Generation Platform for the Vietnamese Market.',
      contact: {
        name: 'GU.AI Tech Team',
        email: 'contact@gu.ai',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập access token JWT của bạn ở định dạng: Bearer <Token>',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            avatar_url: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['customer', 'staff', 'admin'] },
            status: { type: 'string', enum: ['active', 'locked'] },
            provider: { type: 'string', nullable: true },
            plan_type: { type: 'string', nullable: true },
            current_credit: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Collection: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            cover_asset_id: { type: 'string', format: 'uuid', nullable: true },
            visibility: { type: 'string', enum: ['private', 'public'], default: 'private' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Asset: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            url: { type: 'string' },
            type: { type: 'string', enum: ['image'] },
            category: { type: 'string', enum: ['input', 'output', 'garment', 'model'] },
            mime_type: { type: 'string' },
            file_name: { type: 'string', nullable: true },
            width: { type: 'integer', nullable: true },
            height: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['promotion', 'system', 'alert', 'info'] },
            title: { type: 'string' },
            content: { type: 'string' },
            is_read: { type: 'boolean' },
            priority: { type: 'string', enum: ['low', 'normal', 'high'] },
            data: { type: 'object', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        SupportConversation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            assigned_staff_id: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['open', 'pending', 'resolved', 'closed'] },
            source: { type: 'string', enum: ['web'] },
            last_message_at: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
            assigned_staff: { $ref: '#/components/schemas/User', nullable: true },
          },
        },
        SupportMessage: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            conversation_id: { type: 'string', format: 'uuid' },
            sender_id: { type: 'string', format: 'uuid' },
            sender_type: { type: 'string', enum: ['customer', 'staff', 'admin', 'bot', 'system'] },
            content: { type: 'string' },
            message_type: { type: 'string', enum: ['text'] },
            is_read: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            sender: { $ref: '#/components/schemas/User' },
          },
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'Đăng nhập, đăng xuất, làm mới token' },
      { name: 'AI', description: 'Virtual try-on và các tính năng AI' },
      { name: 'Users', description: 'Quản lý hồ sơ người dùng' },
      { name: 'Admin', description: 'Quản trị hệ thống (yêu cầu quyền admin/staff)' },
      { name: 'Collections', description: 'Bộ sưu tập ảnh của người dùng' },
      { name: 'Images', description: 'Quản lý ảnh / asset của người dùng' },
      { name: 'History', description: 'Lịch sử tác vụ AI' },
      { name: 'Notifications', description: 'Thông báo hệ thống' },
      { name: 'Support', description: 'Chat hỗ trợ khách hàng' },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/**/*.ts',
    './dist/routes/*.js',
    './dist/routes/**/*.js',
  ],
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app: Application): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
