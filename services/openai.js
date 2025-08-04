const { Configuration, OpenAIApi } = require('openai');

const conf = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const client = new OpenAIApi(conf);

// messages: [{ role: 'system'|'user'|'assistant', content: '...' }, ...]
async function getChatResponse(messages) {
  const res = await client.createChatCompletion({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.2
  });
  return res.data.choices[0].message.content;
}

module.exports = { getChatResponse };
