const express = require('express');
const twilio = require('twilio');
const logger = require('../utils/logger');
const openaiService = require('../services/openai');
const azureSpeechService = require('../services/azure-speech');
const calendarService = require('../services/calendar');

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

router.post('/voice', async (req, res) => {
    const twiml = new VoiceResponse();
    const from = req.body.From;
    const to = req.body.To;
    
    logger.info(`Incoming call from ${from} to ${to}`);

    try {
        const welcomeMessage = `Dzień dobry! Tu Stomatologia Kraków, recepcja automatyczna. 
        Jestem tutaj, żeby pomóc Panu lub Pani umówić wizytę. 
        Proszę powiedzieć, jak mogę pomóc?`;

        twiml.say(welcomeMessage, {
            voice: 'alice',
            language: 'pl-PL'
        });

        twiml.gather({
            input: 'speech',
            timeout: 10,
            speechTimeout: 'auto',
            language: 'pl-PL',
            action: '/twilio/process-speech',
            method: 'POST'
        });

        twiml.say('Przepraszam, nie słyszałem odpowiedzi. Spróbujmy ponownie.', {
            voice: 'alice',
            language: 'pl-PL'
        });

        twiml.redirect('/twilio/voice');

    } catch (error) {
        logger.error('Error in voice webhook:', error);
        twiml.say('Przepraszam, wystąpił błąd techniczny. Proszę zadzwonić ponownie.', {
            voice: 'alice',
            language: 'pl-PL'
        });
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

router.post('/process-speech', async (req, res) => {
    const twiml = new VoiceResponse();
    const speechResult = req.body.SpeechResult;
    const from = req.body.From;
    
    logger.info(`Speech received from ${from}: "${speechResult}"`);

    try {
        if (!speechResult) {
            twiml.say('Nie słyszałem Pana wypowiedzi. Proszę spróbować ponownie.', {
                voice: 'alice',
                language: 'pl-PL'
            });
            twiml.redirect('/twilio/voice');
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }

        const aiResponse = await openaiService.processUserMessage(speechResult, from);
        
        if (aiResponse.action === 'book_appointment') {
            const availableSlots = await calendarService.getAvailableSlots();
            const responseText = `${aiResponse.message} Dostępne terminy to: ${availableSlots.join(', ')}. Który termin Panu odpowiada?`;
            
            twiml.say(responseText, {
                voice: 'alice',
                language: 'pl-PL'
            });
        } else if (aiResponse.action === 'provide_info') {
            twiml.say(aiResponse.message, {
                voice: 'alice',
                language: 'pl-PL'
            });
        } else if (aiResponse.action === 'transfer_to_reception') {
            twiml.say('Łączę Pana z recepcją. Proszę czekać.', {
                voice: 'alice',
                language: 'pl-PL'
            });
            twiml.say('Numer recepcji to +48 123 456 789. Dziękuję za telefon.', {
                voice: 'alice',
                language: 'pl-PL'
            });
            twiml.hangup();
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        } else {
            twiml.say(aiResponse.message, {
                voice: 'alice',
                language: 'pl-PL'
            });
        }

        twiml.gather({
            input: 'speech',
            timeout: 10,
            speechTimeout: 'auto',
            language: 'pl-PL',
            action: '/twilio/process-speech',
            method: 'POST'
        });

        twiml.say('Czy mogę jeszcze w czymś pomóc?', {
            voice: 'alice',
            language: 'pl-PL'
        });

    } catch (error) {
        logger.error('Error processing speech:', error);
        twiml.say('Przepraszam, miałem problem ze zrozumieniem. Łączę z recepcją.', {
            voice: 'alice',
            language: 'pl-PL'
        });
        twiml.say('Numer recepcji to +48 123 456 789.', {
            voice: 'alice',
            language: 'pl-PL'
        });
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

router.post('/status', (req, res) => {
    const callStatus = req.body.CallStatus;
    const from = req.body.From;
    const duration = req.body.CallDuration;
    
    logger.info(`Call from ${from} ended with status: ${callStatus}, duration: ${duration}s`);
    res.sendStatus(200);
});

module.exports = router;