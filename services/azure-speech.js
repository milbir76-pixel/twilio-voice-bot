// services/azure-speech.js
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const logger = require('../utils/logger');

const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

// ASR (rozpoznawanie) po polsku
speechConfig.speechRecognitionLanguage = 'pl-PL';

// TTS – natywny polski głos neural (zmienisz ENV AZURE_VOICE_NAME)
const DEFAULT_VOICE = process.env.AZURE_VOICE_NAME || 'pl-PL-AgnieszkaNeural';
speechConfig.speechSynthesisVoiceName = DEFAULT_VOICE;

// Format idealny pod telefon/Twilio <Play>
speechConfig.speechSynthesisOutputFormat =
  sdk.SpeechSynthesisOutputFormat.Riff8Khz8BitMonoMULaw;

// --- prosty cache TTS, żeby było szybciej ---
const MAX_CACHE = 100;
const ttsCache = new Map();
function cacheKey(text, voice) { return `${voice || DEFAULT_VOICE}|${text}`; }
function setCache(key, buf) {
  ttsCache.set(key, buf);
  if (ttsCache.size > MAX_CACHE) {
    const firstKey = ttsCache.keys().next().value;
    ttsCache.delete(firstKey);
  }
}

// ===== SSML =====
function escapeXml(s = '') {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]));
}

function buildSSML(text, voice = DEFAULT_VOICE) {
  const safe = (text || '').toString().trim();
  return `
<speak version="1.0" xml:lang="pl-PL">
  <voice name="${voice}">
    <prosody rate="+0%" pitch="+0%">
      ${escapeXml(safe)}
    </prosody>
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
          logger.info('TTS ok');
          const buf = Buffer.from(result.audioData);
          setCache(key, buf);
          synthesizer.close();
          resolve(buf);
        } else {
          const err = result.errorDetails || 'TTS unknown error';
          logger.error('TTS failed:', err);
          synthesizer.close();
          reject(new Error(err));
        }
      },
      error => {
        logger.error('TTS error:', error);
        synthesizer.close();
        reject(error);
      }
    );
  });
}

// ===== STT (jeśli kiedyś będziesz używać Azure STT z pliku) =====
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

// (opcjonalne – mikrofon lokalny; na serwerze raczej nieużywane)
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

async function getAvailableVoices() {
  try {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    return new Promise((resolve, reject) => {
      synthesizer.getVoicesAsync(
        'pl-PL',
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

// Pre-warm – nagrzewa cache najczęstszych fraz
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
