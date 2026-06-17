import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY is not defined in the environment variables. Call APIs may fail.');
}

// Initialize the Google Gen AI SDK client
const ai = new GoogleGenAI({ apiKey });

// Define active models from environment variables
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';

/**
 * Generate a dense vector embedding for the given text using Gemini.
 * @param {string} text - The input string to embed.
 * @returns {Promise<number[]>} - Float array representing the embedding vector.
 */
export async function generateEmbedding(text) {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });

    let vector = null;
    if (response.embedding) {
      vector = response.embedding.values;
    } else if (response.embeddings && response.embeddings.length > 0) {
      vector = response.embeddings[0].values;
    }

    if (!vector) {
      throw new Error('Failed to retrieve embedding values from response');
    }

    return vector;
  } catch (error) {
    console.error('Error generating embedding in geminiService:', error);
    throw error;
  }
}

/**
 * Call the OpenRouter chat completions API using native node fetch.
 * 
 * @param {Array<{role: string, content: string}>} messages - Prompts / history.
 * @returns {Promise<string>} - Text content response.
 */
async function callOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_GENERATION_MODEL || 'meta-llama/llama-3-8b-instruct:free';

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('Missing or placeholder OPENROUTER_API_KEY in environment variables.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5000',
        'X-Title': 'AI Knowledge Assistant RAG'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API responded with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('OpenRouter response returned empty content');
    }

    return content.trim();
  } catch (error) {
    console.error('Error during callOpenRouter:', error);
    throw error;
  }
}

/**
 * Rephrase a contextual user query using conversation history to make it a standalone search query.
 * Uses OpenRouter free model with a self-healing fallback to Gemini.
 * 
 * @param {Array<{role: string, content: string}>} history - Chat history.
 * @param {string} currentQuery - The user's latest follow-up question.
 * @returns {Promise<string>} - Standalone query.
 */
export async function rephraseQuery(history, currentQuery) {
  if (!history || history.length === 0) {
    return currentQuery;
  }

  // Format conversation history for prompt
  const formattedHistory = history
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const prompt = `Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone, self-contained question that contains all necessary context for retrieval. Do not answer the question, just rephrase it.

Conversation History:
${formattedHistory}

Follow-up Question: ${currentQuery}

Standalone Question:`;

  try {
    const messages = [{ role: 'user', content: prompt }];
    return await callOpenRouter(messages);
  } catch (openRouterError) {
    console.warn('OpenRouter query rephrase failed, attempting backup fallback using Gemini...', openRouterError.message);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text ? response.text.trim() : currentQuery;
    } catch (geminiError) {
      console.warn('OpenRouter and Gemini rephrase both failed, falling back to original query:', geminiError.message);
      return currentQuery;
    }
  }
}

/**
 * Call the OpenRouter chat completions API with streaming enabled.
 * Parses the incoming Server-Sent Events (SSE) chunks.
 * 
 * @param {Array<{role: string, content: string}>} messages - Prompts / history.
 * @param {Function} onChunk - Fired for every token delta.
 * @returns {Promise<string>} - The fully accumulated string.
 */
async function callOpenRouterStream(messages, onChunk) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_GENERATION_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    throw new Error('Missing or placeholder OPENROUTER_API_KEY in environment variables.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5000',
        'X-Title': 'AI Knowledge Assistant RAG'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter stream responded with status ${response.status}: ${errText}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';

    // Node.js native fetch supports async iteration directly over response.body
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Hold onto the last incomplete line

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;
        if (cleanLine === 'data: [DONE]') continue;

        if (cleanLine.startsWith('data: ')) {
          try {
            const jsonStr = cleanLine.substring(6);
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulatedText += delta;
              onChunk(delta);
            }
          } catch (e) {
            // Ignore JSON parse errors for chunk boundaries
          }
        }
      }
    }
    
    return accumulatedText;
  } catch (error) {
    console.error('Error during callOpenRouterStream:', error);
    throw error;
  }
}

/**
 * Generate response using a system instruction and user prompt.
 * Uses OpenRouter free model with a self-healing fallback to Gemini.
 * Supports streaming if onChunk callback is supplied.
 * 
 * @param {string} systemInstruction - Guide rules/persona for the LLM.
 * @param {string} prompt - Context combined with user query.
 * @param {Function} [onChunk] - Optional callback for streaming delta tokens.
 * @returns {Promise<string>} - The LLM's generated response.
 */
export async function generateResponse(systemInstruction, prompt, onChunk) {
  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt }
  ];

  if (onChunk) {
    // Streaming Flow
    try {
      return await callOpenRouterStream(messages, onChunk);
    } catch (openRouterError) {
      console.warn('OpenRouter streaming failed, attempting backup fallback using Gemini stream...', openRouterError.message);
      try {
        const responseStream = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
          },
        });
        
        let fullText = '';
        for await (const chunk of responseStream) {
          if (chunk.text) {
            onChunk(chunk.text);
            fullText += chunk.text;
          }
        }
        console.log('Successfully generated streaming answer using Gemini backup fallback!');
        return fullText;
      } catch (geminiError) {
        console.error('Both OpenRouter and Gemini backup streaming failed:', geminiError);
        throw new Error('All AI generation models are currently unavailable. Please try again in a few moments.');
      }
    }
  } else {
    // Blocking Non-Streaming Flow
    try {
      return await callOpenRouter(messages);
    } catch (openRouterError) {
      console.warn('OpenRouter generation failed, attempting backup fallback using Gemini...', openRouterError.message);
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
          },
        });
        
        const text = response.text ? response.text.trim() : '';
        if (!text) throw new Error('Gemini fallback returned empty text');
        console.log('Successfully generated answer using Gemini backup fallback!');
        return text;
      } catch (geminiError) {
        console.error('Both OpenRouter and Gemini backup fallback failed:', geminiError);
        throw new Error('All AI generation models are currently unavailable. Please try again in a few moments.');
      }
    }
  }
}
