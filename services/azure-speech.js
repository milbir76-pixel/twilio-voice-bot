const sdk = require('microsoft-cognitiveservices-speech-sdk');
const logger = require('../utils/logger');

const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
);

speechConfig.speechRecognitionLanguage = 'pl-PL';
speechConfig.speechSynthesisVoiceName = 'en-US-JennyMultilingualNeural';

async function textToSpeech(text) {
    try {
        logger.info(`Converting text to speech: "${text.substring(0, 50)}..."`);

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

        return new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(
                text,
                result => {
                    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                        logger.info('Speech synthesis completed successfully');
                        synthesizer.close();
                        resolve(result.audioData);
                    } else {
                        logger.error('Speech synthesis failed:', result.errorDetails);
                        synthesizer.close();
                        reject(new Error(result.errorDetails));
                    }
                },
                error => {
                    logger.error('Speech synthesis error:', error);
                    synthesizer.close();
                    reject(error);
                }
            );
        });

    } catch (error) {
        logger.error('Error in textToSpeech:', error);
        throw error;
    }
}

async function speechToText(audioBuffer) {
    try {
        logger.info('Converting speech to text');

        const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        return new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(
                result => {
                    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                        logger.info(`Speech recognized: "${result.text}"`);
                        recognizer.close();
                        resolve(result.text);
                    } else if (result.reason === sdk.ResultReason.NoMatch) {
                        logger.warn('No speech could be recognized');
                        recognizer.close();
                        resolve('');
                    } else {
                        logger.error('Speech recognition failed:', result.errorDetails);
                        recognizer.close();
                        reject(new Error(result.errorDetails));
                    }
                },
                error => {
                    logger.error('Speech recognition error:', error);
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

function createSpeechRecognizer() {
    try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                logger.info(`Recognized: ${e.result.text}`);
            }
        };

        recognizer.canceled = (s, e) => {
            logger.error(`Recognition canceled: ${e.reason}`);
            if (e.reason === sdk.CancellationReason.Error) {
                logger.error(`Error details: ${e.errorDetails}`);
            }
            recognizer.stopContinuousRecognitionAsync();
        };

        recognizer.sessionStopped = (s, e) => {
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
                result => {
                    const polishVoices = result.voices.filter(voice => 
                        voice.locale.startsWith('pl-PL')
                    );
                    logger.info(`Found ${polishVoices.length} Polish voices`);
                    synthesizer.close();
                    resolve(polishVoices);
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
    getAvailableVoices
};