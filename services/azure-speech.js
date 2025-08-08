// services/azure-speech.js
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const logger = require('../utils/logger');

// --- Konfiguracja Azure ---
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

// Rozpoznawanie mowy po polsku (gdybyś używał STT z plików)
speechConfig.speechRecognitionLanguage = 'pl-PL';

// Domyślny głos: z ENV albo polski Agnieszka
const DEFAULT_VOICE = process.env.AZURE_VOICE_NAME || 'en-US-JennyMultilingualNeural';

speechConfig.speechSynthesisVoiceName = DEFAULT_VOICE;

// Format idealny pod połączenia telefoniczne/Twilio <Play>
speechConfig.speechSynthesisOutputFormat =
  sdk.SpeechSynthesisOutputFormat.Riff8Khz8BitMonoMULaw;

logger.info(`🗣️ Azure TTS voice: ${DEFAULT_VOICE}${process.env.AZURE_VOICE_NAME ? '' : ' (default)'}`);

// --- Prosty cache TTS (przyspiesza powtarzane kwestie) ---
const MAX_CACHE = 100;
const ttsCache = new Map();
function cacheKey(text, voice) { return `${voice}|${text}`; }
function setCache(key, buf) {
  ttsCache.set(key, buf);
  if (ttsCache.size > MAX_CACHE) {
    const first = ttsCache.keys().next().value;
    ttsCache.delete(first);
  }
}

// ===== Pomocnicze =====
function escapeXml(s = '') {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]));
}

/**
 * Buduje SSML z wymuszeniem polskiej fonetyki.
 * Dla głosów wielojęzycznych (Jenny/Dragon/Multilingual) owijamy tekst w <lang xml:lang="pl-PL">.
 */
function buildSSML(text, voice = DEFAULT_VOICE) {
  const safe = (text || '').toString().trim();
  const lang = 'pl-PL';
  const isMultilingual = /(multilingual|dragon|jenny)/i.test(voice);

  if (isMultilingual) {
    return `
<speak version="1.0" xml:lang="${lang}" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${voice}">
    <lang xml:lang="${lang}">
      <mstts:express-as style="assistant">
        <prosody rate="+0%" pitch="+0%">${escapeXml(safe)}</prosody>
      </mstts:express-as>
    </lang>
  </voice>
</speak>`;
  }

  // Zwykłe polskie głosy (Agnieszka/Marek/Zofia)
  return `
<speak version="1.0" xml:lang="${lang}">
  <voice name="${voice}">
    <prosody rate="+0%" pitch="+0%">${escapeXml(safe)}</prosody>
  </voice>
</speak>`;
}

// ===== TTS -> Buffer WAV 8kHz μ-law =====
async function textToSpeech(text, voiceName) {
  const voice = voiceName || DEFAULT_VOICE;
  const ssml = buildSSML(text, voice);
  const key = cacheKey(text, voice);

  if (ttsCache.has(key)) {
    logger.debug(`TTS cache HIT: ${key}`);
    return ttsCache.get(key);
  }

  logger.info(`TTS start voice=${voice} len=${(text || '').length}`);

  return new Promise((resolve, reject) => {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const buf = Buffer.from(result.audioData);
          setCache(key, buf);
          synthesizer.close();
          logger.info('TTS ok');
          resolve(buf);
        } else {
          const err = result.errorDetails || 'TTS unknown error';
          synthesizer.close();
          logger.error('TTS failed:', err);
          reject(new Error(err));
        }
      },
      error => {
        synthesizer.close();
        logger.error('TTS error:', error);
        reject(error);
      }
    );
  });
}

// ===== STT (jeśli będziesz używać Azure do transkrypcji plików) =====
async function speechToText(audioBuffer) {
  try {
    logger.info('STT: wav buffer -> text');
    const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        result => {
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            logger.info(`STT recognized: "${result.text}"`);
            recognizer.close();
            resolve(result.text);
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            logger.warn('STT: no match');
            recognizer.close();
            resolve('');
          } else {
            const err = result.errorDetails || 'STT failed';
            logger.error('STT failed:', err);
            recognizer.close();
            reject(new Error(err));
          }
        },
        error => {
          logger.error('STT error:', error);
          recognizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    logger.error('Error in speechToText:', error);
    throw error;
  }
}

// (opcjonalne – mikrofon lokalny; na serwerze zwykle nieużywane)
function createSpeechRecognizer() {
  try {
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    recognizer.recognized = (_, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        logger.info(`Recognized: ${e.result.text}`);
      }
    };
    recognizer.canceled = (_, e) => {
      logger.error(`Recognition canceled: ${e.reason}`);
      if (e.reason === sdk.CancellationReason.Error) {
        logger.error(`Error details: ${e.errorDetails}`);
      }
      recognizer.stopContinuousRecognitionAsync();
    };
    recognizer.sessionStopped = () => {
      logger.info('Session stopped');
      recognizer.stopContinuousRecognitionAsync();
    };

    return recognizer;
  } catch (error) {
    logger.error('Error creating speech recognizer:', error);
    throw error;
  }
}

// ===== Lista dostępnych polskich głosów (wersja kompatybilna z SDK) =====
async function getAvailableVoices() {
  try {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    return new Promise((resolve, reject) => {
      // Wersja bezparametrowa – działa w każdej wersji SDK
      synthesizer.getVoicesAsync(
        result => {
          if (!result || !result.voices) {
            synthesizer.close();
            return resolve([]);
          }
          const voices = result.voices.filter(v => v.locale?.startsWith('pl-PL'));
          logger.info(`Polish voices found: ${voices.length}`);
          synthesizer.close();
          resolve(voices);
        },
        error => {
          logger.error('Error getting voices:', error);
          synthesizer.close();
          reject(error);
        }
      );
    });
  } catch (error) {
    logger.error('Error in getAvailableVoices:', error);
    throw error;
  }
}

// ===== Pre-warm – nagrzewa cache najczęstszych fraz =====
async function prewarm(phrases = [], voice) {
  try {
    for (const p of phrases) {
      await textToSpeech(p, voice);
    }
    logger.info(`TTS prewarm done for ${phrases.length} phrase(s).`);
  } catch (e) {
    logger.warn('TTS prewarm error:', e);
  }
}

module.exports = {
  textToSpeech,
  speechToText,
  createSpeechRecognizer,
  getAvailableVoices,
  buildSSML,
  prewarm,
};
