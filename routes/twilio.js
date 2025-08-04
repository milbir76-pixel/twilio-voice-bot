const express = require('express');
const axios = require('axios');
const { VoiceResponse } = require('twilio').twiml;

const openaiService = require('../services/openai');
const azureSpeechService = require('../services/azure-speech');
const calendarService = require('../services/calendar');

const router = express.Router();

router.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: 'Polish-CentralEurope-Neural', language: 'pl-PL' },
    'Witaj w klinice Stomatologia Kraków. Proszę powiedzieć, jak mogę pomóc, a po sygnale zacznie się nagrywanie.'
  );
  twiml.record({
    action: `${process.env.BASE_URL}/twilio/record`,
    method: 'POST',
    maxLength: 10,
    playBeep: true
  });
  twiml.say('Nie otrzymałem żadnej odpowiedzi. Kończę połączenie. Do widzenia.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

router.post('/record', async (req, res) => {
  const recordingUrl = req.body.RecordingUrl + '.wav';
  const twiml = new VoiceResponse();

  try {
    const audioResp = await axios.get(recordingUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioResp.data);

    const userText = await azureSpeechService.recognizeSpeech(audioBuffer);

    const messages = [
      { role: 'system', content: `Jesteś recepcjonistą kliniki Stomatologia Kraków. Udzielaj informacji po polsku według ustalonego promptu.` },
      { role: 'user', content: userText }
    ];
    const botReply = await openaiService.getChatResponse(messages);

    const speechBuffer = await azureSpeechService.synthesizeSpeech(botReply);
    const base64 = speechBuffer.toString('base64');

    twiml.play({ loop: 1 }, `data:audio/wav;base64,${base64}`);
    twiml.hangup();
  } catch (err) {
    twiml.say(
      'Przepraszam, wystąpił błąd podczas obsługi rozmowy. Proszę skontaktować się z recepcją pod numerem +48 123 456 789.'
    );
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

module.exports = router;
