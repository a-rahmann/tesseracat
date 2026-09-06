// test_omnibox_suggestions.mjs
import { OmniboxSuggestionService } from '../apps/desktop-browser/dist/services/omnibox-suggestions.js';

async function runTests() {
  console.log('Testing OmniboxSuggestionService...');
  const service = OmniboxSuggestionService.getInstance();

  // Test 1: Direct domain navigation
  console.log('\n--- Test 1: Direct Domain ("github.com") ---');
  const res1 = await service.getSuggestions('github.com');
  console.log('Results count:', res1.length);
  console.log('First result:', JSON.stringify(res1[0]));
  const hasNav = res1.some(r => r.type === 'NAVIGATION' && r.text.includes('github.com'));
  if (!hasNav) throw new Error('Direct domain test failed');
  console.log('✓ Direct domain navigation test passed');

  // Test 2: AI Action Command
  console.log('\n--- Test 2: AI Action Command ("play loser on youtube") ---');
  const res2 = await service.getSuggestions('play loser on youtube');
  console.log('Results count:', res2.length);
  console.log('First result:', JSON.stringify(res2[0]));
  const hasAi = res2.some(r => r.type === 'AI');
  if (!hasAi) throw new Error('AI command test failed');
  console.log('✓ AI action command test passed');

  // Test 3: Live Google Suggest Query
  console.log('\n--- Test 3: Live Google Suggest ("weather") ---');
  const res3 = await service.getSuggestions('weather');
  console.log('Results count:', res3.length);
  console.log('Sample suggestions:');
  res3.forEach((s, idx) => console.log(`  ${idx + 1}. [${s.type}] ${s.text} -> ${s.html}`));
  if (res3.length === 0) throw new Error('Live Google suggest returned 0 results');
  console.log('✓ Live Google Suggest test passed');

  // Test 4: Cache hit
  console.log('\n--- Test 4: Cache Hit ---');
  const start = Date.now();
  const res4 = await service.getSuggestions('weather');
  const duration = Date.now() - start;
  console.log(`Cache response in ${duration}ms (items: ${res4.length})`);
  if (duration > 15) throw new Error('Cache hit took too long');
  console.log('✓ Cache hit test passed');

  console.log('\nALL 4 OMNIBOX TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
