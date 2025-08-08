// server.js

// 1️⃣ Załaduj .env zanim cokolwiek innego
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const twilioRoutes = require('./routes/twilio');
const logger = require('./utils/logger');
const azureTTS = require('./services/azure-speech'); // ⬅️ Azure TTS

const app = express();

// 🔒 Zaufaj proxy (Railway/Load balancer) – poprawne proto/host w req.*
app.set('trust proxy', true);

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

/**
 * 🔊 6️⃣ Endpoint TTS – zwraca audio/wav (8kHz μ-law) dla Twilio <Play>
 *    Użycie:  GET /tts?text=Twoj%20tekst  (opcjonalnie &voice=pl-PL-MarekNeural)
 */
app.get('/tts', async (req, res, next) => {
  try {
    const raw = (req.query.text ?? 'Dzień dobry!').toString();
    // ogranicz długość (bezpieczeństwo + szybszy TTS)
    const text = raw.trim().slice(0, 800);

    // opcjonalna zmiana głosu: ?voice=pl-PL-MarekNeural
    const voice = typeof req.query.voice === 'string' ? req.query.voice : undefined;

    const audioBuf = await azureTTS.textToSpeech(text, voice);

    res.set('Content-Type', 'audio/wav');
    res.set('Content-Disposition', 'inline; filename=tts.wav');
    // bez cache – każda odpowiedź może być inna
    res.set('Cache-Control', 'no-store, max-age=0');
    res.send(audioBuf);
  } catch (e) {
    logger.error('TTS endpoint error:', e);
    // nie wywalamy 500 bez treści – Twilio lepiej zareaguje na WAV z komunikatem
    try {
      const fallback = await azureTTS.textToSpeech('Przepraszam, wystąpił błąd techniczny.');
      res.set('Content-Type', 'audio/wav');
      res.set('Content-Disposition', 'inline; filename=tts.wav');
      res.set('Cache-Control', 'no-store, max-age=0');
      return res.send(fallback);
    } catch {
      return next(e);
    }
  }
});

// 7️⃣ Główna ścieżka dla Twilio – wszystkie /twilio/voice itd.
app.use('/twilio', twilioRoutes);

// 8️⃣ 404 – jeśli żaden powyższy route nie zadziałał
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// 9️⃣ Error handler – łapie wszystkie nieprzewidziane błędy
app.use((err, req, res, next) => {
  logger.error('❌ UNHANDLED ERROR:', err);
  res.status(500).json({
    status: 'error',
    message: 'Coś poszło nie tak!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 🔟 Start serwera
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
