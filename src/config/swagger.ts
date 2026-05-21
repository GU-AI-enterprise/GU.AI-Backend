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
    },
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
