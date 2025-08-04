const sdk = require('microsoft-cognitiveservices-speech-sdk');

const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY,
  process.env.AZURE_SPEECH_REGION
);
speechConfig.speechSynthesisVoiceName = 'pl-PL-MarekNeural';

function synthesizeSpeech(text) {
  return new Promise((resolve, reject) => {
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    synthesizer.speakTextAsync(
      text,
      result => {
        if (result.audioData) {
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error('Brak danych audio'));
        }
        synthesizer.close();
      },
      err => {
        synthesizer.close();
        reject(err);
      }
    );
  });
}

function recognizeSpeech(audioStream) {
  return new Promise((resolve, reject) => {
    const audioConfig = sdk.AudioConfig.fromStreamInput(audioStream);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    recognizer.recognizeOnceAsync(
      result => {
        recognizer.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text);
        } else {
          reject(new Error(`Recognition failed: ${result.reason}`));
        }
      },
      err => {
        recognizer.close();
        reject(err);
      }
    );
  });
}

module.exports = { synthesizeSpeech, recognizeSpeech };
