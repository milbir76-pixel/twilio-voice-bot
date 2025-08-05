// server.js

// 1️⃣ Załaduj .env zanim cokolwiek innego
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const twilioRoutes = require('./routes/twilio');
const logger = require('./utils/logger');

const app = express();

// 2️⃣ Ustaw port i host (Railway nadpisze PORT automatycznie)
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // słuchamy na wszystkich interfejsach

// 3️⃣ Middleware do CORS i parsowania ciał żądań
app.use(cors());
app.use(express.urlencoded({ extended: false })); // odczyt form data (Twilio!)
app.use(express.json());                          // odczyt JSON

// 4️⃣ Logger – wypisz każde zapytanie
app.use((req, res, next) => {
  logger.info(`📨 ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// 5️⃣ Prosty endpoint “alive” / health
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Stomatologia Kraków – AI Voice Receptionist',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 6️⃣ Główna ścieżka dla Twilio – wszystkie /twilio/voice itd.
app.use('/twilio', twilioRoutes);

// 7️⃣ 404 – jeśli żaden powyższy route nie zadziałał
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// 8️⃣ Error handler – łapie wszystkie nieprzewidziane błędy
app.use((err, req, res, next) => {
  logger.error('❌ UNHANDLED ERROR:', err);
  res.status(500).json({
    status: 'error',
    message: 'Coś poszło nie tak!',
    // w dev pokażemy szczegóły, w prod nie
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 9️⃣ Start serwera
app.listen(PORT, HOST, () => {
  logger.info(`🚀 Serwer działa na http://${HOST}:${PORT}`);
  logger.info('🔑 Sprawdzam zmienne środowiskowe…');

  const requiredEnv = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'OPENAI_API_KEY',
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION'
  ];
  const missing = requiredEnv.filter(v => !process.env[v] || process.env[v].trim() === '');
  if (missing.length) {
    logger.error('❌ Brakuje zmiennych środowiskowych:');
    missing.forEach(v => logger.error(`   • ${v}`));
  } else {
    logger.info('✅ Wszystkie zmienne środowiskowe OK');
  }

  logger.info(`📞 Twilio webhook: POST /twilio/voice`);
});

process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM – zamykam się');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('🛑 SIGINT – zamykam się');
  process.exit(0);
});
