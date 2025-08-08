// routes/twilio.js
const express = require('express');
const twilio = require('twilio');
const logger = require('../utils/logger');
const openaiService = require('../services/openai');
const calendarService = require('../services/calendar');

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

/** Buduje absolutny URL do /tts na Twoim serwerze (Railway) */
function ttsUrl(req, text) {
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https');
  const base = `${proto}://${host}`;
  const maxLen = 700; // zabezpieczenie długości query
  const safe = (text || '').toString().trim().slice(0, maxLen);
  return `${base}/tts?text=${encodeURIComponent(safe)}`;
}

router.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const from = req.body.From;
  const to = req.body.To;

  logger.info(`Incoming call from ${from} to ${to}`);

  try {
    const welcome = `Dzień dobry! Tu Stomatologia Kraków, recepcja automatyczna.
Jestem tutaj, aby pomóc umówić wizytę albo udzielić informacji.
Proszę powiedzieć, w czym mogę pomóc?`;

    // Zamiast <Say> używamy <Play> z nagraniem TTS z Azure.
    const gather = twiml.gather({
      input: 'speech',
      language: 'pl-PL',
      timeout: 10,
      speechTimeout: 'auto',
      action: '/twilio/process-speech',
      method: 'POST',
      actionOnEmptyResult: true,
      // podpowiedzi dla ASR Twilio (pomaga rozpoznawaniu PL)
      hints: 'higienizacja, aparat, rentgen, wyrwanie zęba, nakładki, retencja, Kraków, termin, wizyta'
    });
    gather.play(ttsUrl(req, welcome));

    // Jeśli brak odpowiedzi, wróć do startu
    twiml.redirect('/twilio/voice');

  } catch (error) {
    logger.error('Error in voice webhook:', error);
    // Komunikat awaryjny też przez <Play>
    twiml.play(ttsUrl(req, 'Przepraszam, wystąpił błąd techniczny. Proszę zadzwonić ponownie.'));
  }

  res.type('text/xml').send(twiml.toString());
});

router.post('/process-speech', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult;
  const from = req.body.From;

  logger.info(`Speech received from ${from}: "${speechResult}"`);

  try {
    if (!speechResult) {
      twiml.play(ttsUrl(req, 'Nie usłyszałam wypowiedzi. Spróbujmy jeszcze raz.'));
      twiml.redirect('/twilio/voice');
      return res.type('text/xml').send(twiml.toString());
    }

    // Twoja logika AI (OpenAI)
    const aiResponse = await openaiService.processUserMessage(speechResult, from);

    if (aiResponse.action === 'book_appointment') {
      const availableSlots = await calendarService.getAvailableSlots();
      const responseText = `${aiResponse.message} Dostępne terminy to: ${availableSlots.join(', ')}. Który termin najbardziej pasuje?`;
      twiml.play(ttsUrl(req, responseText));

    } else if (aiResponse.action === 'provide_info') {
      twiml.play(ttsUrl(req, aiResponse.message));

    } else if (aiResponse.action === 'transfer_to_reception') {
      // Możesz spróbować realnego przełączenia:
      // twiml.play(ttsUrl(req, 'Łączę z recepcją. Proszę czekać.'));
      // twiml.dial('+48123456789'); // Wymaga włączonych połączeń wychodzących do PL na koncie Twilio
      // Fallback: powiedz numer i zakończ
      twiml.play(ttsUrl(req, 'Łączę z recepcją. Jeśli połączenie nie powiedzie się, proszę zanotować numer: +48 123 456 789.'));
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());

    } else {
      // Domyślna odpowiedź
      twiml.play(ttsUrl(req, aiResponse.message));
    }

    // Kontynuacja rozmowy – ponowne Gather z promptem PL
    const followUp = 'Czy mogę jeszcze w czymś pomóc?';
    const gather = twiml.gather({
      input: 'speech',
      language: 'pl-PL',
      timeout: 10,
      speechTimeout: 'auto',
      action: '/twilio/process-speech',
      method: 'POST',
      actionOnEmptyResult: true,
      hints: 'higienizacja, aparat, rentgen, wyrwanie zęba, nakładki, retencja, Kraków, termin, wizyta'
    });
    gather.play(ttsUrl(req, followUp));

  } catch (error) {
    logger.error('Error processing speech:', error);
    twiml.play(ttsUrl(req, 'Przepraszam, miałam problem ze zrozumieniem. Łączę z recepcją. Numer recepcji to +48 123 456 789.'));
  }

  res.type('text/xml').send(twiml.toString());
});

router.post('/status', (req, res) => {
  const callStatus = req.body.CallStatus;
  const from = req.body.From;
  const duration = req.body.CallDuration;

  logger.info(`Call from ${from} ended with status: ${callStatus}, duration: ${duration || 0}s`);
  res.sendStatus(200);
});

module.exports = router;
