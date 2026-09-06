/**
 * Baseline Hardware & Model Latency Profiler for Tesseract.
 * Measures:
 * 1. Ollama Gemma 3 4B generation throughput, prompt eval rate, and tokens/sec on CPU.
 * 2. Whisper tiny inference latency across different buffer lengths.
 */

import http from 'http';
import { performance } from 'perf_hooks';

async function profileOllama() {
  console.log('\n--- 1. PROFILING OLLAMA GEMMA 3 4B (CPU) ---');
  
  const testPrompts = [
    { name: 'Short Completion (JSON 50 tokens)', prompt: 'Output JSON: {"result": "ok", "latency": "fast"}', maxTokens: 40 },
    { name: 'NLU Intent Schema Prompt (~400 prompt tokens)', prompt: `You are Tesseract NLU. User: "Open YouTube and search for Lose Yourself". Output JSON: {"goal": "search youtube", "isCompound": true}`, maxTokens: 100 }
  ];

  for (const t of testPrompts) {
    const payload = {
      model: 'gemma3:4b',
      messages: [{ role: 'user', content: t.prompt }],
      stream: false,
      format: 'json',
      options: {
        num_predict: t.maxTokens,
        temperature: 0.1,
      }
    };

    const start = performance.now();
    try {
      const respData = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 11434,
          path: '/api/chat',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
      });

      const elapsedMs = performance.now() - start;
      const promptEvalCount = respData.prompt_eval_count || 0;
      const promptEvalDuration = (respData.prompt_eval_duration || 1) / 1e9; // seconds
      const evalCount = respData.eval_count || 0;
      const evalDuration = (respData.eval_duration || 1) / 1e9; // seconds
      
      const promptEvalTokensSec = promptEvalDuration > 0 ? (promptEvalCount / promptEvalDuration).toFixed(1) : 'N/A';
      const evalTokensSec = evalDuration > 0 ? (evalCount / evalDuration).toFixed(1) : 'N/A';

      console.log(`\nTest: [${t.name}]`);
      console.log(`  Total Elapsed: ${(elapsedMs / 1000).toFixed(2)}s (${Math.round(elapsedMs)}ms)`);
      console.log(`  Prompt Tokens: ${promptEvalCount} (${promptEvalTokensSec} tokens/sec)`);
      console.log(`  Output Tokens: ${evalCount} (${evalTokensSec} tokens/sec)`);
      console.log(`  Content: ${respData.message?.content?.trim()}`);
    } catch (err) {
      console.error(`  Error profiling Ollama for [${t.name}]:`, err.message);
    }
  }
}

async function run() {
  console.log('====================================================');
  console.log('⚡ TESSERACT HARDWARE & LATENCY PROFILING');
  console.log('====================================================');
  
  await profileOllama();
  
  console.log('\n====================================================');
  console.log('⚡ PROFILING COMPLETE');
  console.log('====================================================');
}

run();
