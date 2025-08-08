// services/azure-speech.js
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const logger = require('../utils/logger');

const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);

// ASR (rozpoznawanie) po polsku
speechConfig.speechRecognitionLanguage = 'pl-PL';

// TTS – domyślnie NATYWNY polski głos neural.
// Możesz nadpisać przez AZURE_VOICE_NAME w env.
const DEFAULT_VOICE = process.env.AZURE_VOICE_NAME || 'pl-PL-AgnieszkaNeural';
speechConfig.speechSynthesisVoiceName = DEFAULT_VOICE;

// Najlepszy format pod telefon/Twilio <Play>
speechConfig.speechSynthesisOutputFormat =
  sdk.SpeechSynthesisOutputFormat.Riff8Khz8BitMonoMULaw;

// ===== TTS =====
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

/**
 * Zamienia tekst na audio (WAV RIFF 8kHz μ-law) – idealne do Twilio <Play>.
 * Zwraca Buffer.
 */
async function textToSpeech(text, voiceName) {
  const ssml = buildSSML(text, voiceName || DEFAULT_VOICE);
  logger.info(`TTS start voice=${voiceName || DEFAULT_VOICE} len=${(text || '').length}`);

  return new Promise((resolve, reject) => {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          logger.info('TTS ok');
          const buf = Buffer.from(result.audioData);
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

// ===== STT (jeśli będziesz używać Azure do rozpoznawania nagrań) =====
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

// (opcjonalne dla lokalnych testów z mikrofonu – na serwerze zazwyczaj nieużywane)
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
      // Poproś bezpośrednio o polskie głosy – mniej danych
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

module.exports = {
  textToSpeech,
  speechToText,
  createSpeechRecognizer,
  getAvailableVoices,
  buildSSML,
};
