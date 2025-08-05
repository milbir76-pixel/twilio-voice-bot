const { OpenAI } = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
Jesteś wirtualnym recepcjonistą głosowym dla kliniki stomatologicznej Stomatologia Kraków (Kraków, ul. Różowa 1).

Twoje zadania:
1. Prowadzić naturalną rozmowę wyłącznie po polsku
2. Udzielać informacji o:
   - adresie kliniki i godzinach otwarcia (pon.–pt. 10:00–20:00, sob. 10:00–15:00)
   - cenniku usług (wyrwanie zęba – 300 zł; rentgen – 100 zł; higienizacja – 700 zł; aparat stały – 3000 zł; nakładki aligner – 2000 zł; retencja – 500 zł)
   - możliwościach umawiania wizyt
3. Udzielać wskazówek dojazdu: najbliższy przystanek autobusowy to "Różowa 1" linii 6 i 13; w okolicy nie ma parkingu
4. Umawiać wizyty i powtarzać datę oraz godzinę wizyty, a także numer telefonu recepcji: +48 123 456 789
5. Jeśli nie znasz odpowiedzi, proponujesz kontakt z recepcją pod numerem +48 123 456 789

Ton i styl:
- Uprzejmy, profesjonalny, empatyczny
- Krótkie, rzeczowe zdania, bez żargonu medycznego
- Mów po polsku

WAŻNE: Na końcu każdej odpowiedzi dodaj jedną z akcji:
- "ACTION: provide_info" - gdy udzielasz informacji
- "ACTION: book_appointment" - gdy klient chce umówić wizytę  
- "ACTION: transfer_to_reception" - gdy nie możesz pomóc
`;

const conversationHistory = new Map();

async function processUserMessage(userMessage, phoneNumber) {
    try {
        logger.info(`Processing message from ${phoneNumber}: "${userMessage}"`);

        if (!conversationHistory.has(phoneNumber)) {
            conversationHistory.set(phoneNumber, []);
        }

        const history = conversationHistory.get(phoneNumber);
        history.push({ role: 'user', content: userMessage });

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-10)
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages,
            max_tokens: 200,
            temperature: 0.7
        });

        const assistantResponse = completion.choices[0].message.content;
        history.push({ role: 'assistant', content: assistantResponse });

        const actionMatch = assistantResponse.match(/ACTION: (\w+)/);
        const action = actionMatch ? actionMatch[1] : 'provide_info';
        const cleanResponse = assistantResponse.replace(/ACTION: \w+/g, '').trim();

        logger.info(`AI Response: "${cleanResponse}", Action: ${action}`);

        return {
            message: cleanResponse,
            action: action
        };

    } catch (error) {
        logger.error('Error in OpenAI processing:', error);
        return {
            message: 'Przepraszam, mam problem techniczny. Łączę Pana z recepcją.',
            action: 'transfer_to_reception'
        };
    }
}

function clearConversationHistory(phoneNumber) {
    if (conversationHistory.has(phoneNumber)) {
        conversationHistory.delete(phoneNumber);
        logger.info(`Cleared conversation history for ${phoneNumber}`);
    }
}

module.exports = {
    processUserMessage,
    clearConversationHistory
};