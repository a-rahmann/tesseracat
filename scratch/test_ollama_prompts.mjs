// Test Ollama Gemma 3 4B structured output directly
const baseUrl = 'http://localhost:11434';
const model = 'gemma3:4b';

async function testPrompt(title, systemPrompt, userPrompt, schemaDesc) {
  console.log(`\n=== Testing: ${title} ===`);
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: `${systemPrompt}\nCRITICAL REQUIREMENT: Output MUST be valid JSON conforming exactly to this specification:\n${schemaDesc}\nDO NOT wrap in conversational preamble. Output ONLY the JSON block.`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    stream: false,
    options: {
      temperature: 0.1,
      num_predict: 500,
    }
  };

  const start = Date.now();
  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - start;
    if (!resp.ok) {
      console.error(`HTTP error ${resp.status}: ${await resp.text()}`);
      return;
    }

    const json = await resp.json();
    const content = json.message?.content || '';
    console.log(`Response time: ${elapsed}ms (${(elapsed/1000).toFixed(2)}s)`);
    console.log(`Raw Content:\n${content.slice(0, 300)}...`);

    // Test JSON parsing
    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log(`Parsed JSON successfully:`, Object.keys(parsed));
  } catch (err) {
    console.error(`Error after ${Date.now() - start}ms:`, {
      name: err.name,
      message: err.message,
      cause: err.cause
    });
  }
}

async function main() {
  // 1. Test NLU prompt
  await testPrompt(
    'NLU Interpretation',
    'You are Tesseract autonomous NLU interpreter.',
    'User utterance: "Open Instagram and check whether Rahul messaged me"\nActive URL: about:blank',
    '{"goal": string, "intentCategory": string, "isCompound": boolean, "subTasks": string[]}'
  );

  // 2. Test Planner prompt
  await testPrompt(
    'Planner Synthesis',
    'You are Tesseract planner.',
    'Goal: "Search Wikipedia for Quantum Computing"\nURL: https://en.wikipedia.org',
    '{"steps": [{"stepNumber": 1, "description": string, "toolName": string}]}'
  );

  // 3. Test ActionLoop reasoning prompt
  await testPrompt(
    'ActionLoop Decision',
    'You are Tesseract action decision loop.',
    'Goal: "Search Wikipedia"\nURL: https://en.wikipedia.org\nVisible elements: [1] input "search", [2] button "Go"',
    '{"thought": string, "tool": string, "arguments": object, "isFinalStep": boolean}'
  );
}

main();
