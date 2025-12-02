kyc-web/ (Root)
├── frontend/ (React + TypeScript)
│   ├── public/
│   │   ├── index.html
│   │   ├── favicon.ico
│   │   └── models/ (face-api.js models)
│   ├── src/
│   │   ├── components/
│   │   │   ├── KYCStepper.tsx
│   │   │   ├── WebcamCapture.tsx
│   │   │   ├── ImagePreview.tsx
│   │   │   ├── BrowserDetector.tsx
│   │   │   ├── ProgressLoader.tsx
│   │   │   ├── InstructionOverlay.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── index.ts
│   │   ├── hooks/
│   │   │   ├── useKYCProcess.ts
│   │   │   ├── useFaceDetection.ts
│   │   │   └── index.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── kyc.ts
│   │   │   └── index.ts
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── express.d.ts
│   │   ├── utils/
│   │   │   └── device.ts
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── .env
├── backend/ (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── database.ts
│   │   │   ├── redis.ts
│   │   │   └── index.ts
│   │   ├── controllers/
│   │   │   ├── KYCController.ts
│   │   │   ├── AuthController.ts
│   │   │   ├── StatusController.ts
│   │   │   └── index.ts
│   │   ├── middleware/
│   │   │   ├── security.ts
│   │   │   ├── validation.ts
│   │   │   ├── upload.ts
│   │   │   ├── rateLimit.ts
│   │   │   ├── auth.ts
│   │   │   └── index.ts
│   │   ├── routes/
│   │   │   ├── kyc.ts
│   │   │   ├── auth.ts
│   │   │   ├── status.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   ├── StorageService.ts
│   │   │   ├── MLService.ts
│   │   │   ├── EncryptionService.ts
│   │   │   └── index.ts
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── KYCAttempt.ts
│   │   │   ├── DeviceFingerprint.ts
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── webhook.ts
│   │   │   ├── metrics.ts
│   │   │   └── index.ts
│   │   └── app.ts
│   ├── migrations/
│   ├── seeds/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── Dockerfile
├── ml-service/ (Python FastAPI)
│   ├── src/
│   │   ├── app.py
│   │   ├── config.py
│   │   ├── models/
│   │   │   ├── face_recognition.py
│   │   │   ├── liveness_detection.py
│   │   │   ├── document_verification.py
│   │   │   ├── anti_spoof.py
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   ├── image_processor.py
│   │   │   ├── embedding_service.py
│   │   │   ├── ocr_service.py
│   │   │   └── __init__.py
│   │   ├── api/
│   │   │   ├── routes.py
│   │   │   ├── schemas.py
│   │   │   ├── middleware.py
│   │   │   └── __init__.py
│   │   ├── utils/
│   │   │   ├── logger.py
│   │   │   ├── image_utils.py
│   │   │   ├── metrics.py
│   │   │   └── __init__.py
│   │   └── __init__.py
│   ├── models/ (pretrained models directory)
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env
│   └── README.md
├── docker-compose.yml
├── .env.example
├── README.md
└── deploy/
    ├── nginx/
    │   └── nginx.conf
    └── kubernetes/
        ├── deployment.yaml
        └── service.yaml


# KYC Verification System

A production-ready, full-stack Know Your Customer (KYC) verification system with AI-powered identity verification.

## 🚀 Features

- **Face Recognition**: AI-powered face matching between selfie and ID
- **Liveness Detection**: Anti-spoofing with blink, head turn, smile challenges
- **Document Verification**: OCR and validation of ID documents
- **Real-time Processing**: Fast API responses with async processing
- **Security**: End-to-end encryption, rate limiting, audit logging
- **Scalable**: Docker-based microservices architecture
- **Monitoring**: Prometheus + Grafana for metrics and alerts

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend│    │  Node.js Backend│    │ Python ML Service│
│   (TypeScript)  │◄──►│  (TypeScript)   │◄──►│  (FastAPI)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                      │                       │
         │                      │                       │
         ▼                      ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    PostgreSQL   │    │      Redis      │    │   ML Models     │
│     Database    │    │     Cache       │    │  (Face, OCR)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📦 Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for development)
- Python 3.10+ (for ML development)
- 8GB+ RAM (16GB recommended for ML)

## 🔒 Security Features

- **Encryption**: AES-256-GCM for sensitive data
- **Authentication**: JWT tokens with refresh
- **Rate Limiting**: Redis-based per IP/user
- **Input Validation**: Pydantic schemas + express-validator
- **CORS**: Strict origin policies
- **Headers**: Security headers with Helmet
- **Audit Logging**: Comprehensive request/response logging

## 📊 API Endpoints

### Backend API (`/api`)
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /kyc/upload-selfie` - Upload selfie with liveness check
- `POST /kyc/upload-id` - Upload ID document
- `GET /kyc/status/:userId` - Check KYC status
- `GET /status/health` - System health check

### ML Service API (`/api/v1`)
- `POST /detect-liveness` - Detect liveness in selfie
- `POST /verify-face-match` - Compare selfie and ID face
- `POST /verify-document` - Verify ID document
- `POST /verify-kyc` - Complete KYC verification
- `GET /health` - ML service health# kyc-verifer-ml
# kyc-verifer-ml
# kyc-verifer-ml
